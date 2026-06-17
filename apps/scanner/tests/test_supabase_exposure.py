import base64
import json

import httpx
import respx
from scanners.supabase_exposure import SupabaseExposureScanner


def _fake_jwt(role: str) -> str:
    """Build a structurally valid (but unsigned, non-credential) JWT for the
    given role claim. Constructed at runtime rather than hard-coded so secret
    scanners (e.g. GitGuardian) don't flag the fixtures as real keys — there is
    no signed token here, just header.payload.<placeholder>."""
    def seg(obj: dict) -> str:
        raw = json.dumps(obj, separators=(",", ":")).encode()
        return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()

    return f"{seg({'alg': 'HS256'})}.{seg({'role': role})}.not-a-real-signature"


BASE_URL = "https://example.com"
SUPABASE_URL = "https://abcdefghijklmno.supabase.co"
ANON_KEY = _fake_jwt("anon")
SERVICE_ROLE_KEY = _fake_jwt("service_role")

PAGE_HTML = '<html><script src="/app.js"></script></html>'
APP_JS = (
    f'window.__SUPABASE_URL__="{SUPABASE_URL}";'
    f'window.__SUPABASE_ANON_KEY__="{ANON_KEY}";'
)
APP_JS_SERVICE_ROLE_ONLY = (
    f'window.__SUPABASE_URL__="{SUPABASE_URL}";'
    f'window.__SUPABASE_SERVICE_KEY__="{SERVICE_ROLE_KEY}";'
)
APP_JS_SERVICE_ROLE_AND_ANON = (
    f'window.__SUPABASE_URL__="{SUPABASE_URL}";'
    f'window.__SUPABASE_SERVICE_KEY__="{SERVICE_ROLE_KEY}";'
    f'window.__SUPABASE_ANON_KEY__="{ANON_KEY}";'
)

OPENAPI_DOC = {
    "paths": {
        "/profiles": {},
        "/scans": {},
    }
}


def _mock_page_and_script():
    respx.get(BASE_URL + "/").mock(return_value=httpx.Response(200, text=PAGE_HTML))
    respx.get(f"{BASE_URL}/app.js").mock(return_value=httpx.Response(200, text=APP_JS))


def test_no_credentials_found_returns_info_finding():
    with respx.mock:
        respx.get(BASE_URL).mock(return_value=httpx.Response(200, text="<html>no keys here</html>"))
        findings = SupabaseExposureScanner(BASE_URL).run()
    assert len(findings) == 1
    assert findings[0].severity == "info"
    assert findings[0].check_name == "supabase-rls-exposure"
    assert "No Supabase backend" in findings[0].title


def test_credentials_found_all_tables_protected_returns_pass():
    with respx.mock:
        _mock_page_and_script()
        respx.get(f"{SUPABASE_URL}/rest/v1/").mock(return_value=httpx.Response(200, json=OPENAPI_DOC))
        respx.get(f"{SUPABASE_URL}/rest/v1/profiles").mock(return_value=httpx.Response(200, json=[]))
        respx.get(f"{SUPABASE_URL}/rest/v1/scans").mock(return_value=httpx.Response(200, json=[]))
        findings = SupabaseExposureScanner(BASE_URL).run()

    assert len(findings) == 1
    assert findings[0].severity == "pass"


def test_exposed_table_returns_critical_without_row_contents():
    with respx.mock:
        _mock_page_and_script()
        respx.get(f"{SUPABASE_URL}/rest/v1/").mock(return_value=httpx.Response(200, json=OPENAPI_DOC))
        respx.get(f"{SUPABASE_URL}/rest/v1/profiles").mock(
            return_value=httpx.Response(200, json=[{"id": 1, "email": "victim@example.com"}])
        )
        respx.get(f"{SUPABASE_URL}/rest/v1/scans").mock(return_value=httpx.Response(200, json=[]))
        findings = SupabaseExposureScanner(BASE_URL).run()

    assert len(findings) == 1
    assert findings[0].severity == "critical"
    assert "profiles" in findings[0].title
    assert "victim@example.com" not in findings[0].description
    assert "victim@example.com" not in findings[0].what_we_did


