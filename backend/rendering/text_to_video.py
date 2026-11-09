#!/usr/bin/env python3
"""
text_to_video.py — ONE-SHOT text-to-video. Spec JSON in, finished MP4 out.

This is the front door of the skill. Give it a spec describing the scenes
(and optionally durations, a voiceover, a theme) and it renders the scenes and
assembles the MP4 in a single call.

SPEC FORMAT (JSON):
{
  "theme": {"accent": "#b87a10", "accent_hi": "#d4a017"},   // optional
  "durations": [7, 9, 9, 4, 6, 6, 5, 7, 12, 10, 5],         // optional, 1 per card
  "voiceover": "/path/vo.wav",                               // optional; overrides durations (sync mode)
  "tail": [6, 5],                                            // optional; scenes after VO coverage
  "cards": [ { "type": "hook", ... }, { "type": "fact", ... }, ... ]
}

If neither "durations" nor "voiceover" is given, scenes default to ~4s each.

USAGE:
  python text_to_video.py spec.json out.mp4
  python text_to_video.py spec.json out.mp4 --workdir /tmp/myreel

See build_scenes.py docstring for the full card-type catalog and fields.
"""
import os, sys, json, argparse, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build_scenes  # noqa

def main():
    ap = argparse.ArgumentParser(description="Text (spec JSON) -> typographic Reel MP4.")
    ap.add_argument("spec", help="path to spec JSON")
    ap.add_argument("out", help="output mp4 path")
    ap.add_argument("--workdir", default="/tmp/reel_work")
    ap.add_argument("--scenes-dir", default=None, help="where to write scene PNGs")
    args = ap.parse_args()

    with open(args.spec) as f:
        spec = json.load(f)

    scenes_dir = args.scenes_dir or os.path.join(args.workdir, "scenes")
    os.makedirs(args.workdir, exist_ok=True)

    # 1) Render scenes from the spec
    theme = spec.get("theme")
    cards = spec["cards"] if isinstance(spec, dict) else spec
    print(f"[1/2] Rendering {len(cards)} scenes -> {scenes_dir}")
    build_scenes.render_spec(cards, scenes_dir, theme=theme)

    # 2) Assemble MP4
    print(f"[2/2] Assembling MP4 -> {args.out}")
    cmd = ["python3", os.path.join(HERE, "assemble_reel.py"),
           "--scenes", scenes_dir, "--out", args.out, "--workdir", args.workdir]
    vo = spec.get("voiceover")
    if vo:
        cmd += ["--vo", vo]
        if spec.get("tail"):
            cmd += ["--tail", ",".join(str(x) for x in spec["tail"])]
    elif spec.get("durations"):
        cmd += ["--durs", ",".join(str(x) for x in spec["durations"])]
    r = subprocess.run(cmd)
    if r.returncode != 0:
        raise SystemExit("assembly failed")
    print(f"\nDONE -> {args.out}")
    print("Verify: check duration, audio levels, and view 2-3 extracted frames before delivering.")

if __name__ == "__main__":
    main()
