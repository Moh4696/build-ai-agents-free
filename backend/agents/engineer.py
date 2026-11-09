"""
Engineer Agent — calls the video generation APIs in sequence:
script_gen → HeyGen create → HeyGen poll → download.
Writes progress to disk so the frontend can show granular status.
"""
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from backend.agents.state import VideoProductionState
from backend.app.config import JOBS_DIR
from backend.app.storage import update_job_status


def _video_dir(job_id: str) -> Path:
    d = JOBS_DIR / job_id / "video"
    d.mkdir(parents=True, exist_ok=True)
    return d


def run_engineer(state: VideoProductionState) -> dict:
    """
    Run the Engineer pipeline:
    1. Use the Designer's script directly (skip script_gen since Designer already wrote it)
    2. Submit to HeyGen
    3. Poll until complete
    4. Download locally
    """
    job_id = state["job_id"]
    script = state.get("script", "")
    title = state.get("hook", state["topic"])[:90]

    errors = list(state.get("errors", []))
    reports = list(state.get("agent_reports", []))

    # ── Check for mock/dev mode (no HeyGen key) ──────────────────────────────
    heygen_key = os.getenv("HEYGEN_API_KEY", "")
    if not heygen_key or heygen_key == "your_heygen_key_here":
        # Mock mode: return plausible metadata without calling HeyGen
        return _mock_engineer(state, reports)

    # ── Step 1: Submit to HeyGen ──────────────────────────────────────────────
    try:
        update_job_status(job_id, "generating_video", {"step": "submitting_to_heygen"})
        from backend import heygen
        video_id = heygen.create_video(script, title)
    except Exception as e:
        errors.append({"agent": "engineer", "error": f"HeyGen create failed: {e}", "timestamp": datetime.now(timezone.utc).isoformat()})
        return {"errors": errors, "job_status": "failed"}

    # ── Step 2: Poll until complete ───────────────────────────────────────────
    try:
        update_job_status(job_id, "generating_video", {"step": "rendering", "heygen_video_id": video_id})
        video_url = heygen.wait_for_video(video_id, timeout_s=600, interval_s=30)
    except Exception as e:
        errors.append({"agent": "engineer", "error": f"HeyGen poll failed: {e}", "timestamp": datetime.now(timezone.utc).isoformat()})
        return {"errors": errors, "job_status": "failed"}

    # ── Step 3: Download ──────────────────────────────────────────────────────
    try:
        update_job_status(job_id, "downloading")
        video_path = str(_video_dir(job_id) / "output.mp4")
        heygen.download(video_url, video_path)
        stat = os.stat(video_path)
        size_mb = round(stat.st_size / (1024 * 1024), 2)
    except Exception as e:
        errors.append({"agent": "engineer", "error": f"Download failed: {e}", "timestamp": datetime.now(timezone.utc).isoformat()})
        return {"errors": errors, "job_status": "failed"}

    technical_metadata = {
        "width": 720,
        "height": 1280,
        "size_mb": size_mb,
        "duration_s": len(script.split()) / 2.5,  # ~2.5 words/sec estimate
        "heygen_video_id": video_id,
    }

    report = {
        "agent": "engineer",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "summary": f"Video rendered and downloaded ({size_mb} MB)",
        "details": technical_metadata,
    }
    reports.append(report)

    update_job_status(job_id, "ready", {
        "video_url": video_url,
        "video_path": video_path,
        "agent_reports": reports,
    })

    return {
        "video_url": video_url,
        "video_path": video_path,
        "job_status": "ready",
        "technical_metadata": technical_metadata,
        "agent_reports": reports,
        "errors": errors,
    }


def _mock_engineer(state: VideoProductionState, reports: list) -> dict:
    """Mock engineer for development without HeyGen credentials."""
    job_id = state["job_id"]
    script = state.get("script", "")

    technical_metadata = {
        "width": 720,
        "height": 1280,
        "size_mb": 12.5,
        "duration_s": max(30, len(script.split()) / 2.5),
        "heygen_video_id": "mock_video_id",
    }

    report = {
        "agent": "engineer",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "summary": "Mock mode: No HeyGen key. Video metadata simulated.",
        "details": technical_metadata,
    }
    reports.append(report)

    mock_url = "/media/mock_video.mp4"
    mock_path = str(JOBS_DIR / job_id / "video" / "mock_output.mp4")

    update_job_status(job_id, "ready", {
        "video_url": mock_url,
        "agent_reports": reports,
    })

    return {
        "video_url": mock_url,
        "video_path": mock_path,
        "job_status": "ready",
        "technical_metadata": technical_metadata,
        "agent_reports": reports,
    }