def test_root_schema_request_fails_returns_info_finding():
    with respx.mock:
        _mock_page_and_script()
        respx.get(f"{SUPABASE_URL}/rest/v1/").mock(side_effect=httpx.ConnectError("refused"))
        findings = SupabaseExposureScanner(BASE_URL).run()
    assert len(findings) == 1
    assert findings[0].severity == "info"
    assert findings[0].check_name == "supabase-rls-exposure"


def test_service_role_jwt_alone_is_not_used_as_credentials():
    with respx.mock:
        respx.get(BASE_URL + "/").mock(return_value=httpx.Response(200, text=PAGE_HTML))
        respx.get(f"{BASE_URL}/app.js").mock(
            return_value=httpx.Response(200, text=APP_JS_SERVICE_ROLE_ONLY)
        )
        findings = SupabaseExposureScanner(BASE_URL).run()
    assert len(findings) == 1
    assert findings[0].severity == "info"


def test_empty_openapi_paths_falls_back_to_common_table_guesses():
    with respx.mock:
        _mock_page_and_script()
        respx.get(f"{SUPABASE_URL}/rest/v1/").mock(return_value=httpx.Response(200, json={"paths": {}}))
        respx.get(f"{SUPABASE_URL}/rest/v1/profiles").mock(
            return_value=httpx.Response(200, json=[{"id": 1}])
        )
        respx.route(method="GET", url__regex=rf"{SUPABASE_URL}/rest/v1/.+").mock(
            return_value=httpx.Response(404)
        )
        # More specific route registered last wins in respx priority order,
        # so re-register the profiles mock to take precedence over the catch-all.
        respx.get(f"{SUPABASE_URL}/rest/v1/profiles").mock(
            return_value=httpx.Response(200, json=[{"id": 1}])
        )
        findings = SupabaseExposureScanner(BASE_URL).run()

    assert len(findings) == 1
    assert findings[0].severity == "critical"
    assert "profiles" in findings[0].title


def test_guesses_that_all_404_produce_no_false_pass_claim():
    with respx.mock:
        _mock_page_and_script()
        respx.get(f"{SUPABASE_URL}/rest/v1/").mock(return_value=httpx.Response(200, json={"paths": {}}))
        respx.route(method="GET", url__regex=rf"{SUPABASE_URL}/rest/v1/.+").mock(
            return_value=httpx.Response(404)
        )
        findings = SupabaseExposureScanner(BASE_URL).run()

    assert len(findings) == 1
    assert findings[0].severity == "info"
    assert findings[0].check_name == "supabase-rls-exposure"


def test_anon_jwt_is_used_even_when_service_role_jwt_also_present():
    with respx.mock:
        respx.get(BASE_URL + "/").mock(return_value=httpx.Response(200, text=PAGE_HTML))
        respx.get(f"{BASE_URL}/app.js").mock(
            return_value=httpx.Response(200, text=APP_JS_SERVICE_ROLE_AND_ANON)
        )
        respx.get(f"{SUPABASE_URL}/rest/v1/").mock(return_value=httpx.Response(200, json=OPENAPI_DOC))
        respx.get(f"{SUPABASE_URL}/rest/v1/profiles").mock(return_value=httpx.Response(200, json=[]))
        respx.get(f"{SUPABASE_URL}/rest/v1/scans").mock(return_value=httpx.Response(200, json=[]))

        findings = SupabaseExposureScanner(BASE_URL).run()

        discover_call = respx.calls[2]
        assert discover_call.request.headers["apikey"] == ANON_KEY
        assert discover_call.request.headers["authorization"] == f"Bearer {ANON_KEY}"

    assert len(findings) == 1
    assert findings[0].severity == "pass"
