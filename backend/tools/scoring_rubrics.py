"""
Deterministic engagement and monetization scoring. No LLM dependency.
Used by the Optimizer agent as a baseline before LLM refinement.
"""
import re
from dataclasses import dataclass, field


# ── Keyword lists ─────────────────────────────────────────────────────────────

POWER_WORDS = {
    "shocking", "secret", "revealed", "banned", "exposed", "truth", "hidden",
    "nobody", "everyone", "viral", "breaking", "exclusive", "urgent", "critical",
    "must", "warning", "alert", "finally", "insider", "real", "actual",
}

COMMENT_BAIT_PATTERNS = [
    r"\?",                          # questions invite replies
    r"comment (below|down|your)",
    r"what do you think",
    r"agree or disagree",
    r"let me know",
    r"tell me",
    r"drop a",
    r"which (side|one|team) are you",
]

SAVE_TRIGGERS = [
    r"save this",
    r"bookmark",
    r"come back to",
    r"screenshot",
    r"share this with",
    r"send this to",
    r"step.by.step",
    r"how to",
    r"cheat sheet",
    r"guide",
    r"tips",
    r"hack",
]

SHARE_BAIT = [
    r"share (this|if)",
    r"tag (someone|a friend|your)",
    r"show this to",
    r"send to",
    r"repost",
]

DUET_STITCH = [
    r"duet",
    r"stitch",
    r"react to",
    r"respond to this",
]

DEMONETIZATION_FLAGS = [
    r"\b(kill|killing|murdered|murder|dead|death|suicide|self-harm)\b",
    r"\b(gun|weapon|bomb|terror|terrorist)\b",
    r"\b(racist|racism|slur)\b",
    r"\b(sex|sexual|nude|naked|porn)\b",
    r"\b(drug|cocaine|heroin|meth)\b",
]


def _count_matches(text: str, patterns: list) -> int:
    text_lower = text.lower()
    return sum(1 for p in patterns if re.search(p, text_lower))


def _word_count(text: str) -> int:
    return len(text.split())


# ── Platform word limits ──────────────────────────────────────────────────────

WORD_LIMITS = {
    "tiktok": 150,
    "youtube": 130,
    "instagram": 120,
}

DURATION_LIMITS = {
    "tiktok": 60,
    "youtube": 60,
    "instagram": 60,
}


# ── Per-platform rubrics ──────────────────────────────────────────────────────

@dataclass
class ScoreBreakdown:
    total: float = 0.0
    details: dict = field(default_factory=dict)


def score_hook(hook: str) -> ScoreBreakdown:
    """Score the hook line (0-25)."""
    score = 0.0
    details = {}

    # Has a question mark or "if you" pattern interrupt
    if "?" in hook:
        score += 8
        details["question"] = 8
    if re.search(r"\bif you\b", hook.lower()):
        score += 7
        details["if_you_pattern"] = 7
    # Power word present
    words = set(hook.lower().split())
    matched_power = words & POWER_WORDS
    if matched_power:
        pts = min(7, len(matched_power) * 4)
        score += pts
        details["power_words"] = pts
    # Short and punchy (under 12 words scores higher)
    wc = _word_count(hook)
    if wc <= 8:
        score += 3
        details["short_hook"] = 3
    elif wc <= 12:
        score += 1
        details["medium_hook"] = 1

    return ScoreBreakdown(total=min(score, 25), details=details)


def score_retention(script: str, scenes: list) -> ScoreBreakdown:
    """Score retention signals (0-25)."""
    score = 0.0
    details = {}

    # Pacing: 2-3 words per second at ~60s = 120-180 words
    wc = _word_count(script)
    if 100 <= wc <= 180:
        score += 12
        details["word_count_optimal"] = 12
    elif 80 <= wc <= 200:
        score += 7
        details["word_count_acceptable"] = 7

    # Cliffhanger or payoff signal
    if re.search(r"\bbut here.s the thing\b|\bwait for it\b|\bhere.s why\b|\bthe twist\b", script.lower()):
        score += 8
        details["cliffhanger"] = 8

    # Scene variety (multiple visual cues = retention)
    if len(scenes) >= 3:
        score += 5
        details["scene_variety"] = 5
    elif len(scenes) >= 2:
        score += 2
        details["scene_variety"] = 2

    return ScoreBreakdown(total=min(score, 25), details=details)


