import pytest
from scanners.base import Finding
from reports.grader import grade, calculate_score, score_to_grade


def make_finding(severity: str) -> Finding:
    return Finding(
        check_name="test-check",
        severity=severity,
        category="Test",
        title="Test finding",
        description="desc",
        what_we_did="checked",
        remediation="fix it",
    )


def test_perfect_score_no_findings():
    letter, score = grade([])
    assert score == 100
    assert letter == "A"


def test_critical_deducts_25():
    _, score = grade([make_finding("critical")])
    assert score == 75


def test_medium_deducts_8():
    _, score = grade([make_finding("medium")])
    assert score == 92


def test_low_deducts_3():
    _, score = grade([make_finding("low")])
    assert score == 97


def test_pass_and_info_dont_deduct():
    _, score = grade([make_finding("pass"), make_finding("info")])
    assert score == 100


def test_score_floors_at_zero():
    findings = [make_finding("critical")] * 10
    _, score = grade(findings)
    assert score == 0


def test_grade_thresholds():
    assert score_to_grade(100) == "A"
    assert score_to_grade(90) == "A"
    assert score_to_grade(89) == "B"
    assert score_to_grade(75) == "B"
    assert score_to_grade(74) == "C"
    assert score_to_grade(60) == "C"
    assert score_to_grade(59) == "D"
    assert score_to_grade(40) == "D"
    assert score_to_grade(39) == "F"
    assert score_to_grade(0) == "F"


def test_mixed_findings_grade():
    findings = [
        make_finding("critical"),  # -25 → 75
        make_finding("medium"),    # -8  → 67
        make_finding("low"),       # -3  → 64
        make_finding("pass"),      # +0
    ]
    letter, score = grade(findings)
    assert score == 64
    assert letter == "C"
