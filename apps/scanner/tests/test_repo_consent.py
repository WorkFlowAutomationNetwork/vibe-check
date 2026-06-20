import pytest
from unittest.mock import MagicMock, patch


@pytest.fixture
def mock_sb():
    with patch("lib.repo_consent.get_supabase") as mock:
        client = MagicMock()
        mock.return_value = client
        yield client


def _repo_row(client, data):
    (client.table.return_value.select.return_value.eq.return_value
        .eq.return_value.single.return_value.execute.return_value.data) = data


def test_verify_returns_repo_when_active_and_owned(mock_sb):
    from lib.repo_consent import verify
    _repo_row(mock_sb, {
        "full_name": "o/r", "github_repo_id": 42, "last_scanned_sha": None,
        "github_installations": {"installation_id": 999, "status": "active"},
    })
    out = verify("repo-uuid", "user-uuid")
    assert out["full_name"] == "o/r"
    assert out["installation_id"] == 999
    assert out["github_repo_id"] == 42


def test_verify_raises_when_repo_missing_or_foreign(mock_sb):
    from lib.repo_consent import verify, RepoConsentError
    _repo_row(mock_sb, None)
    with pytest.raises(RepoConsentError):
        verify("repo-uuid", "user-uuid")


def test_verify_raises_when_installation_not_active(mock_sb):
    from lib.repo_consent import verify, RepoConsentError
    _repo_row(mock_sb, {
        "full_name": "o/r", "github_repo_id": 42, "last_scanned_sha": None,
        "github_installations": {"installation_id": 999, "status": "revoked"},
    })
    with pytest.raises(RepoConsentError):
        verify("repo-uuid", "user-uuid")
