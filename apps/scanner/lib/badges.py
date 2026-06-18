import secrets
from datetime import datetime, timedelta, timezone

from lib.supabase import get_supabase


def issue_badge(url_id: str, scan_id: str, *, days: int = 30) -> dict:
    """Issue a fresh active trust badge for a URL.

    Enforces the one-active-badge-per-URL rule (see badges table comment) by
    lapsing any existing active badge first, then inserting a new active row
    with a secret public token and a `days`-day expiry. Returns the inserted
    row so the caller can log a badge_issued event."""
    sb = get_supabase()

    sb.table("badges").update({"status": "lapsed"}) \
        .eq("url_id", url_id).eq("status", "active").execute()

    row = {
        "url_id": url_id,
        "scan_id": scan_id,
        "status": "active",
        "public_token": secrets.token_urlsafe(24),
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=days)).isoformat(),
    }
    sb.table("badges").insert(row).execute()
    return row
