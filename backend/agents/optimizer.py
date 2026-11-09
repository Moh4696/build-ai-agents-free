"""
Optimizer Agent — scores content against current platform algorithms using
three-layer intelligence: static 2025 knowledge + live web search + deterministic rubric.
Produces actionable optimization_feedback for the Designer on loop iterations.
"""
import json
from datetime import datetime, timezone

from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain_core.prompts import ChatPromptTemplate

from backend.agents.llm_registry import get_groq_with_fallback
from backend.agents.state import VideoProductionState
from backend.app.storage import update_job_status
from backend.tools.search_tools import search_algorithm_updates, search_monetization_criteria
from backend.tools.scoring_rubrics import compute_full_score

SYSTEM_PROMPT = """You are a platform algorithm intelligence agent with deep expertise in TikTok, YouTube Shorts, and Instagram Reels as of {year}.

PLATFORM ALGORITHM KNOWLEDGE ({year}):

TikTok:
- Watch-through rate >75% is the primary distribution push signal
- Comment velocity in first 30 minutes determines secondary push
- Duet/stitch invitation in CTA multiplies reach 2-4x
- Optimal: 45-60 seconds, trending audio adds 30-50% boost
- Monetization (Creator Rewards): >10K followers, >100K 30-day views, original content only, no watermarks
- Algorithm rewards: loop-worthy endings, POV formats, "storytime" openings, reaction bait

YouTube Shorts:
- Satisfaction score (likes+comments/views) >50% triggers secondary distribution
- Watch past 30 seconds = strong signal for secondary push
- CTR on title drives initial distribution; use curiosity gap
- Subscriber CTA in final frame is highest-converting position
- Monetization (YPP Shorts): 500 subs + 3M Shorts views in 90 days OR 1K subs + 4K watch hours
- Algorithm rewards: tutorial format, "did you know" hooks, chapter-style structure

Instagram Reels:
- SAVES are weighted ~3x likes — the single most important engagement signal
- Shares to Stories trigger reach multiplication in the feed
- Cover frame CTR drives Explore placement
- Non-copyrighted audio avoids shadowban; Reels-trending audio adds discovery
- 45 second sweet spot — completion rate drops sharply after 60 seconds
- Algorithm rewards: educational content, "save-worthy" lists, before/after formats

You also have search tools to find algorithm updates more recent than your knowledge.
Always search before scoring. Weight recent search results higher than built-in knowledge for time-sensitive signals.

CONTENT TO EVALUATE:
Platform: {platform}
Topic: {topic}
Hook: {hook}
Script: {script}
CTA: {cta}
Caption: {caption}
Hashtags: {hashtags}
Technical metadata: {technical_metadata}

Rubric score (pre-computed): {rubric_score}/100
Quality flags from Analyst: {quality_flags}
Current iteration: {iteration_count}/{max_iterations}

After searching and analyzing, return ONLY valid JSON (no markdown fencing):
{{
  "engagement_score": <0-100 float>,
  "algorithm_alignment": {{
    "watch_through_potential": "<high/medium/low>",
    "engagement_trigger_strength": "<high/medium/low>",
    "monetization_eligible": <true/false>,
    "key_strengths": ["strength1", "strength2"],
    "key_gaps": ["gap1", "gap2"]
  }},
  "monetization_score": <0-100 float>,
  "optimization_feedback": "ITERATION {iteration_count} OPTIMIZATION FEEDBACK:\\nPriority 1 (MUST FIX): [specific actionable fix with before/after example]\\nPriority 2: [second fix]\\nPriority 3 (optional enhancement): [enhancement]\\nTarget: Raise score to 70+. Current: {rubric_score}/100."
}}"""

HUMAN_PROMPT = "Search for {platform} algorithm updates, then score and optimize this content."


def run_optimizer(state: VideoProductionState) -> dict:
    """Run the Optimizer agent and return state updates."""
    job_id = state["job_id"]
    platform = state["platform"]
    iteration_count = state.get("iteration_count", 0) + 1

    update_job_status(job_id, "running_optimizer")

    # Pre-compute deterministic rubric score
    rubric = compute_full_score(
        hook=state.get("hook", ""),
        script=state.get("script", ""),
        cta=state.get("cta", ""),
        caption=state.get("caption", ""),
        hashtags=state.get("hashtags", []),
        scenes=state.get("scenes", []),
        platform=platform,
        technical_metadata=state.get("technical_metadata", {}),
    )
    rubric_score = rubric["total"]

    llm = get_groq_with_fallback()
    tools = [search_algorithm_updates, search_monetization_criteria]

    prompt = ChatPromptTemplate.from_messages([
        ("system", SYSTEM_PROMPT),
        ("human", HUMAN_PROMPT),
        ("placeholder", "{agent_scratchpad}"),
    ])

    agent = create_tool_calling_agent(llm, tools, prompt)
    executor = AgentExecutor(agent=agent, tools=tools, verbose=False, max_iterations=6)

    year = datetime.now().year

    try:
        result = executor.invoke({
            "year": year,
            "platform": platform,
            "topic": state.get("topic", ""),
            "hook": state.get("hook", ""),
            "script": state.get("script", "")[:500],  # truncate for prompt size
            "cta": state.get("cta", ""),
            "caption": state.get("caption", ""),
            "hashtags": ", ".join(state.get("hashtags", [])),
            "technical_metadata": json.dumps(state.get("technical_metadata", {})),
            "rubric_score": rubric_score,
            "quality_flags": ", ".join(state.get("quality_flags", [])),
            "iteration_count": iteration_count,
            "max_iterations": state.get("max_iterations", 3),
        })
        raw = result.get("output", "{}").strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        parsed = json.loads(raw)
    except Exception as e:
        # Fallback: use rubric score directly
        parsed = {
            "engagement_score": rubric_score,
            "algorithm_alignment": {
                "watch_through_potential": "medium",
                "engagement_trigger_strength": "medium",
                "monetization_eligible": rubric_score >= 70,
                "key_strengths": [],
                "key_gaps": state.get("quality_flags", []),
            },
            "monetization_score": rubric_score * 0.9,
            "optimization_feedback": f"LLM unavailable. Rubric score: {rubric_score}/100. Address quality flags: {', '.join(state.get('quality_flags', []))}",
        }
        errors = list(state.get("errors", []))
        errors.append({"agent": "optimizer", "error": str(e), "timestamp": datetime.now(timezone.utc).isoformat()})

    engagement_score = float(parsed.get("engagement_score", rubric_score))
    monetization_score = float(parsed.get("monetization_score", rubric_score * 0.9))

    report = {
        "agent": "optimizer",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "summary": f"Engagement: {engagement_score:.0f}/100 | Monetization: {monetization_score:.0f}/100 | Iteration {iteration_count}",
        "details": {
            **parsed,
            "rubric_breakdown": rubric["breakdown"],
        },
    }
    reports = list(state.get("agent_reports", []))
    reports.append(report)

    update_job_status(job_id, "running_optimizer", {
        "engagement_score": engagement_score,
        "monetization_score": monetization_score,
        "iteration_count": iteration_count,
        "agent_reports": reports,
    })

    return {
        "engagement_score": engagement_score,
        "algorithm_alignment": parsed.get("algorithm_alignment", {}),
        "monetization_score": monetization_score,
        "optimization_feedback": parsed.get("optimization_feedback", ""),
        "iteration_count": iteration_count,
        "agent_reports": reports,
    }
