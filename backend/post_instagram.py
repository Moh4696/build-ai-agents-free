"""
Instagram Reels publishing via Meta Graph API v18.
Two-step process: create media container → publish.
Requires: INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_ACCOUNT_ID
"""
import os
import time
import requests

BASE_URL = "https://graph.facebook.com/v18.0"

# Instagram needs the video accessible via a public URL, not a local file path.
# For production, upload to a CDN or S3 first and pass the public URL here.


def _auth_params(access_token: str) -> dict:
    return {"access_token": access_token}


def _wait_for_container(creation_id: str, access_token: str, timeout_s: int = 120) -> None:
    """Poll until the media container is FINISHED processing."""
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        resp = requests.get(
            f"{BASE_URL}/{creation_id}",
            params={**_auth_params(access_token), "fields": "status_code"},
            timeout=30,
        )
        resp.raise_for_status()
        status = resp.json().get("status_code", "")
        if status == "FINISHED":
            return
        if status == "ERROR":
            raise RuntimeError(f"Instagram media container error for {creation_id}")
        time.sleep(10)
    raise TimeoutError(f"Instagram container {creation_id} not ready after {timeout_s}s")


def post_reel(video_url: str, caption: str, account_id: str, access_token: str) -> dict:
    """
    Upload a Reel to Instagram.

    Args:
        video_url: Publicly accessible HTTPS URL to the MP4 file.
        caption: Post caption (include hashtags here).
        account_id: Instagram Business account ID.
        access_token: Long-lived page access token.

    Returns:
        {"id": "<post_id>"} on success.
    """
    # Step 1: Create media container
    resp = requests.post(
        f"{BASE_URL}/{account_id}/media",
        data={
            "media_type": "REELS",
            "video_url": video_url,
            "caption": caption,
            "share_to_feed": "true",
            **_auth_params(access_token),
        },
        timeout=60,
    )
    resp.raise_for_status()
    creation_id = resp.json()["id"]

    # Step 2: Poll until container is ready
    _wait_for_container(creation_id, access_token)

    # Step 3: Publish
    pub_resp = requests.post(
        f"{BASE_URL}/{account_id}/media_publish",
        data={"creation_id": creation_id, **_auth_params(access_token)},
        timeout=30,
    )
    pub_resp.raise_for_status()
    return pub_resp.json()


def post(video_url: str, title: str, caption: str) -> str:
    """Convenience wrapper matching the post_youtube.post() signature."""
    access_token = os.environ["INSTAGRAM_ACCESS_TOKEN"]
    account_id = os.environ["INSTAGRAM_ACCOUNT_ID"]
    result = post_reel(video_url, f"{caption}", account_id, access_token)
    return f"https://www.instagram.com/p/{result.get('id', 'unknown')}/"
