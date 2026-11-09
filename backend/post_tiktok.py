"""
TikTok video publishing via TikTok Content Posting API v2.
Three-step process: init upload → PUT bytes → poll status.
Requires: TIKTOK_ACCESS_TOKEN
"""
import os
import time
import requests

TIKTOK_API_BASE = "https://open.tiktokapis.com/v2"


def _auth_headers(access_token: str) -> dict:
    return {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json; charset=UTF-8",
    }


def _poll_publish_status(publish_id: str, access_token: str, timeout_s: int = 300) -> dict:
    """Poll TikTok until the video is processed."""
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        resp = requests.post(
            f"{TIKTOK_API_BASE}/post/publish/status/fetch/",
            headers=_auth_headers(access_token),
            json={"publish_id": publish_id},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json().get("data", {})
        status = data.get("status", "")
        if status == "PUBLISH_COMPLETE":
            return data
        if status in ("FAILED", "PUBLISH_FAILED"):
            fail_reason = data.get("fail_reason", "unknown")
            raise RuntimeError(f"TikTok publish failed: {fail_reason}")
        time.sleep(10)
    raise TimeoutError(f"TikTok publish {publish_id} not complete in {timeout_s}s")


def post_video(
    video_path: str,
    title: str,
    description: str,
    privacy: str = "PUBLIC_TO_EVERYONE",
    disable_duet: bool = False,
    disable_stitch: bool = False,
) -> dict:
    """
    Upload and publish a video to TikTok.

    Args:
        video_path: Local path to the MP4 file.
        title: Video title (max 150 chars).
        description: Video description/caption.
        privacy: "PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "SELF_ONLY"
        disable_duet: Disable duet feature (keep False for engagement).
        disable_stitch: Disable stitch feature (keep False for engagement).

    Returns:
        TikTok status data dict with publish_id.
    """
    access_token = os.environ["TIKTOK_ACCESS_TOKEN"]
    file_size = os.path.getsize(video_path)
    chunk_size = min(file_size, 64 * 1024 * 1024)  # 64MB max chunk

    # Step 1: Initialize upload session
    init_resp = requests.post(
        f"{TIKTOK_API_BASE}/post/publish/video/init/",
        headers=_auth_headers(access_token),
        json={
            "post_info": {
                "title": title[:150],
                "privacy_level": privacy,
                "disable_duet": disable_duet,
                "disable_stitch": disable_stitch,
                "disable_comment": False,
                "video_cover_timestamp_ms": 1000,
            },
            "source_info": {
                "source": "FILE_UPLOAD",
                "video_size": file_size,
                "chunk_size": chunk_size,
                "total_chunk_count": 1,
            },
        },
        timeout=30,
    )
    init_resp.raise_for_status()
    init_data = init_resp.json().get("data", {})
    upload_url = init_data["upload_url"]
    publish_id = init_data["publish_id"]

    # Step 2: Upload file bytes
    with open(video_path, "rb") as f:
        upload_resp = requests.put(
            upload_url,
            data=f,
            headers={
                "Content-Type": "video/mp4",
                "Content-Range": f"bytes 0-{file_size - 1}/{file_size}",
                "Content-Length": str(file_size),
            },
            timeout=300,
        )
    upload_resp.raise_for_status()

    # Step 3: Poll for completion
    return _poll_publish_status(publish_id, access_token)


def post(video_path: str, title: str, caption: str) -> str:
    """Convenience wrapper matching the post_youtube.post() signature."""
    result = post_video(video_path, title, caption)
    return f"TikTok published: publish_id={result.get('publish_id', 'unknown')}"
