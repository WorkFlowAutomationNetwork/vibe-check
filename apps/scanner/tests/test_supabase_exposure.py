import httpx
import respx
from scanners.supabase_exposure import SupabaseExposureScanner

BASE_URL = "https://example.com"
SUPABASE_URL = "https://abcdefghijklmno.supabase.co"
ANON_KEY = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.abc123signature"

PAGE_HTML = '<html><script src="/app.js"></script></html>'
APP_JS = (
    f'window.__SUPABASE_URL__="{SUPABASE_URL}";'
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


def test_no_credentials_found_returns_no_findings():
    with respx.mock:
        respx.get(BASE_URL).mock(return_value=httpx.Response(200, text="<html>no keys here</html>"))
        findings = SupabaseExposureScanner(BASE_URL).run()
    assert findings == []


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


def test_root_schema_request_fails_returns_no_findings():
    with respx.mock:
        _mock_page_and_script()
        respx.get(f"{SUPABASE_URL}/rest/v1/").mock(side_effect=httpx.ConnectError("refused"))
        findings = SupabaseExposureScanner(BASE_URL).run()
    assert findings == []
