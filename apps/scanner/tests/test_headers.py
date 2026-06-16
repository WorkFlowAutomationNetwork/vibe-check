import pytest
import httpx
import respx
from scanners.headers import HeadersScanner


BASE_URL = "https://example.com"


def run_with_headers(headers: dict) -> list:
    with respx.mock:
        respx.get(BASE_URL).mock(return_value=httpx.Response(200, headers=headers))
        return HeadersScanner(BASE_URL).run()


def test_all_headers_present_and_correct():
    headers = {
        "content-security-policy": "default-src 'self'",
        "strict-transport-security": "max-age=31536000; includeSubDomains",
        "x-content-type-options": "nosniff",
        "x-frame-options": "DENY",
        "referrer-policy": "strict-origin-when-cross-origin",
        "permissions-policy": "camera=(), microphone=()",
    }
    findings = run_with_headers(headers)
    assert all(f.severity == "pass" for f in findings), findings


def test_missing_csp_is_medium():
    headers = {
        "strict-transport-security": "max-age=31536000",
        "x-content-type-options": "nosniff",
        "x-frame-options": "DENY",
        "referrer-policy": "no-referrer",
        "permissions-policy": "camera=()",
    }
    findings = run_with_headers(headers)
    csp_findings = [f for f in findings if "Content-Security-Policy" in f.title and f.severity != "pass"]
    assert len(csp_findings) == 1
    assert csp_findings[0].severity == "medium"


def test_csp_with_unsafe_inline_is_medium():
    headers = {
        "content-security-policy": "default-src 'self' 'unsafe-inline'",
        "strict-transport-security": "max-age=31536000",
        "x-content-type-options": "nosniff",
        "x-frame-options": "DENY",
        "referrer-policy": "no-referrer",
        "permissions-policy": "camera=()",
    }
    findings = run_with_headers(headers)
    csp_findings = [f for f in findings if "Content-Security-Policy" in f.title and f.severity != "pass"]
    assert len(csp_findings) == 1
    assert csp_findings[0].severity == "medium"


def test_missing_hsts_is_medium():
    headers = {
        "content-security-policy": "default-src 'self'",
        "x-content-type-options": "nosniff",
        "x-frame-options": "DENY",
        "referrer-policy": "no-referrer",
        "permissions-policy": "camera=()",
    }
    findings = run_with_headers(headers)
    hsts_findings = [f for f in findings if "Strict-Transport-Security" in f.title and f.severity != "pass"]
    assert len(hsts_findings) == 1
    assert hsts_findings[0].severity == "medium"


def test_hsts_short_max_age_is_medium():
    headers = {
        "content-security-policy": "default-src 'self'",
        "strict-transport-security": "max-age=3600",
        "x-content-type-options": "nosniff",
        "x-frame-options": "DENY",
        "referrer-policy": "no-referrer",
        "permissions-policy": "camera=()",
    }
    findings = run_with_headers(headers)
    hsts_findings = [f for f in findings if "Strict-Transport-Security" in f.title and f.severity != "pass"]
    assert len(hsts_findings) == 1
    assert hsts_findings[0].severity == "medium"


def test_missing_x_content_type_is_medium():
    headers = {
        "content-security-policy": "default-src 'self'",
        "strict-transport-security": "max-age=31536000",
        "x-frame-options": "DENY",
        "referrer-policy": "no-referrer",
        "permissions-policy": "camera=()",
    }
    findings = run_with_headers(headers)
    xcto_findings = [f for f in findings if "X-Content-Type-Options" in f.title and f.severity != "pass"]
    assert len(xcto_findings) == 1
    assert xcto_findings[0].severity == "medium"


def test_missing_x_frame_options_is_medium():
    headers = {
        "content-security-policy": "default-src 'self'",
        "strict-transport-security": "max-age=31536000",
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
        "permissions-policy": "camera=()",
    }
    findings = run_with_headers(headers)
    xfo_findings = [f for f in findings if "X-Frame-Options" in f.title and f.severity != "pass"]
    assert len(xfo_findings) == 1
    assert xfo_findings[0].severity == "medium"


def test_missing_referrer_policy_is_low():
    headers = {
        "content-security-policy": "default-src 'self'",
        "strict-transport-security": "max-age=31536000",
        "x-content-type-options": "nosniff",
        "x-frame-options": "DENY",
        "permissions-policy": "camera=()",
    }
    findings = run_with_headers(headers)
    rp_findings = [f for f in findings if "Referrer-Policy" in f.title and f.severity != "pass"]
    assert len(rp_findings) == 1
    assert rp_findings[0].severity == "low"


def test_missing_permissions_policy_is_low():
    headers = {
        "content-security-policy": "default-src 'self'",
        "strict-transport-security": "max-age=31536000",
        "x-content-type-options": "nosniff",
        "x-frame-options": "DENY",
        "referrer-policy": "no-referrer",
    }
    findings = run_with_headers(headers)
    pp_findings = [f for f in findings if "Permissions-Policy" in f.title and f.severity != "pass"]
    assert len(pp_findings) == 1
    assert pp_findings[0].severity == "low"


def test_connection_error_returns_critical_finding():
    with respx.mock:
        respx.get(BASE_URL).mock(side_effect=httpx.ConnectError("refused"))
        findings = HeadersScanner(BASE_URL).run()
    assert len(findings) == 1
    assert findings[0].severity == "critical"
    assert "connect" in findings[0].title.lower() or "reach" in findings[0].title.lower()
