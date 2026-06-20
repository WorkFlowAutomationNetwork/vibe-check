# apps/scanner/tests/test_github_app.py
import time
import jwt as pyjwt
import pytest
from unittest.mock import patch, MagicMock

# A throwaway RSA key generated only for tests (never a real GitHub key).
TEST_PRIVATE_KEY = None  # set in fixture below


@pytest.fixture(autouse=True)
def _key(monkeypatch):
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.hazmat.primitives import serialization
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()
    # Simulate env \n-escaping
    monkeypatch.setattr("lib.github_app.settings.github_app_id", "12345", raising=False)
    monkeypatch.setattr(
        "lib.github_app.settings.github_app_private_key",
        pem.replace("\n", "\\n"),
        raising=False,
    )
    return key


def test_build_app_jwt_has_expected_claims(_key):
    from lib.github_app import build_app_jwt
    now = int(time.time())
    token = build_app_jwt(now=now)
    pub = _key.public_key()
    claims = pyjwt.decode(token, pub, algorithms=["RS256"])
    assert claims["iss"] == "12345"
    assert claims["iat"] == now - 60
    assert claims["exp"] == now + 540


def test_mint_installation_token_posts_and_returns_token():
    from lib import github_app
    resp = MagicMock(status_code=201)
    resp.json.return_value = {"token": "ghs_installtoken", "expires_at": "2026-06-20T12:00:00Z"}
    with patch("lib.github_app.httpx.post", return_value=resp) as post:
        token = github_app.mint_installation_token(999, repository_ids=[42])
    assert token == "ghs_installtoken"
    url = post.call_args.args[0]
    assert url.endswith("/app/installations/999/access_tokens")
    assert post.call_args.kwargs["json"] == {"repository_ids": [42]}


def test_mint_installation_token_raises_on_error():
    from lib import github_app
    resp = MagicMock(status_code=404)
    resp.json.return_value = {"message": "Not Found"}
    with patch("lib.github_app.httpx.post", return_value=resp):
        with pytest.raises(github_app.GitHubAppError):
            github_app.mint_installation_token(999)


def test_missing_config_raises():
    from lib import github_app
    with patch("lib.github_app.settings.github_app_private_key", None):
        with pytest.raises(github_app.GitHubAppError):
            github_app.build_app_jwt()
