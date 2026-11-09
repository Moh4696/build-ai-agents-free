"""AI Clone pipeline, Blotato-free.
script(1 LLM call) -> heygen(create+poll) -> download -> post{yt,ig,tiktok} -> ledger.

Platform failures are isolated: one platform failing never blocks the others.
Double-posting is prevented via retry mode -- if a run ends with failures, run:

    python pipeline.py --retry

Retry reuses the saved video URL from the ledger (no new script, no new HeyGen
credits) and re-posts ONLY the platforms that failed. Platforms already marked
OK are skipped.
"""
import os
import sys
import json
import tempfile
from datetime import datetime, timezone

from dotenv import load_dotenv
load_dotenv()

import script_gen, heygen, post_youtube, post_instagram, post_tiktok

LEDGER = "posted.json"
REQUIRED_KEYS = ("title", "script", "caption")
PLATFORMS = ("youtube", "instagram", "tiktok")


# ---------- ledger (crash-safe) ----------

def load_ledger():
    """Read the ledger. Missing file -> []. Corrupt file -> backed up, then []."""
    if not os.path.exists(LEDGER):
        return []
    try:
        with open(LEDGER) as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except (json.JSONDecodeError, OSError):
        backup = LEDGER + ".corrupt"
        try:
            os.replace(LEDGER, backup)
            print(f"  WARNING: ledger unreadable -- moved to {backup}, starting fresh")
        except OSError:
            print("  WARNING: ledger unreadable and backup failed -- starting fresh")
        return []


def save_ledger(log):
    """Atomic write (temp file + rename) so a crash mid-write can't corrupt the ledger."""
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(os.path.abspath(LEDGER)),
                               prefix="posted_", suffix=".tmp")
    try:
        with os.fdopen(fd, "w") as f:
            json.dump(log, f, indent=2)
        os.replace(tmp, LEDGER)
    except BaseException:
        if os.path.exists(tmp):
            os.remove(tmp)
        raise


# ---------- posting ----------

def post_all(local, url, title, caption, prior=None):
    """Post to each platform, isolating failures.

    prior: results dict from an earlier run. Platforms already 'OK' are skipped
    (this is the double-post guard). Returns {platform: 'OK ...' | 'FAIL ...'}.
    """
    prior = prior or {}
    jobs = {
        "youtube":   lambda: post_youtube.post(local, title, caption),
        "instagram": lambda: post_instagram.post(url, caption),  # IG ingests the public HeyGen URL
        "tiktok":    lambda: post_tiktok.post(local, caption),
    }
    results = {}
    for name, job in jobs.items():
        if str(prior.get(name, "")).startswith("OK"):
            results[name] = prior[name]
            print(f"  {name}: already posted -- skipped")
            continue
        try:
            out = job()  # post modules may return an ID/URL or nothing
            results[name] = "OK" if out is None else f"OK {out}"
        except Exception as e:
            results[name] = f"FAIL {type(e).__name__}: {e}"
        print(f"  {name}: {results[name]}")
    return results


def _report(results):
    fails = [p for p, r in results.items() if str(r).startswith("FAIL")]
    if fails:
        print(f"done -- {len(fails)} platform(s) failed ({', '.join(fails)}); "
              f"re-run failed posts with: python pipeline.py --retry")
    else:
        print("done -- all platforms posted")


# ---------- runs ----------

def main(topic=None):
    print("[1/4] script")
    content = script_gen.generate(topic)
    missing = [k for k in REQUIRED_KEYS if not (content or {}).get(k)]
    if missing:
        sys.exit(f"ERROR: script_gen output missing keys: {missing}")
    print(f"  title: {content['title']}")

    print("[2/4] heygen")
    vid = heygen.create_video(content["script"], content["title"])
    url = heygen.wait_for_video(vid)
    local = heygen.download(url, f"out_{vid}.mp4")

    print("[3/4] posting")
    results = post_all(local, url, content["title"], content["caption"])

    print("[4/4] ledger")
    log = load_ledger()
    log.append({
        "ts": datetime.now(timezone.utc).isoformat(),
        "video_id": vid,
        "title": content["title"],
        "caption": content["caption"],  # saved so --retry can reuse it
        "url": url,
        "results": results,
    })
    save_ledger(log)
    _report(results)


def retry_last():
    """Re-post only the failed platforms of the most recent run. Skips OK ones."""
    log = load_ledger()
    if not log:
        sys.exit("ledger empty -- nothing to retry")
    entry = log[-1]

    # Support both schemas: new ({"results": {...}}) and old (platforms at top level).
    results = entry.get("results") or {p: entry[p] for p in PLATFORMS if p in entry}
    fails = [p for p, r in results.items() if str(r).startswith("FAIL")]
    if not fails:
        sys.exit("last run has no failures -- nothing to retry")

    caption = entry.get("caption", "")
    if not caption:
        print("  WARNING: no caption saved in ledger entry -- retrying with empty caption")

    print(f"retrying {', '.join(fails)} for: {entry['title']}")
    # Note: HeyGen download URLs are signed and expire after some days.
    # If this download fails, the video must be regenerated (normal run).
    local = heygen.download(entry["url"], f"out_{entry['video_id']}.mp4")

    entry["results"] = post_all(local, entry["url"], entry["title"], caption, prior=results)
    for p in PLATFORMS:          # clean up old-schema top-level keys, if any
        entry.pop(p, None)
    entry["retried_ts"] = datetime.now(timezone.utc).isoformat()
    save_ledger(log)
    _report(entry["results"])


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--retry":
        retry_last()
    else:
        main(sys.argv[1] if len(sys.argv) > 1 else None)
