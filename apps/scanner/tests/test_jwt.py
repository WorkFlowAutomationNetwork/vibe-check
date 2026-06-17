import base64
import json

from lib.jwt import JWT_RE, decode_jwt_role


def _jwt(role: str) -> str:
    def seg(obj: dict) -> str:
        raw = json.dumps(obj, separators=(",", ":")).encode()
        return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()

    return f"{seg({'alg': 'HS256'})}.{seg({'role': role})}.not-a-real-signature"


def test_decodes_service_role():
    assert decode_jwt_role(_jwt("service_role")) == "service_role"


def test_decodes_anon():
    assert decode_jwt_role(_jwt("anon")) == "anon"


def test_non_jwt_returns_none():
    assert decode_jwt_role("not.a.jwt") is None
    assert decode_jwt_role("only-one-part") is None


def test_jwt_re_matches_token():
    token = _jwt("anon")
    assert JWT_RE.search(token).group(0) == token
