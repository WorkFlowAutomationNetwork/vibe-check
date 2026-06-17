from lib.supabase import get_supabase

_BUCKET = "reports"


def upload_report_pdf(user_id: str, scan_id: str, pdf_bytes: bytes) -> str:
    """Uploads a rendered report PDF to the private `reports` Storage bucket
    at `{user_id}/{scan_id}.pdf` (RLS scopes each user to their own folder —
    see migration 20260521000015) and returns that storage path."""
    path = f"{user_id}/{scan_id}.pdf"
    get_supabase().storage.from_(_BUCKET).upload(
        path,
        pdf_bytes,
        {"content-type": "application/pdf", "x-upsert": "true"},
    )
    return path
