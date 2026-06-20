import json
from unittest.mock import patch, MagicMock

import pytest


def _fake_run_factory(head_sha, is_ancestor_ok, gitleaks_json, written):
    """Returns a fake subprocess.run that records gitleaks args and writes the
    report file the scanner will read back."""
    def fake_run(cmd, *args, **kwargs):
        if cmd[0] == "git" and cmd[1] == "clone":
            return MagicMock(returncode=0)
        if cmd[:2] == ["git", "rev-parse"]:
            return MagicMock(returncode=0, stdout=head_sha + "\n")
        if cmd[:2] == ["git", "merge-base"]:
            return MagicMock(returncode=0 if is_ancestor_ok else 1)
        if cmd[0] == "gitleaks":
            written.append(cmd)
            # find --report-path value and write the json there
            rp = cmd[cmd.index("--report-path") + 1]
            with open(rp, "w") as f:
                json.dump(gitleaks_json, f)
            return MagicMock(returncode=0)
        return MagicMock(returncode=0, stdout="")
    return fake_run


GITLEAKS_ONE = [{
    "RuleID": "stripe-access-token", "Description": "Stripe", "File": ".env",
    "Commit": "abc", "StartLine": 1, "Fingerprint": "abc:.env:stripe:1",
    "Secret": "sk_live_RAWSECRETVALUE", "Author": "Jo", "Date": "2026-01-01T00:00:00Z",
}]


def test_full_scan_parses_redacted_findings():
    from scanners.github_secrets import GitHubSecretsScanner
    written = []
    fake = _fake_run_factory("HEADSHA", True, GITLEAKS_ONE, written)
    with patch("scanners.github_secrets.subprocess.run", side_effect=fake), \
         patch("scanners.github_secrets.shutil.rmtree") as rmtree:
        res = GitHubSecretsScanner(
            clone_url="https://x-access-token:ghs_t@github.com/o/r.git",
            token="ghs_t",
        ).run()
    assert res.mode == "full"
    assert res.head_sha == "HEADSHA"
    assert len(res.findings) == 1
    assert "RAWSECRETVALUE" not in repr(res.findings)
    # no --log-opts on a full scan
    assert all("--log-opts" not in " ".join(c) for c in written)
    rmtree.assert_called_once()  # clone cleaned up


def test_incremental_scan_uses_log_opts():
    from scanners.github_secrets import GitHubSecretsScanner
    written = []
    fake = _fake_run_factory("HEADSHA", True, [], written)
    with patch("scanners.github_secrets.subprocess.run", side_effect=fake), \
         patch("scanners.github_secrets.shutil.rmtree"):
        res = GitHubSecretsScanner(
            clone_url="https://x-access-token:ghs_t@github.com/o/r.git",
            token="ghs_t", base_sha="BASESHA",
        ).run()
    assert res.mode == "incremental"
    assert res.base_sha == "BASESHA"
    assert any("--log-opts=BASESHA..HEAD" in " ".join(c) for c in written)


def test_force_push_falls_back_to_full():
    from scanners.github_secrets import GitHubSecretsScanner
    written = []
    fake = _fake_run_factory("HEADSHA", False, [], written)  # not an ancestor
    with patch("scanners.github_secrets.subprocess.run", side_effect=fake), \
         patch("scanners.github_secrets.shutil.rmtree"):
        res = GitHubSecretsScanner(
            clone_url="https://x-access-token:ghs_t@github.com/o/r.git",
            token="ghs_t", base_sha="OLDSHA",
        ).run()
    assert res.mode == "full"
    assert all("--log-opts" not in " ".join(c) for c in written)


