"""
Publisher Node — dispatches to platform posting modules after human approval.
Isolates platform failures so one failure doesn't block others.
"""
import os
from datetime import datetime, timezone

from backend.agents.state import VideoProductionState
from backend.app.storage import update_job_status


def publisher_node(state: VideoProductionState) -> dict:
    """Post the approved video to the selected platform."""
    job_id = state["job_id"]
    platform = state["platform"]
    video_path = state.get("video_path", "")
    title = state.get("hook", state.get("topic", "Video"))[:90]
    caption = state.get("caption", "")
    hashtags = state.get("hashtags", [])

    update_job_status(job_id, "publishing")

    publish_results = {}

    if platform == "youtube":
        try:
            from backend.post_youtube import post
            url = post(video_path, title, caption)
            publish_results["youtube"] = url
        except Exception as e:
            publish_results["youtube"] = f"ERROR: {e}"

    elif platform == "instagram":
        try:
            from backend.post_instagram import post_reel
            access_token = os.getenv("INSTAGRAM_ACCESS_TOKEN", "")
            account_id = os.getenv("INSTAGRAM_ACCOUNT_ID", "")
            if not access_token or not account_id:
                raise ValueError("INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_ACCOUNT_ID must be set")
            caption_with_tags = f"{caption}\n\n{' '.join(hashtags)}"
            result = post_reel(video_path, caption_with_tags, account_id, access_token)
            publish_results["instagram"] = f"Posted: ID {result.get('id', 'unknown')}"
        except Exception as e:
            publish_results["instagram"] = f"ERROR: {e}"

    elif platform == "tiktok":
        try:
            from backend.post_tiktok import post_video
            result = post_video(video_path, title, caption)
            publish_results["tiktok"] = f"Posted: publish_id {result.get('publish_id', 'unknown')}"
        except Exception as e:
            publish_results["tiktok"] = f"ERROR: {e}"

    has_error = any("ERROR:" in str(v) for v in publish_results.values())
    final_status = "publish_failed" if has_error else "published"

    update_job_status(job_id, final_status, {
        "publish_results": publish_results,
        "completed_at": datetime.now(timezone.utc).isoformat(),
    })

    return {
        "job_status": final_status,
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }
