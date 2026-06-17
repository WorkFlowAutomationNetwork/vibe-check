from abc import ABC, abstractmethod
from dataclasses import dataclass, asdict
from typing import Literal

Severity = Literal["critical", "medium", "low", "info", "pass"]
Result = Literal["pass", "fail", "warn"]


def _severity_to_result(severity: str) -> Result:
    if severity == "pass":
        return "pass"
    if severity in ("critical", "medium"):
        return "fail"
    return "warn"  # low, info


@dataclass
class Finding:
    """A single scan result.

    SECURITY INVARIANT (security review A5 / B1 / B2):
    A finding's text fields and any future `metadata` must NEVER contain raw
    response bodies, row contents, payloads, or any PII read from the target's
    systems. Store likelihood assessments and aggregates only — counts, table
    names, header names, status codes — not the data itself. For a public
    (shareable) scan every field here is world-readable, and the data this
    scanner reads belongs to the customer's end users, not us.

    Good:  "table 'profiles' returned 1 row" (a count).
    Bad:   storing that row, or "user_email=alice@example.com was returned".
    """
    check_name: str
    severity: Severity
    category: str
    title: str
    description: str
    what_we_did: str
    remediation: str
    # Optional structured aggregates (e.g. detected tech-stack names). Subject to
    # the invariant above — counts/identifiers/labels only, never response bodies
    # or PII. Persisted to the findings.metadata jsonb column; NOT exposed via the
    # public_findings view.
    metadata: dict | None = None

    def to_dict(self) -> dict:
        d = asdict(self)
        d["result"] = _severity_to_result(self.severity)
        return d


class BaseScanner(ABC):
    def __init__(self, url: str, timeout: int = 30) -> None:
        self.url = url
        self.timeout = timeout

    @abstractmethod
    def run(self) -> list[Finding]:
        ...
