"""
Strategist Agent — researches trends and identifies the highest-potential
content angle for the given topic and platform.
"""
import json
from datetime import datetime, timezone

from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain_core.prompts import ChatPromptTemplate

from backend.agents.llm_registry import get_groq_with_fallback
from backend.agents.state import VideoProductionState
from backend.app.storage import update_job_status
from backend.tools.search_tools import (
    search_trending,
    search_algorithm_updates,
    search_competitor_content,
)

SYSTEM_PROMPT = """You are a viral content strategist specializing in short-form video for {platform}.

Your job is to research what is performing RIGHT NOW and identify the highest-potential angle for: {topic}

Use the search tools aggressively — run at least 3 searches before drawing conclusions.

After researching, return a JSON object (and ONLY JSON, no markdown fencing) with this exact structure:
{{
  "trend_analysis": {{
    "trending_topics": ["topic1", "topic2", "topic3"],
    "top_hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5"],
    "peak_posting_time": "7-9pm local",
    "why_trending": "brief explanation"
  }},
  "viral_angle": "One sentence describing the specific angle that will perform best right now",
  "platform_strategy": {{
    "optimal_length_seconds": 45,
    "posting_time": "7-9pm local",
    "format_tips": ["tip1", "tip2", "tip3"],
    "algorithm_notes": "what the {platform} algorithm rewards right now"
  }},
  "competitor_analysis": [
    {{"creator": "niche description", "hook_pattern": "what makes their hooks work", "estimated_performance": "high/medium"}}
  ]
}}"""

HUMAN_PROMPT = "Research {topic} for {platform} and produce the strategy JSON."


def run_strategist(state: VideoProductionState) -> dict:
    """Run the Strategist agent and return state updates."""
    job_id = state["job_id"]
    topic = state["topic"]
    platform = state["platform"]

    update_job_status(job_id, "running_strategist")

    llm = get_groq_with_fallback()
    tools = [search_trending, search_algorithm_updates, search_competitor_content]

    prompt = ChatPromptTemplate.from_messages([
        ("system", SYSTEM_PROMPT),
        ("human", HUMAN_PROMPT),
        ("placeholder", "{agent_scratchpad}"),
    ])

    agent = create_tool_calling_agent(llm, tools, prompt)
    executor = AgentExecutor(agent=agent, tools=tools, verbose=False, max_iterations=6)

    try:
        result = executor.invoke({
            "platform": platform,
            "topic": topic,
        })
        raw = result.get("output", "{}")
        # Strip any markdown code fences
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        parsed = json.loads(raw)
    except Exception as e:
        # Graceful degradation: return minimal strategy so pipeline continues
        parsed = {
            "trend_analysis": {
                "trending_topics": [topic],
                "top_hashtags": [f"#{topic.replace(' ', '')}", "#viral", "#trending"],
                "peak_posting_time": "7-9pm",
                "why_trending": "Unable to fetch live trend data",
            },
            "viral_angle": f"The surprising truth about {topic} that most people don't know",
            "platform_strategy": {
                "optimal_length_seconds": 45,
                "posting_time": "7-9pm",
                "format_tips": ["Open with a question", "One idea per sentence", "End with CTA"],
                "algorithm_notes": "Focus on watch-through rate and comment velocity",
            },
            "competitor_analysis": [],
        }
        errors = list(state.get("errors", []))
        errors.append({"agent": "strategist", "error": str(e), "timestamp": datetime.now(timezone.utc).isoformat()})
        return {
            "trend_analysis": parsed["trend_analysis"],
            "viral_angle": parsed["viral_angle"],
            "platform_strategy": parsed["platform_strategy"],
            "competitor_analysis": parsed.get("competitor_analysis", []),
            "errors": errors,
        }

    report = {
        "agent": "strategist",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "summary": f"Identified viral angle: {parsed.get('viral_angle', '')[:80]}",
        "details": parsed,
    }
    reports = list(state.get("agent_reports", []))
    reports.append(report)

    update_job_status(job_id, "running_strategist", {"agent_reports": reports})

    return {
        "trend_analysis": parsed.get("trend_analysis", {}),
        "viral_angle": parsed.get("viral_angle", ""),
        "platform_strategy": parsed.get("platform_strategy", {}),
        "competitor_analysis": parsed.get("competitor_analysis", []),
        "agent_reports": reports,
    }
