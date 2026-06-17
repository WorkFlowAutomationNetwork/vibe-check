import base64
import json
import re

# JWT-shaped token: header.payload.signature, base64url segments.
JWT_RE = re.compile(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+")


def decode_jwt_role(token: str) -> str | None:
    """Decode the payload segment of a JWT and return its "role" claim, or None.

    Structural decode only — does NOT verify the signature. Used to classify
    Supabase keys (anon = publishable, service_role = secret) found in
    client-side code.
    """
    parts = token.split(".")
    if len(parts) != 3:
        return None
    payload_segment = parts[1]
    padded = payload_segment + "=" * (-len(payload_segment) % 4)
    try:
        decoded = base64.urlsafe_b64decode(padded)
        payload = json.loads(decoded)
    except (ValueError, UnicodeDecodeError):
        return None
    if not isinstance(payload, dict):
        return None
    role = payload.get("role")
    return role if isinstance(role, str) else None
