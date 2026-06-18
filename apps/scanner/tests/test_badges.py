from datetime import datetime, timezone
from unittest.mock import MagicMock, patch


def test_issue_badge_lapses_prior_then_inserts_active():
    with patch("lib.badges.get_supabase") as mock:
        client = MagicMock()
        mock.return_value = client
        from lib.badges import issue_badge
        row = issue_badge("url-1", "scan-1")

    # supersede: prior active badge for this URL is set to lapsed
    client.table.return_value.update.assert_called_once_with({"status": "lapsed"})

    # new active badge inserted
    inserted = client.table.return_value.insert.call_args[0][0]
    assert inserted["url_id"] == "url-1"
    assert inserted["scan_id"] == "scan-1"
    assert inserted["status"] == "active"
    assert inserted["public_token"]
    assert "expires_at" in inserted

    # returned row carries token + expiry for the badge_issued event
    assert row["public_token"] == inserted["public_token"]
    assert row["expires_at"] == inserted["expires_at"]


def test_issue_badge_expiry_is_about_30_days():
    with patch("lib.badges.get_supabase", return_value=MagicMock()):
        from lib.badges import issue_badge
        row = issue_badge("url-1", "scan-1")
    expires = datetime.fromisoformat(row["expires_at"])
    delta = expires - datetime.now(timezone.utc)
    assert 29 <= delta.days <= 30


def test_issue_badge_tokens_are_unique():
    with patch("lib.badges.get_supabase", return_value=MagicMock()):
        from lib.badges import issue_badge
        a = issue_badge("url-1", "scan-1")
        b = issue_badge("url-1", "scan-2")
    assert a["public_token"] != b["public_token"]