def test_clone_deleted_even_on_gitleaks_failure():
    from scanners.github_secrets import GitHubSecretsScanner

    def boom(cmd, *a, **k):
        if cmd[0] == "git" and cmd[1] == "clone":
            return MagicMock(returncode=0)
        if cmd[:2] == ["git", "rev-parse"]:
            return MagicMock(returncode=0, stdout="HEADSHA\n")
        if cmd[0] == "gitleaks":
            raise RuntimeError("gitleaks crashed")
        return MagicMock(returncode=0, stdout="")

    with patch("scanners.github_secrets.subprocess.run", side_effect=boom), \
         patch("scanners.github_secrets.shutil.rmtree") as rmtree:
        with pytest.raises(RuntimeError):
            GitHubSecretsScanner(
                clone_url="https://x-access-token:ghs_t@github.com/o/r.git",
                token="ghs_t",
            ).run()
    rmtree.assert_called_once()  # cleanup still ran


def test_failed_clone_raises_repo_scan_error_and_cleans_up():
    from scanners.github_secrets import GitHubSecretsScanner, RepoScanError

    def fake_run(cmd, *args, **kwargs):
        if cmd[0] == "git" and cmd[1] == "clone":
            return MagicMock(returncode=1, stdout="", stderr="fatal: repository not found")
        return MagicMock(returncode=0, stdout="")

    with patch("scanners.github_secrets.subprocess.run", side_effect=fake_run), \
         patch("scanners.github_secrets.shutil.rmtree") as rmtree:
        with pytest.raises(RepoScanError):
            GitHubSecretsScanner(
                clone_url="https://x-access-token:ghs_SECRETTOKEN@github.com/o/r.git",
                token="ghs_SECRETTOKEN",
            ).run()
    rmtree.assert_called_once()  # cleanup still ran


def test_failed_clone_error_does_not_leak_token():
    from scanners.github_secrets import GitHubSecretsScanner, RepoScanError

    def fake_run(cmd, *args, **kwargs):
        if cmd[0] == "git" and cmd[1] == "clone":
            return MagicMock(returncode=1, stdout="", stderr="fatal: repository not found")
        return MagicMock(returncode=0, stdout="")

    with patch("scanners.github_secrets.subprocess.run", side_effect=fake_run), \
         patch("scanners.github_secrets.shutil.rmtree"):
        with pytest.raises(RepoScanError) as exc_info:
            GitHubSecretsScanner(
                clone_url="https://x-access-token:ghs_SECRETTOKEN@github.com/o/r.git",
                token="ghs_SECRETTOKEN",
            ).run()
    assert "ghs_SECRETTOKEN" not in str(exc_info.value)


def test_failed_rev_parse_raises_repo_scan_error_and_cleans_up():
    from scanners.github_secrets import GitHubSecretsScanner, RepoScanError

    def fake_run(cmd, *args, **kwargs):
        if cmd[0] == "git" and cmd[1] == "clone":
            return MagicMock(returncode=0)
        if cmd[:2] == ["git", "rev-parse"]:
            return MagicMock(returncode=128, stdout="")
        return MagicMock(returncode=0, stdout="")

    with patch("scanners.github_secrets.subprocess.run", side_effect=fake_run), \
         patch("scanners.github_secrets.shutil.rmtree") as rmtree:
        with pytest.raises(RepoScanError):
            GitHubSecretsScanner(
                clone_url="https://x-access-token:ghs_t@github.com/o/r.git",
                token="ghs_t",
            ).run()
    rmtree.assert_called_once()  # cleanup still ran


def test_empty_rev_parse_stdout_raises_repo_scan_error():
    from scanners.github_secrets import GitHubSecretsScanner, RepoScanError

    def fake_run(cmd, *args, **kwargs):
        if cmd[0] == "git" and cmd[1] == "clone":
            return MagicMock(returncode=0)
        if cmd[:2] == ["git", "rev-parse"]:
            return MagicMock(returncode=0, stdout="")
        return MagicMock(returncode=0, stdout="")

    with patch("scanners.github_secrets.subprocess.run", side_effect=fake_run), \
         patch("scanners.github_secrets.shutil.rmtree") as rmtree:
        with pytest.raises(RepoScanError):
            GitHubSecretsScanner(
                clone_url="https://x-access-token:ghs_t@github.com/o/r.git",
                token="ghs_t",
            ).run()
    rmtree.assert_called_once()  # cleanup still ran
