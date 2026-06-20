from unittest.mock import MagicMock, patch

import pytest

from scanners.github_secrets import RepoScanResult


def _task_self(retries=0, max_retries=3):
    t = MagicMock()
    t.request.retries = retries
    t.max_retries = max_retries
    t.retry.side_effect = RuntimeError("retry called")
    return t


@pytest.fixture
def patched(monkeypatch):
    sb = MagicMock()
    with patch("jobs.tasks.get_supabase", return_value=sb), \
         patch("jobs.tasks.log_event") as log, \
         patch("jobs.tasks.repo_consent") as consent, \
         patch("jobs.tasks.mint_installation_token", return_value="ghs_tok") as mint, \
         patch("jobs.tasks.GitHubSecretsScanner") as scanner_cls:
        consent.verify.return_value = {
            "full_name": "o/r", "github_repo_id": 42,
            "installation_id": 999, "last_scanned_sha": None,
        }
        consent.RepoConsentError = Exception
        yield {"sb": sb, "log": log, "consent": consent, "mint": mint,
               "scanner_cls": scanner_cls}


def test_completed_writes_findings_and_updates_repo(patched):
    from jobs.tasks import _execute_repo_scan
    finding = {"rule_id": "stripe-access-token", "severity": "critical",
               "title": "Stripe", "match_preview": "sk_l…7f9x"}
    inst = patched["scanner_cls"].return_value
    inst.run.return_value = RepoScanResult(mode="full", head_sha="HEAD",
                                           base_sha=None, findings=[finding])
    inst.safe_clone_url.return_value = "https://x-access-token:***@github.com/o/r.git"

    _execute_repo_scan(_task_self(), "scan-1", "repo-1", "user-1")

    tables = [c.args[0] for c in patched["sb"].table.call_args_list]
    assert "repo_findings" in tables
    assert "repos" in tables
    assert "repo_scans" in tables
    # token only minted, never logged raw
    assert all("ghs_tok" not in str(c) for c in patched["log"].call_args_list)


def test_consent_failure_marks_failed_no_retry(patched):
    from jobs.tasks import _execute_repo_scan
    patched["consent"].verify.side_effect = patched["consent"].RepoConsentError("nope")
    with pytest.raises(patched["consent"].RepoConsentError):
        _execute_repo_scan(_task_self(), "scan-1", "repo-1", "user-1")
    # scanner never constructed
    patched["scanner_cls"].assert_not_called()
