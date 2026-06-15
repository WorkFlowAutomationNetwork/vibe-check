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
    check_name: str
    severity: Severity
    category: str
    title: str
    description: str
    what_we_did: str
    remediation: str

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
