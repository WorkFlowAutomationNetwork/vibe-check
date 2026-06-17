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

PAGE_WITH_LOGIN_FORM_NO_ACTION = '''
<html><body>
<form>
  <input type="email" name="email">
  <input id="password" type="password" name="password">
</form>
</body></html>
'''

PAGE_NO_FORM = "<html><body>no forms here</body></html>"

PAGE_WITH_LOGIN_LINK = '''
<html><body>
<a href="/portal/login">Log in</a>
</body></html>
'''

PAGE_WITH_FALSE_POSITIVE_LINK = '''
<html><body>
<a href="/forgot-login-help">Trouble logging in?</a>
</body></html>
'''

PORTAL_LOGIN_PAGE_NO_ACTION = '''
<html><body>
<form>
  <input id="password" type="password">
</form>
</body></html>
'''

PORTAL_LOGIN_WITH_ACTION = '''
<html><body>
<form action="/api/session">
  <input id="password" type="password">
</form>
</body></html>
'''


def test_unreachable_page_returns_info_finding():
    with respx.mock:
        respx.get(BASE_URL).mock(side_effect=httpx.ConnectError("refused"))
        findings = RateLimitScanner(BASE_URL).run()
    assert len(findings) == 1
    assert findings[0].severity == "info"
    assert findings[0].check_name == "rate-limit-probe"


def test_no_form_and_all_candidates_404_returns_info_finding():
    with respx.mock:
        # A bare host with no path (BASE_URL) would wildcard-match every path
        # under it, so the homepage gets an explicit "/" here. respx uses
        # first-registered-route-wins, so the specific "/" mock must be
        # registered before the regex catch-all.
        respx.get(BASE_URL + "/").mock(return_value=httpx.Response(200, text=PAGE_NO_FORM))
        respx.get(url__regex=r".*").mock(return_value=httpx.Response(404))
        findings = RateLimitScanner(BASE_URL).run()

    assert len(findings) == 1
    assert findings[0].severity == "info"
    assert findings[0].check_name == "rate-limit-probe"
    assert "No login endpoint found" in findings[0].title


def test_login_form_with_no_throttling_returns_medium():
    with respx.mock:
        respx.get(BASE_URL).mock(return_value=httpx.Response(200, text=PAGE_WITH_LOGIN_FORM))
        respx.post(f"{BASE_URL}/do-login").mock(
            return_value=httpx.Response(401, headers={"content-type": "application/json"})
        )
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
        respx.get(f"{BASE_URL}/api/auth/login").mock(return_value=httpx.Response(200))
        respx.post(f"{BASE_URL}/api/auth/login").mock(
            return_value=httpx.Response(401, headers={"content-type": "application/json"})
        )
        findings = RateLimitScanner(BASE_URL).run()

    assert len(findings) == 1
    assert findings[0].severity == "medium"
    assert "/api/auth/login" in findings[0].description


def test_post_failure_on_chosen_target_returns_info_finding():
    with respx.mock:
        respx.get(BASE_URL).mock(return_value=httpx.Response(200, text=PAGE_NO_FORM))
        respx.get(f"{BASE_URL}/api/auth/login").mock(return_value=httpx.Response(200))
        respx.post(f"{BASE_URL}/api/auth/login").mock(side_effect=httpx.ConnectError("refused"))
        findings = RateLimitScanner(BASE_URL).run()

    assert len(findings) == 1
    assert findings[0].severity == "info"
    assert findings[0].check_name == "rate-limit-probe"


def test_sends_only_eight_attempts():
    call_count = {"n": 0}

    def _responder(request):
        call_count["n"] += 1
        return httpx.Response(401, headers={"content-type": "application/json"})

    with respx.mock:
        respx.get(BASE_URL).mock(return_value=httpx.Response(200, text=PAGE_WITH_LOGIN_FORM))
        respx.post(f"{BASE_URL}/do-login").mock(side_effect=_responder)
        RateLimitScanner(BASE_URL).run()

    assert call_count["n"] == 8


