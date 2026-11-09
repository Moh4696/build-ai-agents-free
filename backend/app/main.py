"""
FastAPI application — bridges HTTP requests to the LangGraph multi-agent workflow.

Endpoints:
  GET  /api/health
  GET  /api/config
  POST /api/jobs                     → launch workflow as background task
  GET  /api/jobs                     → list all jobs
  GET  /api/jobs/{job_id}            → poll job state
  POST /api/jobs/{job_id}/approve    → resume graph from human gate (approve)
  POST /api/jobs/{job_id}/revise     → resume graph from human gate (revise with notes)
  POST /api/jobs/{job_id}/reject     → resume graph from human gate (reject)
"""
import asyncio
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from langgraph.types import Command

from backend.agents.graph import compiled_graph
from backend.agents.state import initial_state
from backend.app.config import JOBS_DIR
from backend.app.models import CreateJobRequest, JobResponse, ReviseRequest
from backend.app.storage import list_jobs, read_job_state, update_job_status

app = FastAPI(title="AI Social Video Studio", version="2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve downloaded videos
media_dir = Path(__file__).resolve().parents[2] / "jobs"
app.mount("/media", StaticFiles(directory=str(media_dir), html=False), name="media")

_executor = ThreadPoolExecutor(max_workers=4)


# ── Graph task helpers ────────────────────────────────────────────────────────

def _run_graph(job_id: str, topic: str, platform: str, max_iterations: int) -> None:
    """Blocking graph run — called in a thread pool from a BackgroundTask."""
    state = initial_state(job_id, topic, platform, max_iterations)
    config = {"configurable": {"thread_id": job_id}}
    try:
        compiled_graph.invoke(state, config)
    except Exception as e:
        update_job_status(job_id, "failed", {"error": str(e)})


def _resume_graph(job_id: str, decision: dict) -> None:
    """Resume a paused graph from the human gate checkpoint."""
    config = {"configurable": {"thread_id": job_id}}
    try:
        compiled_graph.invoke(Command(resume=decision), config)
    except Exception as e:
        update_job_status(job_id, "failed", {"error": str(e)})


async def _run_in_thread(fn, *args):
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_executor, fn, *args)


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {"status": "ok", "version": "2.0", "agents": ["strategist", "designer", "engineer", "analyst", "optimizer"]}


@app.get("/api/config")
def config():
    import os
    return {
        "platforms": ["youtube", "tiktok", "instagram"],
        "max_iterations_default": 3,
        "engagement_threshold": 70,
        "llm_assignment": {
            "designer": "claude-3-5-haiku (falls back to groq)",
            "others": "groq-llama-3.3-70b (falls back to gemini-2.5-flash)",
        },
        "heygen_configured": bool(os.getenv("HEYGEN_API_KEY")),
        "anthropic_configured": bool(os.getenv("ANTHROPIC_API_KEY")),
    }


@app.post("/api/jobs", response_model=JobResponse)
async def create_job(body: CreateJobRequest, background_tasks: BackgroundTasks):
    job_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    update_job_status(job_id, "pending", {
        "job_id": job_id,
        "topic": body.topic,
        "platform": body.platform,
        "max_iterations": body.max_iterations,
        "created_at": now,
        "agent_reports": [],
        "errors": [],
        "iteration_count": 0,
    })

    background_tasks.add_task(
        _run_in_thread,
        _run_graph,
        job_id,
        body.topic,
        body.platform,
        body.max_iterations,
    )

    return JobResponse(
        job_id=job_id,
        status="pending",
        topic=body.topic,
        platform=body.platform,
        created_at=now,
    )


@app.get("/api/jobs")
def list_all_jobs():
    return list_jobs()


@app.get("/api/jobs/{job_id}", response_model=JobResponse)
def get_job(job_id: str):
    state = read_job_state(job_id)
    if not state:
        raise HTTPException(status_code=404, detail="Job not found")
    return JobResponse(
        job_id=state.get("job_id", job_id),
        status=state.get("status", "unknown"),
        topic=state.get("topic", ""),
        platform=state.get("platform", ""),
        created_at=state.get("created_at"),
        updated_at=state.get("updated_at"),
        agent_reports=state.get("agent_reports", []),
        video_url=state.get("video_url") or state.get("gate_payload", {}).get("video_url"),
        engagement_score=state.get("engagement_score"),
        monetization_score=state.get("monetization_score"),
        quality_report=state.get("quality_report"),
        optimization_feedback=state.get("optimization_feedback"),
        iteration_count=state.get("iteration_count", 0),
        gate_payload=state.get("gate_payload"),
        publish_results=state.get("publish_results"),
        errors=state.get("errors", []),
        completed_at=state.get("completed_at"),
    )


@app.post("/api/jobs/{job_id}/approve")
async def approve_job(job_id: str, background_tasks: BackgroundTasks):
    state = read_job_state(job_id)
    if not state:
        raise HTTPException(status_code=404, detail="Job not found")
    if state.get("status") != "awaiting_human_approval":
        raise HTTPException(status_code=400, detail=f"Job is not awaiting approval (status: {state.get('status')})")

    background_tasks.add_task(_run_in_thread, _resume_graph, job_id, {"action": "approve"})
    return {"status": "publishing"}


@app.post("/api/jobs/{job_id}/revise")
async def revise_job(job_id: str, body: ReviseRequest, background_tasks: BackgroundTasks):
    state = read_job_state(job_id)
    if not state:
        raise HTTPException(status_code=404, detail="Job not found")
    if state.get("status") != "awaiting_human_approval":
        raise HTTPException(status_code=400, detail=f"Job is not awaiting approval (status: {state.get('status')})")

    background_tasks.add_task(
        _run_in_thread, _resume_graph, job_id, {"action": "revise", "notes": body.notes}
    )
    return {"status": "revising"}


@app.post("/api/jobs/{job_id}/reject")
async def reject_job(job_id: str, background_tasks: BackgroundTasks):
    state = read_job_state(job_id)
    if not state:
        raise HTTPException(status_code=404, detail="Job not found")

    background_tasks.add_task(_run_in_thread, _resume_graph, job_id, {"action": "reject"})
    update_job_status(job_id, "rejected")
    return {"status": "rejected"}
