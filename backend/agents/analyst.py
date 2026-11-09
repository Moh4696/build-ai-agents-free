"""
Analyst Agent — scores content across 5 quality dimensions.
Produces a quality_report and flags for the Optimizer.
"""
import json
from datetime import datetime, timezone

from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain_core.prompts import ChatPromptTemplate

from backend.agents.llm_registry import get_groq_with_fallback
from backend.agents.state import VideoProductionState
from backend.app.storage import update_job_status
from backend.tools.platform_tools import validate_platform_specs, check_word_count

SYSTEM_PROMPT = """You are a content quality analyst for short-form social video.

Score the provided video content across 5 dimensions (each 0-20, total 100).
Be strict — a score of 15+ requires genuinely strong execution. Average work scores 8-12.

Dimensions:
1. hook_strength (0-20): Does the first line create instant curiosity? Pattern interrupt? Shock? Question?
2. script_clarity (0-20): Clear value proposition, logical flow, no filler words, one idea per sentence?
3. cta_quality (0-20): Specific, action-oriented, platform-appropriate? NOT "like and subscribe"?
4. caption_quality (0-20): Keyword-rich, ends with engagement question, hashtags relevant?
5. technical_compliance (0-20): Does word count and format match {platform} requirements?

Platform: {platform}

Content to review:
HOOK: {hook}
SCRIPT: {script}
CTA: {cta}
CAPTION: {caption}
HASHTAGS: {hashtags}
WORD COUNT: {word_count} (limit: {word_limit})

Return ONLY valid JSON (no markdown fencing):
{{
  "quality_scores": {{
    "hook_strength": <0-20>,
    "script_clarity": <0-20>,
    "cta_quality": <0-20>,
    "caption_quality": <0-20>,
    "technical_compliance": <0-20>
  }},
  "quality_flags": ["flag1", "flag2"],
  "quality_report": "2-3 sentence markdown summary of strengths and weaknesses",
  "passed_quality": <true if total >= 60 else false>
}}"""

HUMAN_PROMPT = "Analyze this content for {platform} and return the quality JSON."

WORD_LIMITS = {"tiktok": 150, "youtube": 130, "instagram": 120}


def run_analyst(state: VideoProductionState) -> dict:
    """Run the Analyst agent and return state updates."""
    job_id = state["job_id"]
    platform = state["platform"]

    update_job_status(job_id, "running_analyst")

    script = state.get("script", "")
    word_count = len(script.split())
    word_limit = WORD_LIMITS.get(platform, 150)

    llm = get_groq_with_fallback()
    tools = [validate_platform_specs, check_word_count]

    prompt = ChatPromptTemplate.from_messages([
        ("system", SYSTEM_PROMPT),
        ("human", HUMAN_PROMPT),
        ("placeholder", "{agent_scratchpad}"),
    ])

    agent = create_tool_calling_agent(llm, tools, prompt)
    executor = AgentExecutor(agent=agent, tools=tools, verbose=False, max_iterations=4)

    try:
        result = executor.invoke({
            "platform": platform,
            "hook": state.get("hook", ""),
            "script": script,
            "cta": state.get("cta", ""),
            "caption": state.get("caption", ""),
            "hashtags": ", ".join(state.get("hashtags", [])),
            "word_count": word_count,
            "word_limit": word_limit,
        })
        raw = result.get("output", "{}").strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        parsed = json.loads(raw)
    except Exception as e:
        # Fallback: use rubric-only scores
        from backend.tools.scoring_rubrics import compute_full_score
        rubric = compute_full_score(
            hook=state.get("hook", ""),
            script=script,
            cta=state.get("cta", ""),
            caption=state.get("caption", ""),
            hashtags=state.get("hashtags", []),
            scenes=state.get("scenes", []),
            platform=platform,
            technical_metadata=state.get("technical_metadata", {}),
        )
        # Map rubric 0-100 to 5×20 distribution
        factor = rubric["total"] / 100
        score_20 = lambda s: round(s * factor)
        parsed = {
            "quality_scores": {
                "hook_strength": score_20(20),
                "script_clarity": score_20(20),
                "cta_quality": score_20(20),
                "caption_quality": score_20(20),
                "technical_compliance": score_20(20),
            },
            "quality_flags": [f"LLM unavailable, used rubric scoring: {e}"],
            "quality_report": f"Rubric-based analysis. Total score: {rubric['total']}/100.",
            "passed_quality": rubric["total"] >= 60,
        }
        errors = list(state.get("errors", []))
        errors.append({"agent": "analyst", "error": str(e), "timestamp": datetime.now(timezone.utc).isoformat()})

    scores = parsed.get("quality_scores", {})
    total = sum(scores.values())

    report = {
        "agent": "analyst",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "summary": f"Quality score: {total}/100. {'PASS' if parsed.get('passed_quality') else 'NEEDS WORK'}",
        "details": parsed,
    }
    reports = list(state.get("agent_reports", []))
    reports.append(report)

    update_job_status(job_id, "running_analyst", {"agent_reports": reports})

    return {
        "quality_scores": parsed.get("quality_scores", {}),
        "quality_flags": parsed.get("quality_flags", []),
        "quality_report": parsed.get("quality_report", ""),
        "passed_quality": parsed.get("passed_quality", False),
        "agent_reports": reports,
    }
