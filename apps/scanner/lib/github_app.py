# apps/scanner/lib/github_app.py
import time

import httpx
import jwt as pyjwt

from lib.settings import settings


class GitHubAppError(Exception):
    pass


def _private_key() -> str:
    key = settings.github_app_private_key
    if not key:
        raise GitHubAppError("GITHUB_APP_PRIVATE_KEY is not set")
    return key.replace("\\n", "\n")


def build_app_jwt(now: int | None = None) -> str:
    """Short-lived (≤10 min) App JWT signed RS256 with the App private key.

    iat is backdated 60s to tolerate clock skew, exp is +9 min — both inside
    GitHub's 10-minute ceiling.
    """
    if not settings.github_app_id:
        raise GitHubAppError("GITHUB_APP_ID is not set")
    now = int(time.time()) if now is None else now
    payload = {"iss": settings.github_app_id, "iat": now - 60, "exp": now + 540}
    return pyjwt.encode(payload, _private_key(), algorithm="RS256")


def mint_installation_token(
    installation_id: int, repository_ids: list[int] | None = None
) -> str:
    """Exchange the App JWT for a short-lived installation token, optionally
    scoped to specific repository ids. Returns the token string only."""
    app_jwt = build_app_jwt()
    body: dict = {}
    if repository_ids is not None:
        body["repository_ids"] = repository_ids
    resp = httpx.post(
        f"{settings.github_api_url}/app/installations/{installation_id}/access_tokens",
        headers={
            "Authorization": f"Bearer {app_jwt}",
            "Accept": "application/vnd.github+json",
        },
        json=body,
        timeout=15,
    )
    if resp.status_code not in (200, 201):
        raise GitHubAppError(
            f"installation token mint failed: {resp.status_code}"
        )
    token = resp.json().get("token")
    if not token:
        raise GitHubAppError("installation token response missing 'token'")
    return token
