import json
import subprocess
from unittest.mock import MagicMock, patch

import pytest

from scanners.nuclei import NucleiScanner

URL = "https://example.com"


def _completed_process(stdout: str, returncode: int = 0) -> subprocess.CompletedProcess:
    return subprocess.CompletedProcess(args=["nuclei"], returncode=returncode, stdout=stdout, stderr="")


def _jsonl(*objs: dict) -> str:
    return "\n".join(json.dumps(o) for o in objs) + "\n"


def test_single_match_returns_one_finding():
    match = {
        "template-id": "exposed-panel-grafana",
        "info": {
            "name": "Grafana Exposed Login Panel",
            "severity": "info",
            "description": "Grafana login panel is exposed.",
        },
        "matched-at": "https://example.com/grafana/login",
    }
    with patch("scanners.nuclei.subprocess.run", return_value=_completed_process(_jsonl(match))):
        findings = NucleiScanner(URL).run()

    assert len(findings) == 1
    f = findings[0]
    assert f.check_name == "nuclei-exposed-panel-grafana"
    assert f.severity == "info"
    assert f.category == "endpoints"
    assert f.title == "Grafana Exposed Login Panel"
    assert f.description == "Grafana login panel is exposed."
    assert "exposed-panel-grafana" in f.what_we_did
    assert "https://example.com/grafana/login" in f.what_we_did


@pytest.mark.parametrize("raw_severity,expected", [
    ("info", "info"),
    ("low", "low"),
    ("medium", "medium"),
    ("high", "critical"),
    ("critical", "critical"),
])
def test_severity_mapping(raw_severity, expected):
    match = {
        "template-id": "some-template",
        "info": {"name": "Some Finding", "severity": raw_severity, "description": "d"},
        "matched-at": "https://example.com/",
    }
    with patch("scanners.nuclei.subprocess.run", return_value=_completed_process(_jsonl(match))):
        findings = NucleiScanner(URL).run()

    assert findings[0].severity == expected
