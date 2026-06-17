"""Regression tests for the Finding security invariant (review A5 / B1 / B2):
findings must never carry raw response bodies, row contents, or PII read from
a target's systems — only aggregates/likelihood assessments. Findings can be
world-readable on public scans, so this discipline is a confidentiality
boundary, not a style preference.
"""

import base64
import json

import httpx
import respx

from scanners.supabase_exposure import SupabaseExposureScanner


def _fake_jwt(role: str) -> str:
    def seg(obj: dict) -> str:
        raw = json.dumps(obj, separators=(",", ":")).encode()
        return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()

    return f"{seg({'alg': 'HS256'})}.{seg({'role': role})}.not-a-real-signature"


BASE_URL = "https://example.com"
SUPABASE_URL = "https://abcdefghijklmno.supabase.co"
ANON_KEY = _fake_jwt("anon")
PAGE_HTML = '<html><script src="/app.js"></script></html>'
APP_JS = (
    f'window.__SUPABASE_URL__="{SUPABASE_URL}";'
    f'window.__SUPABASE_ANON_KEY__="{ANON_KEY}";'
)
OPENAPI_DOC = {"paths": {"/profiles": {}, "/scans": {}}}

# A sensitive row the target's exposed table might return. None of these
# values should ever end up inside a Finding.
SENSITIVE_ROW = {
    "id": 1,
    "email": "alice@victim.example",
    "full_name": "Alice Victim",
    "api_token": "sk-secret-DO-NOT-STORE-0123456789",
    "ssn": "123-45-6789",
}
SENSITIVE_VALUES = ["alice@victim.example", "Alice Victim", "sk-secret-DO-NOT-STORE-0123456789", "123-45-6789"]


def test_exposed_row_contents_never_appear_in_findings():
    with respx.mock:
        respx.get(BASE_URL + "/").mock(return_value=httpx.Response(200, text=PAGE_HTML))
        respx.get(f"{BASE_URL}/app.js").mock(return_value=httpx.Response(200, text=APP_JS))
        respx.get(f"{SUPABASE_URL}/rest/v1/").mock(return_value=httpx.Response(200, json=OPENAPI_DOC))
        # Every probed table leaks a full sensitive row.
        respx.get(url__startswith=f"{SUPABASE_URL}/rest/v1/").mock(
            return_value=httpx.Response(200, json=[SENSITIVE_ROW])
        )
        findings = SupabaseExposureScanner(BASE_URL).run()

    assert findings, "expected an exposure finding for the leaky tables"

    # Serialize every finding exactly as it would be persisted/shared.
    serialized = json.dumps([f.to_dict() for f in findings])
    for secret in SENSITIVE_VALUES:
        assert secret not in serialized, (
            f"Sensitive value {secret!r} leaked into a finding — findings must "
            "store counts/aggregates, never row contents (review A5)."
        )

    # The finding should still record the aggregate (a row count) so the check
    # is meaningful without the contents.
    assert any("row" in f.description.lower() for f in findings)
