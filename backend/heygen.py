"""HeyGen: create avatar video, poll to completion, return public video_url.
Same logic as the heygen-reels MCP server, no MCP host needed."""
import os, json, time, urllib.request

API = "https://api.heygen.com"

def _req(method, path, body=None):
    req = urllib.request.Request(
        API + path,
        data=json.dumps(body).encode() if body else None,
        headers={"X-Api-Key": os.environ["HEYGEN_API_KEY"], "Content-Type": "application/json"},
        method=method,
    )
    return json.loads(urllib.request.urlopen(req, timeout=60).read())

def create_video(script: str, title: str) -> str:
    body = {
        "title": title,
        "caption": False,
        "dimension": {"width": 720, "height": 1280},
        "video_inputs": [{
            "character": {"type": "avatar", "avatar_id": os.environ["HEYGEN_AVATAR_ID"],
                          "avatar_style": "normal", "scale": 1},
            "voice": {"type": "text", "voice_id": os.environ["HEYGEN_VOICE_ID"],
                      "input_text": script, "speed": 1},
        }],
    }
    return _req("POST", "/v2/video/generate", body)["data"]["video_id"]

def wait_for_video(video_id: str, timeout_s: int = 1200, interval_s: int = 20) -> str:
    """Poll until completed. Returns video_url. Raises on failure/timeout."""
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        d = _req("GET", f"/v1/video_status.get?video_id={video_id}")["data"]
        status = d["status"]
        if status == "completed":
            return d["video_url"]
        if status == "failed":
            raise RuntimeError(f"HeyGen failed: {d.get('error')}")
        print(f"  heygen: {status}, retry in {interval_s}s")
        time.sleep(interval_s)
    raise TimeoutError(f"HeyGen video {video_id} not done in {timeout_s}s")

def download(url: str, path: str) -> str:
    urllib.request.urlretrieve(url, path)
    return path
