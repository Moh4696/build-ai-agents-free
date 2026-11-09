"""Shared state schema for the multi-agent video production workflow."""
from typing import TypedDict, Optional


class VideoProductionState(TypedDict):
    # ── Input ─────────────────────────────────────────────────────────────────
    topic: str
    platform: str                   # "youtube" | "tiktok" | "instagram"
    job_id: str
    created_at: str
    max_iterations: int

    # ── Strategist outputs ────────────────────────────────────────────────────
    trend_analysis: dict            # {trending_topics, top_hashtags, peak_times}
    viral_angle: str
    platform_strategy: dict         # {optimal_length, posting_time, format_tips}
    competitor_analysis: list       # [{creator, topic, hook, estimated_views}]

    # ── Designer outputs ──────────────────────────────────────────────────────
    script: str
    hook: str
    scenes: list                    # [{scene_number, visual, narration, duration}]
    caption: str
    hashtags: list
    cta: str

    # ── Engineer outputs ──────────────────────────────────────────────────────
    video_url: str
    video_path: str
    job_status: str
    technical_metadata: dict        # {duration_s, width, height, size_mb}

    # ── Analyst outputs ───────────────────────────────────────────────────────
    quality_scores: dict            # {hook_strength, script_clarity, cta_quality, caption_quality, technical_compliance} each 0-20
    quality_flags: list
    quality_report: str
    passed_quality: bool

    # ── Optimizer outputs ─────────────────────────────────────────────────────
    engagement_score: float         # 0-100
    algorithm_alignment: dict
    monetization_score: float       # 0-100
    optimization_feedback: str
    iteration_count: int

    # ── Human gate ────────────────────────────────────────────────────────────
    human_decision: Optional[str]   # "approve" | "revise" | "reject"
    human_notes: str

    # ── Accumulated ───────────────────────────────────────────────────────────
    agent_reports: list             # [{agent, timestamp, summary, details}]
    messages: list                  # message history
    errors: list                    # [{agent, error, timestamp}]
    completed_at: Optional[str]


def initial_state(job_id: str, topic: str, platform: str, max_iterations: int = 3) -> VideoProductionState:
    """Return a zeroed-out initial state for a new job."""
    from datetime import datetime, timezone
    return VideoProductionState(
        topic=topic,
        platform=platform,
        job_id=job_id,
        created_at=datetime.now(timezone.utc).isoformat(),
        max_iterations=max_iterations,
        trend_analysis={},
        viral_angle="",
        platform_strategy={},
        competitor_analysis=[],
        script="",
        hook="",
        scenes=[],
        caption="",
        hashtags=[],
        cta="",
        video_url="",
        video_path="",
        job_status="pending",
        technical_metadata={},
        quality_scores={},
        quality_flags=[],
        quality_report="",
        passed_quality=False,
        engagement_score=0.0,
        algorithm_alignment={},
        monetization_score=0.0,
        optimization_feedback="",
        iteration_count=0,
        human_decision=None,
        human_notes="",
        agent_reports=[],
        messages=[],
        errors=[],
        completed_at=None,
    )
