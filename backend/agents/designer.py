"""
Designer Agent — crafts the script, hook, scenes, caption, hashtags, and CTA.
Uses Claude Haiku for best creative quality; falls back to Groq.
"""
import json
from datetime import datetime, timezone

from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain_core.prompts import ChatPromptTemplate

from backend.agents.llm_registry import get_designer_llm
from backend.agents.state import VideoProductionState
from backend.app.storage import update_job_status
from backend.tools.platform_tools import check_word_count, score_hook_quality

PLATFORM_CONSTRAINTS = {
    "tiktok":    {"max_words": 150, "optimal_seconds": 45, "cta_style": "comment or duet"},
    "youtube":   {"max_words": 130, "optimal_seconds": 55, "cta_style": "subscribe in final 3 seconds"},
    "instagram": {"max_words": 120, "optimal_seconds": 45, "cta_style": "save this or share to Stories"},
}

SYSTEM_PROMPT = """You are a top-performing social video scriptwriter. Every script you write follows this exact structure:

HOOK (0-3s): Pattern interrupt — question, shock stat, or "if you're not doing X you're missing Y".
VALUE (3-{optimal_seconds}s): Core information in punchy rapid-fire sentences. ONE idea per sentence. MAX 12 words per sentence.
CTA (final 5s): Specific action. NOT "like and subscribe" — instead: "Comment your answer below" / "Save this for later" / "Duet this with your take" / "Share this with someone who needs it".

Platform: {platform}
Max words: {max_words}
Optimal CTA style: {cta_style}

{revision_context}

Research context from Strategist:
- Viral angle: {viral_angle}
- Platform strategy: {platform_strategy}
- Trending topics: {trending_topics}

Return ONLY valid JSON (no markdown fencing) with this exact structure:
{{
  "script": "Full narration text only — no stage directions",
  "hook": "First 3-second line only",
  "scenes": [
    {{"scene_number": 1, "visual": "what viewer sees", "narration": "what is said", "duration_s": 5}},
    {{"scene_number": 2, "visual": "visual description", "narration": "narration text", "duration_s": 8}}
  ],
  "caption": "50-60 word post caption ending with a question",
  "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5"],
  "cta": "Final call-to-action line"
}}"""

HUMAN_PROMPT = "Write the video script for: {topic}"


def _build_revision_context(state: VideoProductionState) -> str:
    if state.get("human_notes"):
        return f"⚠️ CLIENT DIRECTION (highest priority — implement exactly):\n{state['human_notes']}\n"
    if state.get("optimization_feedback") and state.get("iteration_count", 0) > 0:
        return f"⚠️ OPTIMIZATION FEEDBACK (highest priority — revise according to this):\n{state['optimization_feedback']}\n"
    return ""


def run_designer(state: VideoProductionState) -> dict:
    """Run the Designer agent and return state updates."""
    job_id = state["job_id"]
    topic = state["topic"]
    platform = state["platform"]
    constraints = PLATFORM_CONSTRAINTS.get(platform, PLATFORM_CONSTRAINTS["tiktok"])

    update_job_status(job_id, "running_designer")

    llm = get_designer_llm()
    tools = [check_word_count, score_hook_quality]

    revision_context = _build_revision_context(state)

    prompt = ChatPromptTemplate.from_messages([
        ("system", SYSTEM_PROMPT),
        ("human", HUMAN_PROMPT),
        ("placeholder", "{agent_scratchpad}"),
    ])

    agent = create_tool_calling_agent(llm, tools, prompt)
    executor = AgentExecutor(agent=agent, tools=tools, verbose=False, max_iterations=5)

    try:
        result = executor.invoke({
            "platform": platform,
            "max_words": constraints["max_words"],
            "optimal_seconds": constraints["optimal_seconds"],
            "cta_style": constraints["cta_style"],
            "revision_context": revision_context,
            "viral_angle": state.get("viral_angle", ""),
            "platform_strategy": json.dumps(state.get("platform_strategy", {})),
            "trending_topics": ", ".join(state.get("trend_analysis", {}).get("trending_topics", [])),
            "topic": topic,
        })
        raw = result.get("output", "{}").strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        parsed = json.loads(raw)
    except Exception as e:
        errors = list(state.get("errors", []))
        errors.append({"agent": "designer", "error": str(e), "timestamp": datetime.now(timezone.utc).isoformat()})
        return {"errors": errors}

    report = {
        "agent": "designer",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "summary": f"Script written ({len(parsed.get('script', '').split())} words). Hook: {parsed.get('hook', '')[:60]}",
        "details": {
            "hook": parsed.get("hook"),
            "word_count": len(parsed.get("script", "").split()),
            "scene_count": len(parsed.get("scenes", [])),
            "iteration": state.get("iteration_count", 0),
        },
    }
    reports = list(state.get("agent_reports", []))
    reports.append(report)

    update_job_status(job_id, "running_designer", {"agent_reports": reports})

    return {
        "script": parsed.get("script", ""),
        "hook": parsed.get("hook", ""),
        "scenes": parsed.get("scenes", []),
        "caption": parsed.get("caption", ""),
        "hashtags": parsed.get("hashtags", []),
        "cta": parsed.get("cta", ""),
        "agent_reports": reports,
        # Reset video fields so Engineer re-renders on loop
        "video_url": "",
        "video_path": "",
        "job_status": "running_designer",
    }
