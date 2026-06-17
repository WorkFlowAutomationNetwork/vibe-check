import re

from lib.jwt import JWT_RE, decode_jwt_role

SUPABASE_URL_RE = re.compile(r"https://[a-z0-9]+\.supabase\.co")


def find_anon_jwt(blob: str) -> str | None:
    """Return the first JWT-shaped match in blob whose decoded role is "anon"."""
    for match in JWT_RE.finditer(blob):
        token = match.group(0)
        if decode_jwt_role(token) == "anon":
            return token
    return None


def extract_supabase_credentials(blobs: list[str]) -> tuple[str, str] | None:
    """Find a Supabase project URL and its public anon key across page/script blobs."""
    url: str | None = None
    key: str | None = None
    for blob in blobs:
        if url is None:
            match = SUPABASE_URL_RE.search(blob)
            if match:
                url = match.group(0)
        if key is None:
            key = find_anon_jwt(blob)
        if url and key:
            return url, key
    return None
