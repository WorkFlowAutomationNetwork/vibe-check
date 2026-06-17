import httpx
import respx
from scanners.rate_limit import RateLimitScanner

BASE_URL = "https://example.com"

PAGE_WITH_LOGIN_FORM = '''
<html><body>
<form action="/do-login" method="post">
  <input type="email" name="email">
  <input type="password" name="password">
</form>
</body></html>
'''

PAGE_NO_FORM = "<html><body>no forms here</body></html>"


def test_unreachable_page_returns_no_findings():
    with respx.mock:
        respx.get(BASE_URL).mock(side_effect=httpx.ConnectError("refused"))
        findings = RateLimitScanner(BASE_URL).run()
    assert findings == []


def test_no_form_and_all_common_paths_404_returns_no_findings():
    with respx.mock:
        respx.get(BASE_URL).mock(return_value=httpx.Response(200, text=PAGE_NO_FORM))
        respx.post(url__regex=r".*").mock(return_value=httpx.Response(404))
        findings = RateLimitScanner(BASE_URL).run()
    assert findings == []


def test_login_form_with_no_throttling_returns_medium():
    with respx.mock:
        respx.get(BASE_URL).mock(return_value=httpx.Response(200, text=PAGE_WITH_LOGIN_FORM))
        respx.post(f"{BASE_URL}/do-login").mock(return_value=httpx.Response(401))
        findings = RateLimitScanner(BASE_URL).run()

    assert len(findings) == 1
    assert findings[0].severity == "medium"
    assert "do-login" in findings[0].description


def test_login_form_with_429_after_attempts_returns_pass():
    responses = [httpx.Response(401)] * 5 + [httpx.Response(429)] * 3
    with respx.mock:
        respx.get(BASE_URL).mock(return_value=httpx.Response(200, text=PAGE_WITH_LOGIN_FORM))
        respx.post(f"{BASE_URL}/do-login").mock(side_effect=responses)
        findings = RateLimitScanner(BASE_URL).run()

    assert len(findings) == 1
    assert findings[0].severity == "pass"


def test_retry_after_header_counts_as_throttled():
    responses = [httpx.Response(401)] * 7 + [httpx.Response(401, headers={"Retry-After": "30"})]
    with respx.mock:
        respx.get(BASE_URL).mock(return_value=httpx.Response(200, text=PAGE_WITH_LOGIN_FORM))
        respx.post(f"{BASE_URL}/do-login").mock(side_effect=responses)
        findings = RateLimitScanner(BASE_URL).run()

    assert len(findings) == 1
    assert findings[0].severity == "pass"


def test_no_form_falls_back_to_common_login_path():
    with respx.mock:
        respx.get(BASE_URL).mock(return_value=httpx.Response(200, text=PAGE_NO_FORM))
        respx.post(f"{BASE_URL}/api/auth/login").mock(return_value=httpx.Response(401))
        findings = RateLimitScanner(BASE_URL).run()

    assert len(findings) == 1
    assert findings[0].severity == "medium"
    assert "/api/auth/login" in findings[0].description


def test_network_error_on_first_candidate_falls_through_to_next():
    with respx.mock:
        respx.get(BASE_URL).mock(return_value=httpx.Response(200, text=PAGE_NO_FORM))
        respx.post(f"{BASE_URL}/api/auth/login").mock(side_effect=httpx.ConnectError("refused"))
        respx.post(f"{BASE_URL}/api/login").mock(return_value=httpx.Response(401))
        findings = RateLimitScanner(BASE_URL).run()

    assert len(findings) == 1
    assert "/api/login" in findings[0].description


def test_sends_only_eight_attempts():
    call_count = {"n": 0}

    def _responder(request):
        call_count["n"] += 1
        return httpx.Response(401)

    with respx.mock:
        respx.get(BASE_URL).mock(return_value=httpx.Response(200, text=PAGE_WITH_LOGIN_FORM))
        respx.post(f"{BASE_URL}/do-login").mock(side_effect=_responder)
        RateLimitScanner(BASE_URL).run()

    assert call_count["n"] == 8