def score_engagement_triggers(script: str, cta: str, platform: str) -> ScoreBreakdown:
    """Score engagement triggers (0-20)."""
    combined = (script + " " + cta).lower()
    score = 0.0
    details = {}

    comment_hits = _count_matches(combined, COMMENT_BAIT_PATTERNS)
    if comment_hits:
        pts = min(8, comment_hits * 3)
        score += pts
        details["comment_bait"] = pts

    save_hits = _count_matches(combined, SAVE_TRIGGERS)
    if save_hits:
        pts = min(6, save_hits * 3)
        score += pts
        details["save_triggers"] = pts

    if platform == "tiktok":
        duet_hits = _count_matches(combined, DUET_STITCH)
        if duet_hits:
            score += 6
            details["duet_stitch"] = 6

    share_hits = _count_matches(combined, SHARE_BAIT)
    if share_hits:
        score += 3
        details["share_bait"] = 3

    return ScoreBreakdown(total=min(score, 20), details=details)


def score_algorithm_alignment(
    script: str, caption: str, hashtags: list, platform: str, technical_metadata: dict
) -> ScoreBreakdown:
    """Score against platform algorithm signals (0-20)."""
    score = 0.0
    details = {}
    combined = (script + " " + caption).lower()

    duration = technical_metadata.get("duration_s", 0)

    if platform == "tiktok":
        if 45 <= duration <= 60:
            score += 8
            details["optimal_duration"] = 8
        elif 30 <= duration <= 60:
            score += 4
            details["acceptable_duration"] = 4
        if len(hashtags) >= 3:
            score += 6
            details["hashtag_count"] = 6
        if _count_matches(combined, COMMENT_BAIT_PATTERNS) >= 2:
            score += 6
            details["comment_velocity_signals"] = 6

    elif platform == "youtube":
        if duration <= 60:
            score += 6
            details["shorts_eligible"] = 6
        if re.search(r"\bsubscrib\b", combined):
            score += 8
            details["subscribe_cta"] = 8
        if re.search(r"how to|step|guide|best|top", combined):
            score += 6
            details["seo_keywords"] = 6

    elif platform == "instagram":
        if 40 <= duration <= 50:
            score += 8
            details["reels_sweet_spot"] = 8
        elif duration <= 60:
            score += 4
            details["acceptable_duration"] = 4
        save_hits = _count_matches(combined, SAVE_TRIGGERS)
        if save_hits:
            score += 8
            details["save_signals"] = 8
        if len(hashtags) >= 5:
            score += 4
            details["hashtag_mix"] = 4

    return ScoreBreakdown(total=min(score, 20), details=details)


def score_monetization_safety(script: str, caption: str) -> ScoreBreakdown:
    """Check for demonetization risk (0-10)."""
    combined = (script + " " + caption).lower()
    flags = []
    for pattern in DEMONETIZATION_FLAGS:
        if re.search(pattern, combined):
            flags.append(pattern)

    if not flags:
        return ScoreBreakdown(total=10.0, details={"clean": True})
    penalty = min(10, len(flags) * 4)
    return ScoreBreakdown(total=max(0, 10 - penalty), details={"flags": flags})


def compute_full_score(
    hook: str,
    script: str,
    cta: str,
    caption: str,
    hashtags: list,
    scenes: list,
    platform: str,
    technical_metadata: dict,
) -> dict:
    """Compute the full 0-100 engagement score with breakdown."""
    hook_score = score_hook(hook)
    retention_score = score_retention(script, scenes)
    engagement_score = score_engagement_triggers(script, cta, platform)
    algorithm_score = score_algorithm_alignment(script, caption, hashtags, platform, technical_metadata)
    safety_score = score_monetization_safety(script, caption)

    total = (
        hook_score.total
        + retention_score.total
        + engagement_score.total
        + algorithm_score.total
        + safety_score.total
    )

    return {
        "total": round(total, 1),
        "breakdown": {
            "hook_power": {"score": hook_score.total, "max": 25, "details": hook_score.details},
            "retention_signals": {"score": retention_score.total, "max": 25, "details": retention_score.details},
            "engagement_triggers": {"score": engagement_score.total, "max": 20, "details": engagement_score.details},
            "algorithm_alignment": {"score": algorithm_score.total, "max": 20, "details": algorithm_score.details},
            "monetization_safety": {"score": safety_score.total, "max": 10, "details": safety_score.details},
        },
    }


def check_platform_specs(platform: str, technical_metadata: dict) -> dict:
    """Validate video against platform technical requirements."""
    issues = []
    duration = technical_metadata.get("duration_s", 0)
    width = technical_metadata.get("width", 0)
    height = technical_metadata.get("height", 0)

    if platform in DURATION_LIMITS and duration > DURATION_LIMITS[platform]:
        issues.append(f"Duration {duration}s exceeds {platform} limit of {DURATION_LIMITS[platform]}s")

    # 9:16 aspect ratio check (720x1280 or 1080x1920)
    if width > 0 and height > 0:
        ratio = height / width
        if not (1.7 <= ratio <= 1.8):
            issues.append(f"Aspect ratio {width}x{height} is not 9:16 vertical")

    return {"valid": len(issues) == 0, "issues": issues}
