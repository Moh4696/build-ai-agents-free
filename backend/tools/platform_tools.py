"""Platform spec validators and content checkers."""
from langchain_core.tools import tool
from backend.tools.scoring_rubrics import check_platform_specs, _word_count, WORD_LIMITS


@tool
def validate_platform_specs(platform: str, technical_metadata: dict) -> dict:
    """Validate video technical specs against platform requirements."""
    return check_platform_specs(platform, technical_metadata)


@tool
def check_word_count(text: str, platform: str) -> dict:
    """Check if script word count is within platform limits."""
    count = _word_count(text)
    limit = WORD_LIMITS.get(platform, 150)
    return {
        "word_count": count,
        "limit": limit,
        "within_limit": count <= limit,
        "overage": max(0, count - limit),
    }


@tool
def score_hook_quality(hook: str) -> dict:
    """Score a hook line for pattern interrupt strength (0-25)."""
    from backend.tools.scoring_rubrics import score_hook
    result = score_hook(hook)
    return {"score": result.total, "max": 25, "details": result.details}
