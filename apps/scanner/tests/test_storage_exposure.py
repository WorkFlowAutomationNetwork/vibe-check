import base64
import json

import httpx
import respx
from scanners.storage_exposure import StorageExposureScanner


def _fake_jwt(role: str) -> str:
    """Build a structurally valid (but unsigned, non-credential) JWT for the
    given role claim, constructed at runtime so secret scanners don't flag
    the fixtures as real keys."""
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


def _mock_page_and_script():
    respx.get(BASE_URL + "/").mock(return_value=httpx.Response(200, text=PAGE_HTML))
    respx.get(f"{BASE_URL}/app.js").mock(return_value=httpx.Response(200, text=APP_JS))


def test_no_credentials_found_returns_info_finding():
    with respx.mock:
        respx.get(BASE_URL).mock(return_value=httpx.Response(200, text="<html>no keys here</html>"))
        findings = StorageExposureScanner(BASE_URL).run()
    assert len(findings) == 1
    assert findings[0].severity == "info"
    assert findings[0].check_name == "supabase-storage-exposure"


def test_bucket_list_request_fails_returns_info_finding():
    with respx.mock:
        _mock_page_and_script()
        respx.get(f"{SUPABASE_URL}/storage/v1/bucket").mock(side_effect=httpx.ConnectError("refused"))
        findings = StorageExposureScanner(BASE_URL).run()
    assert len(findings) == 1
    assert findings[0].severity == "info"
    assert findings[0].check_name == "supabase-storage-exposure"


def test_no_buckets_returns_info_finding():
    with respx.mock:
        _mock_page_and_script()
        respx.get(f"{SUPABASE_URL}/storage/v1/bucket").mock(return_value=httpx.Response(200, json=[]))
        findings = StorageExposureScanner(BASE_URL).run()
    assert len(findings) == 1
    assert findings[0].severity == "info"
    assert findings[0].check_name == "supabase-storage-exposure"


def test_public_bucket_is_not_flagged():
    with respx.mock:
        _mock_page_and_script()
        respx.get(f"{SUPABASE_URL}/storage/v1/bucket").mock(
            return_value=httpx.Response(200, json=[{"name": "avatars", "public": True}])
        )
        findings = StorageExposureScanner(BASE_URL).run()
    assert len(findings) == 1
    assert findings[0].severity == "info"
    assert "avatars" not in findings[0].description  # no bucket names leaked into the not-applicable note
    assert findings[0].check_name == "supabase-storage-exposure"


def test_private_bucket_listable_returns_critical_without_filenames():
    with respx.mock:
        _mock_page_and_script()
        respx.get(f"{SUPABASE_URL}/storage/v1/bucket").mock(
            return_value=httpx.Response(200, json=[{"name": "user-documents", "public": False}])
        )
        respx.post(f"{SUPABASE_URL}/storage/v1/object/list/user-documents").mock(
            return_value=httpx.Response(200, json=[{"name": "passport-scan-victim.pdf"}])
        )
        findings = StorageExposureScanner(BASE_URL).run()

    assert len(findings) == 1
    assert findings[0].severity == "critical"
    assert "user-documents" in findings[0].title
    assert "passport-scan-victim.pdf" not in findings[0].description
    assert "passport-scan-victim.pdf" not in findings[0].what_we_did


def test_private_bucket_empty_listing_returns_pass():
    with respx.mock:
        _mock_page_and_script()
        respx.get(f"{SUPABASE_URL}/storage/v1/bucket").mock(
            return_value=httpx.Response(200, json=[{"name": "user-documents", "public": False}])
        )
        respx.post(f"{SUPABASE_URL}/storage/v1/object/list/user-documents").mock(
            return_value=httpx.Response(200, json=[])
        )
        findings = StorageExposureScanner(BASE_URL).run()

    assert len(findings) == 1
    assert findings[0].severity == "pass"


def test_mixed_public_and_exposed_private_bucket():
    with respx.mock:
        _mock_page_and_script()
        respx.get(f"{SUPABASE_URL}/storage/v1/bucket").mock(
            return_value=httpx.Response(
                200,
                json=[
                    {"name": "avatars", "public": True},
                    {"name": "invoices", "public": False},
                ],
            )
        )
        respx.post(f"{SUPABASE_URL}/storage/v1/object/list/invoices").mock(
            return_value=httpx.Response(200, json=[{"name": "invoice-1.pdf"}])
        )
        findings = StorageExposureScanner(BASE_URL).run()

    assert len(findings) == 1
    assert findings[0].severity == "critical"
    assert "invoices" in findings[0].title


def test_object_list_request_fails_for_one_bucket_is_skipped():
    with respx.mock:
        _mock_page_and_script()
        respx.get(f"{SUPABASE_URL}/storage/v1/bucket").mock(
            return_value=httpx.Response(200, json=[{"name": "private-bucket", "public": False}])
        )
        respx.post(f"{SUPABASE_URL}/storage/v1/object/list/private-bucket").mock(
            side_effect=httpx.ConnectError("refused")
        )
        findings = StorageExposureScanner(BASE_URL).run()
    assert len(findings) == 1
    assert findings[0].severity == "pass"
