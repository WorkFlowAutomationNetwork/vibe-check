import base64
import json

import httpx
import respx

from scanners.secrets import SecretsScanner

BASE_URL = "https://example.com"


def _jwt(role: str) -> str:
    def seg(obj: dict) -> str:
        raw = json.dumps(obj, separators=(",", ":")).encode()
        return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()

    return f"{seg({'alg': 'HS256'})}.{seg({'role': role})}.not-a-real-signature"


# Realistic-but-fake secrets, built inline (no literal committed key strings).
OPENAI = "sk-proj-" + "Abc123Def456Ghi789Jkl012Mno345"
STRIPE_SECRET = "sk_live_" + "4eC39HqLyjWDarjtT1zdp7dcQ9"
STRIPE_TEST_SECRET = "sk_test_" + "BQokikJOvBiI2HlWgH4olfQ2zz"
STRIPE_PUB = "pk_live_" + "51H8sK2eZvKYlo2C0a1b2c3d4e5"
SERVICE_JWT = _jwt("service_role")
ANON_JWT = _jwt("anon")


def _serve(html: str, js: str = ""):
    respx.get(BASE_URL + "/").mock(return_value=httpx.Response(200, text=html))
    if js:
        respx.get(f"{BASE_URL}/app.js").mock(return_value=httpx.Response(200, text=js))


def _run():
    return SecretsScanner(BASE_URL).run()


def test_no_secrets_returns_single_pass():
    with respx.mock:
        _serve("<html>nothing to see</html>")
        findings = _run()
    assert len(findings) == 1
    assert findings[0].severity == "pass"
    assert findings[0].category == "secrets"


def test_exposed_openai_key_is_critical():
    with respx.mock:
        _serve(f'<html><script src="/app.js"></script></html>', js=f'const k="{OPENAI}";')
        findings = _run()
    secret = [f for f in findings if f.severity == "critical"]
    assert len(secret) == 1
    assert "OpenAI" in secret[0].title
    assert secret[0].category == "secrets"


def test_service_role_jwt_is_critical():
    with respx.mock:
        _serve('<html><script src="/app.js"></script></html>', js=f'window.KEY="{SERVICE_JWT}";')
        findings = _run()
    assert any(f.severity == "critical" and "service-role" in f.title.lower() for f in findings)


def test_publishable_keys_are_pass_not_critical():
    with respx.mock:
        _serve(
            '<html><script src="/app.js"></script></html>',
            js=f'const a="{STRIPE_PUB}"; const b="{ANON_JWT}";',
        )
        findings = _run()
    assert all(f.severity != "critical" for f in findings)
    pub = [f for f in findings if f.check_name == "public-keys"]
    assert len(pub) == 1
    assert pub[0].severity == "pass"


def test_same_secret_in_two_bundles_dedupes():
    with respx.mock:
        respx.get(BASE_URL + "/").mock(return_value=httpx.Response(
            200, text='<html><script src="/app.js"></script><script src="/b.js"></script></html>'))
        respx.get(f"{BASE_URL}/app.js").mock(return_value=httpx.Response(200, text=f'k="{STRIPE_SECRET}"'))
        respx.get(f"{BASE_URL}/b.js").mock(return_value=httpx.Response(200, text=f'k2="{STRIPE_SECRET}"'))
        findings = _run()
    criticals = [f for f in findings if f.severity == "critical"]
    assert len(criticals) == 1


def test_test_mode_key_is_critical_with_explanatory_note():
    # Product decision: test-mode keys are still critical — a leaked test key
    # reveals a credential-handling habit that will eventually leak a live one.
    with respx.mock:
        _serve('<html><script src="/app.js"></script></html>', js=f'const k="{STRIPE_TEST_SECRET}";')
        findings = _run()
    critical = [f for f in findings if f.severity == "critical"]
    assert len(critical) == 1
    assert "test" in critical[0].title.lower()
    assert "test-mode key" in critical[0].description.lower()


def test_secret_findings_are_capped():
    # More than _MAX_SECRETS (25) distinct secrets must not produce an unbounded
    # wall of findings.
    from scanners.secrets import _MAX_SECRETS

    keys = [f"sk-proj-Abc123Def456Ghi789Jkl{i:04d}XyZ" for i in range(_MAX_SECRETS + 5)]
    js = ";".join(f'k{i}="{k}"' for i, k in enumerate(keys))
    with respx.mock:
        _serve('<html><script src="/app.js"></script></html>', js=js)
        findings = _run()
    criticals = [f for f in findings if f.severity == "critical"]
    assert len(criticals) == _MAX_SECRETS


def test_full_secret_never_appears_in_findings():
    with respx.mock:
        _serve('<html><script src="/app.js"></script></html>', js=f'const k="{STRIPE_SECRET}";')
        findings = _run()
    serialized = json.dumps([f.to_dict() for f in findings])
    assert STRIPE_SECRET not in serialized              # full secret must not leak
    assert STRIPE_SECRET[-4:] in serialized             # masked tail is fine
