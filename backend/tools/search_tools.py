"""DuckDuckGo search tool wrappers with platform-specific query templates."""
from datetime import datetime
from langchain_community.tools import DuckDuckGoSearchRun
from langchain_core.tools import tool

_search = DuckDuckGoSearchRun()


def _safe_search(query: str) -> str:
    try:
        return _search.run(query)
    except Exception as e:
        return f"Search unavailable: {e}"


@tool
def search_trending(topic: str, platform: str) -> str:
    """Search what is currently trending for a topic on a given platform."""
    year = datetime.now().year
    results = []
    queries = [
        f"{topic} trending {platform} {year}",
        f"viral {topic} videos {platform} this week",
        f"{topic} viral hooks {platform}",
        f"top {platform} creators {topic} niche",
    ]
    for q in queries:
        results.append(f"Query: {q}\n{_safe_search(q)}")
    return "\n\n---\n\n".join(results)


@tool
def search_algorithm_updates(platform: str) -> str:
    """Search for the latest algorithm updates for a platform."""
    year = datetime.now().year
    queries = [
        f"{platform} algorithm update {year} what gets recommended",
        f"{platform} algorithm change {year} reach engagement",
    ]
    return "\n\n---\n\n".join(_safe_search(q) for q in queries)


@tool
def search_monetization_criteria(platform: str) -> str:
    """Search for the latest monetization requirements for a platform."""
    year = datetime.now().year
    queries = [
        f"{platform} monetization requirements {year} eligibility",
        f"{platform} creator fund requirements {year}",
    ]
    return "\n\n---\n\n".join(_safe_search(q) for q in queries)


@tool
def search_competitor_content(topic: str, platform: str) -> str:
    """Search for top-performing competitor content in a niche."""
    queries = [
        f'site:{platform}.com "{topic}" most viewed',
        f"{topic} {platform} creator tips high views {datetime.now().year}",
    ]
    return "\n\n---\n\n".join(_safe_search(q) for q in queries)