def test_login_form_without_action_falls_back_to_same_url():
    with respx.mock:
        respx.get(BASE_URL).mock(return_value=httpx.Response(200, text=PAGE_WITH_LOGIN_FORM_NO_ACTION))
        respx.post(BASE_URL).mock(
            return_value=httpx.Response(401, headers={"content-type": "application/json"})
        )
        findings = RateLimitScanner(BASE_URL).run()

    assert len(findings) == 1
    assert findings[0].severity == "medium"
    assert BASE_URL in findings[0].description


def test_same_url_fallback_response_looks_like_page_is_treated_as_inconclusive():
    with respx.mock:
        respx.get(BASE_URL).mock(return_value=httpx.Response(200, text=PAGE_WITH_LOGIN_FORM_NO_ACTION))
        respx.post(BASE_URL).mock(
            return_value=httpx.Response(200, text=PAGE_WITH_LOGIN_FORM_NO_ACTION, headers={"content-type": "text/html"})
        )
        findings = RateLimitScanner(BASE_URL).run()

    assert len(findings) == 1
    assert findings[0].severity == "info"
    assert findings[0].check_name == "rate-limit-probe"
    assert "couldn't verify" in findings[0].title.lower()


def test_link_derived_candidate_with_no_action_uses_its_own_url():
    with respx.mock:
        respx.get(BASE_URL + "/").mock(return_value=httpx.Response(200, text=PAGE_WITH_LOGIN_LINK))
        respx.get(f"{BASE_URL}/portal/login").mock(return_value=httpx.Response(200, text=PORTAL_LOGIN_PAGE_NO_ACTION))
        respx.post(f"{BASE_URL}/portal/login").mock(
            return_value=httpx.Response(401, headers={"content-type": "application/json"})
        )
        findings = RateLimitScanner(BASE_URL).run()

    assert len(findings) == 1
    assert findings[0].severity == "medium"
    assert "/portal/login" in findings[0].description


def test_link_derived_candidate_with_action_uses_resolved_action():
    with respx.mock:
        respx.get(BASE_URL + "/").mock(return_value=httpx.Response(200, text=PAGE_WITH_LOGIN_LINK))
        respx.get(f"{BASE_URL}/portal/login").mock(return_value=httpx.Response(200, text=PORTAL_LOGIN_WITH_ACTION))
        respx.post(f"{BASE_URL}/api/session").mock(
            return_value=httpx.Response(401, headers={"content-type": "application/json"})
        )
        findings = RateLimitScanner(BASE_URL).run()

    assert len(findings) == 1
    assert "/api/session" in findings[0].description


def test_login_ish_link_with_no_form_is_skipped():
    with respx.mock:
        respx.get(BASE_URL + "/").mock(return_value=httpx.Response(200, text=PAGE_WITH_FALSE_POSITIVE_LINK))
        respx.get(f"{BASE_URL}/forgot-login-help").mock(return_value=httpx.Response(200, text=PAGE_NO_FORM))
        respx.get(url__regex=r".*").mock(return_value=httpx.Response(404))
        findings = RateLimitScanner(BASE_URL).run()

    assert len(findings) == 1
    assert findings[0].severity == "info"


def test_worst_case_request_count_is_bounded():
    call_count = {"n": 0}

    def _get_counter(request):
        call_count["n"] += 1
        return httpx.Response(404)

    with respx.mock:
        respx.get(BASE_URL + "/").mock(return_value=httpx.Response(200, text=PAGE_NO_FORM))
        respx.get(url__regex=r".*").mock(side_effect=_get_counter)
        findings = RateLimitScanner(BASE_URL).run()

    # No links on the homepage, so only the 6 generic-path existence GETs run;
    # all 404, so no POST battery ever fires.
    assert call_count["n"] == 6
    assert findings[0].severity == "info"
