"""
Human Gate — LangGraph interrupt node. No LLM. Pauses the graph and waits
for the human to approve, revise, or reject via the API.
"""
from datetime import datetime, timezone

from langgraph.types import interrupt

from backend.agents.state import VideoProductionState
from backend.app.storage import update_job_status


def human_gate_node(state: VideoProductionState) -> dict:
    """
    Pause execution and wait for a human decision.
    Writes gate_payload to disk so the FastAPI polling endpoint can serve it.
    Calls interrupt() which saves full graph state to SqliteSaver and pauses.
    """
    job_id = state["job_id"]

    gate_payload = {
        "video_url": state.get("video_url", ""),
        "video_path": state.get("video_path", ""),
        "engagement_score": state.get("engagement_score", 0),
        "monetization_score": state.get("monetization_score", 0),
        "agent_reports": state.get("agent_reports", []),
        "quality_report": state.get("quality_report", ""),
        "quality_scores": state.get("quality_scores", {}),
        "optimization_feedback": state.get("optimization_feedback", ""),
        "iteration_count": state.get("iteration_count", 0),
        "script": state.get("script", ""),
        "hook": state.get("hook", ""),
        "caption": state.get("caption", ""),
        "hashtags": state.get("hashtags", []),
        "cta": state.get("cta", ""),
        "scenes": state.get("scenes", []),
        "algorithm_alignment": state.get("algorithm_alignment", {}),
        "topic": state.get("topic", ""),
        "platform": state.get("platform", ""),
    }

    # Write to disk BEFORE interrupt so frontend immediately sees the gate
    update_job_status(job_id, "awaiting_human_approval", {
        "gate_payload": gate_payload,
        "engagement_score": gate_payload["engagement_score"],
        "monetization_score": gate_payload["monetization_score"],
    })

    # Pause graph execution — LangGraph saves full state to SqliteSaver
    # FastAPI resumes with: graph.invoke(Command(resume={...}), config)
    decision = interrupt(gate_payload)

    return {
        "human_decision": decision.get("action", "reject"),
        "human_notes": decision.get("notes", ""),
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }
