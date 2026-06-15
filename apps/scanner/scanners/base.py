from abc import ABC, abstractmethod
from dataclasses import dataclass, asdict
from typing import Literal

Severity = Literal["critical", "high", "medium", "low", "info", "pass"]


@dataclass
class Finding:
    severity: Severity
    category: str
    title: str
    description: str
    what_we_did: str
    remediation: str

    def to_dict(self) -> dict:
        return asdict(self)


class BaseScanner(ABC):
    def __init__(self, url: str, timeout: int = 30) -> None:
        self.url = url
        self.timeout = timeout

    @abstractmethod
    def run(self) -> list[Finding]:
        ...
