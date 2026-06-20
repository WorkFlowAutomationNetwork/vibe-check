from lib.supabase import get_supabase


class RepoConsentError(Exception):
    pass


def verify(repo_id: str, user_id: str) -> dict:
    """Repo-scan authorization gate — the equivalent of consent.verify for URLs.

    Returns repo + installation metadata only when the repo belongs to user_id
    AND its installation is active. Raises RepoConsentError otherwise. Must be
    called before any clone/scan runs (spec §6, §9)."""
    supabase = get_supabase()
    result = (
        supabase.table("repos")
        .select("full_name, github_repo_id, last_scanned_sha, "
                "github_installations(installation_id, status)")
        .eq("id", repo_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    row = result.data
    if not row:
        raise RepoConsentError(f"repo {repo_id} not found for user — scan aborted")
    install = row.get("github_installations") or {}
    if install.get("status") != "active":
        raise RepoConsentError(f"repo {repo_id} installation not active — scan aborted")
    return {
        "full_name": row["full_name"],
        "github_repo_id": row["github_repo_id"],
        "installation_id": install["installation_id"],
        "last_scanned_sha": row.get("last_scanned_sha"),
    }
