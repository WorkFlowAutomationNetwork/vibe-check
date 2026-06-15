import pytest
from unittest.mock import MagicMock, patch


@pytest.fixture
def mock_sb():
    with patch("lib.consent.get_supabase") as mock:
        client = MagicMock()
        mock.return_value = client
        yield client


def _chain(client, data):
    """Configures the supabase query chain to return data."""
    (
        client.table.return_value
        .select.return_value
        .eq.return_value
        .eq.return_value
        .single.return_value
        .execute.return_value
        .data
    ) = data


def test_verify_returns_url_when_verified(mock_sb):
    from lib.consent import verify
    _chain(mock_sb, {"url": "https://example.com", "verified": True})
    result = verify("url-uuid-123")
    assert result == "https://example.com"


def test_verify_raises_when_not_verified(mock_sb):
    from lib.consent import verify, ConsentError
    _chain(mock_sb, None)
    with pytest.raises(ConsentError):
        verify("url-uuid-123")


def test_verify_raises_when_url_not_found(mock_sb):
    from lib.consent import verify, ConsentError
    _chain(mock_sb, None)
    with pytest.raises(ConsentError):
        verify("missing-uuid")
