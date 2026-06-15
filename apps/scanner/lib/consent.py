from lib.supabase import get_supabase


class ConsentError(Exception):
    pass


def verify(url_id: str) -> str:
    """Returns the URL string if ownership is verified, raises ConsentError otherwise.

    Must be called before any scan tool runs — gate that ensures we never scan
    a URL the user does not own.
    """
    supabase = get_supabase()
    result = (
        supabase.table("urls")
        .select("url, verified")
        .eq("id", url_id)
        .eq("verified", True)
        .single()
        .execute()
    )
    if not result.data:
        raise ConsentError(f"URL {url_id} is not verified — scan aborted")
    return result.data["url"]
