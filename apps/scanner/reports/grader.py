from scanners.base import Finding

_DEDUCTIONS: dict[str, int] = {
    "critical": 25,
    "high": 15,
    "medium": 8,
    "low": 3,
    "info": 0,
    "pass": 0,
}

_THRESHOLDS: list[tuple[int, str]] = [
    (90, "A"),
    (75, "B"),
    (60, "C"),
    (40, "D"),
    (0, "F"),
]


def calculate_score(findings: list[Finding]) -> int:
    score = 100 - sum(_DEDUCTIONS.get(f.severity, 0) for f in findings)
    return max(0, score)


def score_to_grade(score: int) -> str:
    for threshold, letter in _THRESHOLDS:
        if score >= threshold:
            return letter
    return "F"


def grade(findings: list[Finding]) -> tuple[str, int]:
    """Returns (letter_grade, score) from a list of findings."""
    score = calculate_score(findings)
    return score_to_grade(score), score
