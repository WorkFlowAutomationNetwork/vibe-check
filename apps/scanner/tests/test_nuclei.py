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


def test_no_matches_returns_single_pass_finding():
    with patch("scanners.nuclei.subprocess.run", return_value=_completed_process("")):
        findings = NucleiScanner(URL).run()

    assert len(findings) == 1
    assert findings[0].severity == "pass"
    assert findings[0].check_name == "nuclei-scan"


def test_multiple_matches_returns_multiple_findings():
    matches = [
        {"template-id": "tmpl-a", "info": {"name": "A", "severity": "low", "description": "a"}, "matched-at": "https://example.com/a"},
        {"template-id": "tmpl-b", "info": {"name": "B", "severity": "critical", "description": "b"}, "matched-at": "https://example.com/b"},
    ]
    with patch("scanners.nuclei.subprocess.run", return_value=_completed_process(_jsonl(*matches))):
        findings = NucleiScanner(URL).run()

    assert len(findings) == 2
    assert {f.check_name for f in findings} == {"nuclei-tmpl-a", "nuclei-tmpl-b"}


def test_missing_remediation_falls_back_to_generic_text():
    match = {
        "template-id": "tmpl-no-remediation",
        "info": {"name": "No Remediation Template", "severity": "medium", "description": "d"},
        "matched-at": "https://example.com/",
    }
    with patch("scanners.nuclei.subprocess.run", return_value=_completed_process(_jsonl(match))):
        findings = NucleiScanner(URL).run()

    assert "Review this finding" in findings[0].remediation


def test_malformed_json_line_is_skipped_others_still_parsed():
    good_match = {"template-id": "tmpl-good", "info": {"name": "Good", "severity": "low", "description": "d"}, "matched-at": "https://example.com/"}
    stdout = "not valid json\n" + json.dumps(good_match) + "\n"
    with patch("scanners.nuclei.subprocess.run", return_value=_completed_process(stdout)):
        findings = NucleiScanner(URL).run()

    assert len(findings) == 1
    assert findings[0].check_name == "nuclei-tmpl-good"


def test_jsonl_line_that_is_a_json_array_is_skipped_others_still_parsed():
    good_match = {"template-id": "tmpl-good", "info": {"name": "Good", "severity": "low", "description": "d"}, "matched-at": "https://example.com/"}
    stdout = json.dumps([1, 2, 3]) + "\n" + json.dumps(good_match) + "\n"
    with patch("scanners.nuclei.subprocess.run", return_value=_completed_process(stdout)):
        findings = NucleiScanner(URL).run()

    assert len(findings) == 1
    assert findings[0].check_name == "nuclei-tmpl-good"


def test_jsonl_line_that_is_a_json_string_is_skipped_others_still_parsed():
    good_match = {"template-id": "tmpl-good", "info": {"name": "Good", "severity": "low", "description": "d"}, "matched-at": "https://example.com/"}
    stdout = json.dumps("just a string") + "\n" + json.dumps(good_match) + "\n"
    with patch("scanners.nuclei.subprocess.run", return_value=_completed_process(stdout)):
        findings = NucleiScanner(URL).run()

    assert len(findings) == 1
    assert findings[0].check_name == "nuclei-tmpl-good"


def test_match_with_non_dict_info_does_not_raise_and_falls_back_to_template_id():
    match = {"template-id": "weird", "info": "oops", "matched-at": "https://example.com"}
    with patch("scanners.nuclei.subprocess.run", return_value=_completed_process(_jsonl(match))):
        findings = NucleiScanner(URL).run()

    assert len(findings) == 1
    f = findings[0]
    assert f.check_name == "nuclei-weird"
    assert f.title == "weird"
    assert f.severity == "info"


def test_binary_not_found_returns_empty_list():
    with patch("scanners.nuclei.subprocess.run", side_effect=FileNotFoundError("nuclei: not found")):
        findings = NucleiScanner(URL).run()
    assert findings == []


def test_timeout_returns_empty_list():
    with patch("scanners.nuclei.subprocess.run", side_effect=subprocess.TimeoutExpired(cmd="nuclei", timeout=300)):
        findings = NucleiScanner(URL).run()
    assert findings == []


def test_nonzero_exit_with_no_stdout_returns_empty_pass_set_not_crash():
    with patch("scanners.nuclei.subprocess.run", return_value=_completed_process("", returncode=1)):
        findings = NucleiScanner(URL).run()
    # Nuclei exiting non-zero with no output is treated the same as "ran clean,
    # no matches" — there's no reliable signal here that distinguishes a real
    # failure from "exited 1 with nothing to report", so we don't raise either way.
    assert len(findings) == 1
    assert findings[0].severity == "pass"


def test_invocation_uses_safe_tag_scope_and_rate_limit():
    mock_run = MagicMock(return_value=_completed_process(""))
    with patch("scanners.nuclei.subprocess.run", mock_run):
        NucleiScanner(URL).run()

    args, kwargs = mock_run.call_args
    command = args[0]
    assert command[0] == "nuclei"
    assert "-u" in command and URL in command
    assert "-tags" in command
    assert command[command.index("-tags") + 1] == "cve,exposure,misconfig,default-login,tech"
    assert "-etags" in command
    assert command[command.index("-etags") + 1] == "dos,fuzz,intrusive"
    assert "-rate-limit" in command
    assert command[command.index("-rate-limit") + 1] == "50"
    assert kwargs["timeout"] == 300
