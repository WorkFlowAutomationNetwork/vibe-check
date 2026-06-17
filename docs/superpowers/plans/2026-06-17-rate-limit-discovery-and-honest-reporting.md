# Rate-Limit Discovery Fix & Honest Active-Scan Reporting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `RateLimitScanner` so it actually finds non-standard login endpoints (like `/portal/login`) and action-less React forms, and make every "active scan" checker (rate-limit, Supabase table exposure, Supabase storage exposure) emit an honest finding instead of silently returning `[]` — so the report UI's "Active scans in this report" badges reflect what actually happened.

**Architecture:** `RateLimitScanner`'s discovery step is split into a cheap GET-only phase (homepage form check → homepage login-link extraction → generic path existence checks) that picks exactly one target, followed by the existing 8-POST rate-limit battery run exactly once on that target. `SupabaseExposureScanner` and `StorageExposureScanner` get small additions: every code path that used to `return []` now returns one `severity: "info"` Finding instead. `StackUpgradeBlock.tsx` gains a `check_name` → badge-entry lookup so it can render three states (locked / ran-but-nothing-to-test / ran-with-result) instead of a static checkmark.

**Tech Stack:** Python 3.12, `httpx`, `respx` (test mocking), pytest — scanner side. TypeScript/React, Next.js — report UI side (no test runner configured for `apps/web`; verification there is `npm run type-check` plus manual report inspection).

## Global Constraints

- Finding's text fields (description/what_we_did/remediation) must never contain raw response bodies, row contents, or PII — counts/labels/identifiers only (`scanners/base.py`'s documented security invariant). All new Finding copy in this plan is static explanatory text with no target-supplied data beyond counts and known-safe identifiers (table/bucket names, URLs) — already consistent with this invariant.
- `RateLimitScanner`'s rate-limit POST battery (`_N_ATTEMPTS = 8`) must run **at most once** per scan — never repeated per-candidate as today's code risks.
- Worst-case total requests for `RateLimitScanner` against the target site: 1 (homepage) + 2 (link candidates) + 6 (generic paths) + 8 (POST battery) = 17. This must hold after the change — verified by a dedicated test.
- New info-severity Findings reuse each scanner's existing `check_name` (`rate-limit-probe`, `supabase-rls-exposure`, `supabase-storage-exposure`) — no new check_name strings.
- `category` per scanner stays as it already is: `"auth"` for `RateLimitScanner`, `"endpoints"` for `SupabaseExposureScanner`/`StorageExposureScanner` (both already valid values in the `findings.category` DB check constraint).
- No change to which scan tier includes which scanner, no JS-bundle parsing, no broader same-origin crawling beyond homepage-extracted links (all explicitly rejected in the spec).

---

### Task 1: `RateLimitScanner` discovery redesign

**Files:**
- Modify: `apps/scanner/scanners/rate_limit.py` (full rewrite of discovery logic; `_build_finding`'s pass/medium branch logic is reused, not rewritten)
- Modify: `apps/scanner/tests/test_rate_limit.py` (3 existing tests updated for new behavior, 7 new tests added)
- Modify: `CLAUDE.md` (the Python subprocess-timeout convention paragraph — this scanner isn't a subprocess call, so check the "Key conventions" section for where rate-limit's request count, if documented, needs updating; if not currently documented there, add one line)

**Interfaces:**
- Produces: `RateLimitScanner.run() -> list[Finding]` (unchanged signature) — now always returns a non-empty list (never `[]`).

- [ ] **Step 1: Read the current full file to confirm starting point**

Run: `cat apps/scanner/scanners/rate_limit.py` (or open it) — confirm it matches the version below before editing (it should, since this plan was written directly against it):

```python
import re
from urllib.parse import urljoin

import httpx

from scanners.base import BaseScanner, Finding

_N_ATTEMPTS = 8

# Login only — never signup/contact. Probing signup would actually create
# spam accounts on the target (the exact harm this check is meant to
# surface), whereas failed login attempts have no side effects.
_FORM_RE = re.compile(r'<form[^>]*action=["\']([^"\']+)["\'][^>]*>(.*?)</form>', re.IGNORECASE | re.DOTALL)
_PASSWORD_INPUT_RE = re.compile(r'<input[^>]+type=["\']password["\']', re.IGNORECASE)

_COMMON_LOGIN_PATHS = [
    "/api/auth/login", "/api/login", "/login", "/signin",
    "/auth/login", "/api/auth/signin",
]


def _find_login_form_action(html: str) -> str | None:
    for match in _FORM_RE.finditer(html):
        action, body = match.group(1), match.group(2)
        if _PASSWORD_INPUT_RE.search(body):
            return action
    return None


def _looks_throttled(response: httpx.Response) -> bool:
    if response.status_code == 429:
        return True
    return any(h.lower() == "retry-after" for h in response.headers)


class RateLimitScanner(BaseScanner):
    """Probes a discovered login endpoint with a handful of bogus-credential
    POSTs to check whether the target throttles repeated attempts. Paid-tier
    only, deliberately capped at a small request count (CLAUDE.md: lightweight,
    5-10 requests, not unlimited — anything more risks reading as abusive
    traffic against a third party's production site)."""

    def run(self) -> list[Finding]:
        for candidate in self._candidate_endpoints():
            responses = self._probe(candidate)
            if responses is None:
                continue
            if all(r.status_code == 404 for r in responses):
                continue
            return self._build_finding(candidate, responses)
        return []

    def _candidate_endpoints(self) -> list[str]:
        try:
            page = httpx.get(self.url, timeout=self.timeout, follow_redirects=True)
        except httpx.RequestError:
            return []
        if page.status_code != 200:
            return []
        base = str(page.url)
        action = _find_login_form_action(page.text)
        candidates = [urljoin(base, action)] if action else []
        candidates += [urljoin(base, p) for p in _COMMON_LOGIN_PATHS]
        return candidates

    def _probe(self, endpoint: str) -> list[httpx.Response] | None:
        responses: list[httpx.Response] = []
        for i in range(_N_ATTEMPTS):
            try:
                response = httpx.post(
                    endpoint,
                    json={"email": f"vibe-check-probe-{i}@example.com", "password": f"wrong-password-{i}"},
                    timeout=self.timeout,
                )
            except httpx.RequestError:
                break
            responses.append(response)
        return responses or None

    def _build_finding(self, endpoint: str, responses: list[httpx.Response]) -> list[Finding]:
        if any(_looks_throttled(r) for r in responses):
            return [Finding(
                check_name="rate-limit-probe",
                severity="pass",
                category="auth",
                title="Login endpoint enforces rate limiting",
                description=(
                    f"Sent {len(responses)} login attempt(s) with invalid credentials "
                    f"to {endpoint}; throttling was observed (429 response or "
                    "Retry-After header)."
                ),
                what_we_did=f"Sent {len(responses)} POST requests with invalid credentials to {endpoint}.",
                remediation="",
            )]

        return [Finding(
            check_name="rate-limit-probe",
            severity="medium",
            category="auth",
            title="No rate limiting observed on login endpoint",
            description=(
                f"Sent {len(responses)} login attempt(s) with invalid credentials "
                f"to {endpoint}; none were throttled (no 429 response or "
                "Retry-After header seen). This makes credential stuffing and "
                "brute-force attacks against user accounts easier."
            ),
            what_we_did=f"Sent {len(responses)} POST requests with invalid credentials to {endpoint}.",
            remediation=(
                "Add rate limiting (by IP and/or account) to the login endpoint — "
                "most platforms (Vercel, Supabase Edge Functions, Cloudflare) offer "
                "this without custom infrastructure."
            ),
        )]
```

- [ ] **Step 2: Write the new failing tests first**

Open `apps/scanner/tests/test_rate_limit.py`. Replace its entire contents with the version below (it keeps all still-valid existing tests unchanged, rewrites the 3 whose premises no longer hold, and adds 7 new ones). The new fixtures `PAGE_WITH_LOGIN_LINK`, `PAGE_WITH_FALSE_POSITIVE_LINK`, `PORTAL_LOGIN_PAGE_NO_ACTION`, `PORTAL_LOGIN_WITH_ACTION`, `PAGE_WITH_LOGIN_FORM_NO_ACTION` are new.

```python
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
        # respx: more specific routes registered LATER take precedence over
        # an earlier catch-all — register the catch-all first.
        respx.get(url__regex=r".*").mock(return_value=httpx.Response(404))
        respx.get(BASE_URL).mock(return_value=httpx.Response(200, text=PAGE_NO_FORM))
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
        respx.get(BASE_URL).mock(return_value=httpx.Response(200, text=PAGE_WITH_LOGIN_LINK))
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
        respx.get(BASE_URL).mock(return_value=httpx.Response(200, text=PAGE_WITH_LOGIN_LINK))
        respx.get(f"{BASE_URL}/portal/login").mock(return_value=httpx.Response(200, text=PORTAL_LOGIN_WITH_ACTION))
        respx.post(f"{BASE_URL}/api/session").mock(
            return_value=httpx.Response(401, headers={"content-type": "application/json"})
        )
        findings = RateLimitScanner(BASE_URL).run()

    assert len(findings) == 1
    assert "/api/session" in findings[0].description


def test_login_ish_link_with_no_form_is_skipped():
    with respx.mock:
        # respx: more specific routes registered LATER take precedence —
        # register the catch-all first, then the specific URLs.
        respx.get(url__regex=r".*").mock(return_value=httpx.Response(404))
        respx.get(BASE_URL).mock(return_value=httpx.Response(200, text=PAGE_WITH_FALSE_POSITIVE_LINK))
        respx.get(f"{BASE_URL}/forgot-login-help").mock(return_value=httpx.Response(200, text=PAGE_NO_FORM))
        findings = RateLimitScanner(BASE_URL).run()

    assert len(findings) == 1
    assert findings[0].severity == "info"


def test_worst_case_request_count_is_bounded():
    call_count = {"n": 0}

    def _get_counter(request):
        call_count["n"] += 1
        return httpx.Response(404)

    with respx.mock:
        # respx: more specific routes registered LATER take precedence —
        # register the catch-all first, then the homepage.
        respx.get(url__regex=r".*").mock(side_effect=_get_counter)
        respx.get(BASE_URL).mock(return_value=httpx.Response(200, text=PAGE_NO_FORM))
        findings = RateLimitScanner(BASE_URL).run()

    # No links on the homepage, so only the 6 generic-path existence GETs run;
    # all 404, so no POST battery ever fires.
    assert call_count["n"] == 6
    assert findings[0].severity == "info"
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd apps/scanner && python -m pytest tests/test_rate_limit.py -v`
Expected: most tests FAIL — either `AttributeError`/import errors don't occur (file still has the old implementation), but assertions fail because the old code returns `[]` instead of an info Finding, doesn't check existence via GET before POSTing (causing respx `AssertionError: no route registered` for the new `respx.get(...)` mocks that aren't consumed), and doesn't follow links at all.

- [ ] **Step 4: Replace `apps/scanner/scanners/rate_limit.py` with the new implementation**

```python
import re
from urllib.parse import urljoin, urlparse

import httpx

from scanners.base import BaseScanner, Finding

_N_ATTEMPTS = 8
_MAX_LINK_CANDIDATES = 2

# Login only — never signup/contact. Probing signup would actually create
# spam accounts on the target (the exact harm this check is meant to
# surface), whereas failed login attempts have no side effects.
_FORM_RE = re.compile(r'<form([^>]*)>(.*?)</form>', re.IGNORECASE | re.DOTALL)
_ACTION_ATTR_RE = re.compile(r'\baction=["\']([^"\']+)["\']', re.IGNORECASE)
_PASSWORD_INPUT_RE = re.compile(r'<input[^>]+type=["\']password["\']', re.IGNORECASE)
_LINK_RE = re.compile(r'<a[^>]+href=["\']([^"\']+)["\']', re.IGNORECASE)
_LOGIN_LINK_RE = re.compile(r'login|signin|sign-in|auth', re.IGNORECASE)

_COMMON_LOGIN_PATHS = [
    "/api/auth/login", "/api/login", "/login", "/signin",
    "/auth/login", "/api/auth/signin",
]


def _find_login_target(html: str, page_url: str) -> str | None:
    """Search html for a <form> containing a password input. Returns the
    form's action (resolved against page_url) if present, otherwise the
    page's own URL — a bounded fallback for the React/Next.js pattern where
    a form has no action because it submits via onSubmit/fetch() instead of
    a native POST. None if no password-input form is found at all."""
    for match in _FORM_RE.finditer(html):
        attrs, body = match.group(1), match.group(2)
        if not _PASSWORD_INPUT_RE.search(body):
            continue
        action_match = _ACTION_ATTR_RE.search(attrs)
        if action_match:
            return urljoin(page_url, action_match.group(1))
        return page_url
    return None


def _extract_login_links(html: str, page_url: str) -> list[str]:
    """Pull same-origin <a href> links whose path looks login-related, e.g.
    /portal/login — catches non-standard login paths that aren't in
    _COMMON_LOGIN_PATHS, without doing a general crawl. Capped at
    _MAX_LINK_CANDIDATES to keep the discovery phase's request count bounded."""
    base_host = urlparse(page_url).netloc
    seen: set[str] = set()
    links: list[str] = []
    for href in _LINK_RE.findall(html):
        if not _LOGIN_LINK_RE.search(href):
            continue
        resolved = urljoin(page_url, href)
        if urlparse(resolved).netloc != base_host:
            continue
        if resolved in seen:
            continue
        seen.add(resolved)
        links.append(resolved)
        if len(links) >= _MAX_LINK_CANDIDATES:
            break
    return links


def _looks_throttled(response: httpx.Response) -> bool:
    if response.status_code == 429:
        return True
    return any(h.lower() == "retry-after" for h in response.headers)


def _looks_like_page_rerender(response: httpx.Response) -> bool:
    """True when POSTing to the chosen target just re-rendered the page
    (200 + text/html) instead of hitting a real API handler — the signal
    that the same-URL fallback picked a target whose real submit logic is
    client-side JS we can't observe (e.g. calling Supabase Auth directly)."""
    if response.status_code != 200:
        return False
    return response.headers.get("content-type", "").startswith("text/html")


class RateLimitScanner(BaseScanner):
    """Probes a discovered login endpoint with a handful of bogus-credential
    POSTs to check whether the target throttles repeated attempts. Paid-tier
    only, deliberately bounded: a cheap GET-only discovery phase (worst case
    1 homepage + 2 link candidates + 6 generic-path checks = 9 GETs) followed
    by the 8-POST battery run exactly once, on a single chosen target — 17
    requests worst case, far fewer typically. Login only, never signup/
    contact — probing signup would create spam accounts on the target, the
    exact harm this check exists to surface, whereas failed logins have no
    side effects."""

    def run(self) -> list[Finding]:
        target = self._discover_target()
        if target is None:
            return [self._no_target_finding()]

        responses = self._probe(target)
        if responses is None:
            return [self._no_target_finding()]

        if all(_looks_like_page_rerender(r) for r in responses):
            return [self._inconclusive_finding(target)]

        return self._build_finding(target, responses)

    def _discover_target(self) -> str | None:
        try:
            page = httpx.get(self.url, timeout=self.timeout, follow_redirects=True)
        except httpx.RequestError:
            return None
        if page.status_code != 200:
            return None
        base = str(page.url)

        # The homepage itself might be the login page (small/single-page apps).
        target = _find_login_target(page.text, base)
        if target is not None:
            return target

        # Otherwise, follow login-ish nav links to find the real login page —
        # catches non-standard paths like /portal/login that aren't guessable.
        for link in _extract_login_links(page.text, base):
            target = self._check_link_candidate(link)
            if target is not None:
                return target

        # Last resort: the existing generic guessed API-route-shaped paths.
        for path in _COMMON_LOGIN_PATHS:
            candidate = urljoin(base, path)
            if self._path_exists(candidate):
                return candidate

        return None

    def _check_link_candidate(self, link: str) -> str | None:
        try:
            response = httpx.get(link, timeout=self.timeout, follow_redirects=True)
        except httpx.RequestError:
            return None
        if response.status_code == 404:
            return None
        return _find_login_target(response.text, str(response.url))

    def _path_exists(self, candidate: str) -> bool:
        try:
            response = httpx.get(candidate, timeout=self.timeout, follow_redirects=True)
        except httpx.RequestError:
            return False
        return response.status_code != 404

    def _probe(self, endpoint: str) -> list[httpx.Response] | None:
        responses: list[httpx.Response] = []
        for i in range(_N_ATTEMPTS):
            try:
                response = httpx.post(
                    endpoint,
                    json={"email": f"vibe-check-probe-{i}@example.com", "password": f"wrong-password-{i}"},
                    timeout=self.timeout,
                )
            except httpx.RequestError:
                break
            responses.append(response)
        return responses or None

    def _build_finding(self, endpoint: str, responses: list[httpx.Response]) -> list[Finding]:
        if any(_looks_throttled(r) for r in responses):
            return [Finding(
                check_name="rate-limit-probe",
                severity="pass",
                category="auth",
                title="Login endpoint enforces rate limiting",
                description=(
                    f"Sent {len(responses)} login attempt(s) with invalid credentials "
                    f"to {endpoint}; throttling was observed (429 response or "
                    "Retry-After header)."
                ),
                what_we_did=f"Sent {len(responses)} POST requests with invalid credentials to {endpoint}.",
                remediation="",
            )]

        return [Finding(
            check_name="rate-limit-probe",
            severity="medium",
            category="auth",
            title="No rate limiting observed on login endpoint",
            description=(
                f"Sent {len(responses)} login attempt(s) with invalid credentials "
                f"to {endpoint}; none were throttled (no 429 response or "
                "Retry-After header seen). This makes credential stuffing and "
                "brute-force attacks against user accounts easier."
            ),
            what_we_did=f"Sent {len(responses)} POST requests with invalid credentials to {endpoint}.",
            remediation=(
                "Add rate limiting (by IP and/or account) to the login endpoint — "
                "most platforms (Vercel, Supabase Edge Functions, Cloudflare) offer "
                "this without custom infrastructure."
            ),
        )]

    def _no_target_finding(self) -> Finding:
        return Finding(
            check_name="rate-limit-probe",
            severity="info",
            category="auth",
            title="No login endpoint found to test",
            description=(
                "We looked for a login form on the homepage, followed login-ish "
                "navigation links, and tried several common login paths, but "
                "didn't find one to test for rate limiting."
            ),
            what_we_did="Checked the homepage, login-related nav links, and common login paths for a testable endpoint.",
            remediation="",
        )

    def _inconclusive_finding(self, endpoint: str) -> Finding:
        return Finding(
            check_name="rate-limit-probe",
            severity="info",
            category="auth",
            title="Found a login form, but couldn't verify rate limiting",
            description=(
                f"Found a login form at {endpoint}, but posting to it just "
                "returned the page itself rather than a real API response — "
                "common with apps where the browser calls a third-party auth "
                "provider (e.g. Supabase, Firebase) directly instead of the "
                "app's own backend. Rate limiting on that flow is outside what "
                "this scan can verify."
            ),
            what_we_did=f"Sent login attempts to {endpoint} and found the response indistinguishable from the page itself.",
            remediation="",
        )
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/scanner && python -m pytest tests/test_rate_limit.py -v`
Expected: all 14 tests PASS.

- [ ] **Step 6: Update the request-budget documentation**

In `CLAUDE.md`, find the line in the "Key conventions" → "Python" section that currently reads (after the earlier Fly.io redeploy session's edit):
```
Nuclei: 300s max (measured ~257s for the curated safe-tag scope against a real target on the production VM — 120s was the original plan but killed almost every real scan). SQLmap: 90s max. DalFox: 60s max.
```
Add a new line directly after it:
```
RateLimitScanner: capped at 17 requests worst case (1 homepage GET + 2 login-link GETs + 6 generic-path GETs + the 8-POST rate-limit battery, run exactly once on a single chosen target) — see `apps/scanner/scanners/rate_limit.py`.
```

- [ ] **Step 7: Run the full scanner suite to confirm no regressions**

Run: `cd apps/scanner && python -m pytest -v`
Expected: PASS (the suite's total count grows by the net new tests in this task — note the count for your commit message, you'll need it).

- [ ] **Step 8: Commit**

```bash
git add apps/scanner/scanners/rate_limit.py apps/scanner/tests/test_rate_limit.py CLAUDE.md
git commit -m "fix(scanner): RateLimitScanner finds non-standard login paths and action-less forms

Real deep-scan bug: a genuine login form at a non-standard path
(/portal/login style) and forms with no action attribute (React/
Next.js onSubmit pattern) were both invisible to discovery, causing
a silent [] return while the report UI still showed a green
checkmark. Adds bounded same-origin login-link extraction and a
same-URL POST fallback, replaces silent [] with an honest info
Finding, and fixes a latent request-budget bug where the old code
could send up to 48 requests against the target (new worst case: 17,
and the expensive 8-POST battery now runs at most once per scan)."
```

---

### Task 2: `SupabaseExposureScanner` — replace silent `[]` with honest findings

**Files:**
- Modify: `apps/scanner/scanners/supabase_exposure.py`
- Modify: `apps/scanner/tests/test_supabase_exposure.py` (4 existing tests updated, no new tests needed — every silent-`[]` code path already has existing test coverage, just with the old assertion)

**Interfaces:**
- Produces: `SupabaseExposureScanner.run() -> list[Finding]` (unchanged signature) — now always returns a non-empty list.

- [ ] **Step 1: Update the 4 existing tests whose assertions assume `[]`**

In `apps/scanner/tests/test_supabase_exposure.py`, replace these four tests:

```python
def test_no_credentials_found_returns_no_findings():
```
→ rename and rewrite to:
```python
def test_no_credentials_found_returns_info_finding():
    with respx.mock:
        respx.get(BASE_URL).mock(return_value=httpx.Response(200, text="<html>no keys here</html>"))
        findings = SupabaseExposureScanner(BASE_URL).run()
    assert len(findings) == 1
    assert findings[0].severity == "info"
    assert findings[0].check_name == "supabase-rls-exposure"
    assert "No Supabase backend" in findings[0].title
```

```python
def test_root_schema_request_fails_returns_no_findings():
```
→ rename and rewrite to:
```python
def test_root_schema_request_fails_returns_info_finding():
    with respx.mock:
        _mock_page_and_script()
        respx.get(f"{SUPABASE_URL}/rest/v1/").mock(side_effect=httpx.ConnectError("refused"))
        findings = SupabaseExposureScanner(BASE_URL).run()
    assert len(findings) == 1
    assert findings[0].severity == "info"
    assert findings[0].check_name == "supabase-rls-exposure"
```

```python
def test_service_role_jwt_alone_is_not_used_as_credentials():
```
→ keep the name, change only the body's final lines:
```python
def test_service_role_jwt_alone_is_not_used_as_credentials():
    with respx.mock:
        respx.get(BASE_URL + "/").mock(return_value=httpx.Response(200, text=PAGE_HTML))
        respx.get(f"{BASE_URL}/app.js").mock(
            return_value=httpx.Response(200, text=APP_JS_SERVICE_ROLE_ONLY)
        )
        findings = SupabaseExposureScanner(BASE_URL).run()
    assert len(findings) == 1
    assert findings[0].severity == "info"
```

```python
def test_guesses_that_all_404_produce_no_false_pass_claim():
```
→ keep the name (it still documents the right invariant — no false pass claim), change only the final assertion:
```python
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/scanner && python -m pytest tests/test_supabase_exposure.py -v`
Expected: the 4 updated tests FAIL (old code still returns `[]`, so `len(findings) == 1` fails). The other 5 tests still PASS unchanged.

- [ ] **Step 3: Edit `apps/scanner/scanners/supabase_exposure.py`**

Change the `run()` method's first early return:
```python
    def run(self) -> list[Finding]:
        blobs = fetch_page_and_scripts(self.url, self.timeout)
        creds = extract_supabase_credentials(blobs)
        if not creds:
            return []
```
to:
```python
    def run(self) -> list[Finding]:
        blobs = fetch_page_and_scripts(self.url, self.timeout)
        creds = extract_supabase_credentials(blobs)
        if not creds:
            return [self._no_backend_finding()]
```

Change `_probe_tables`'s final line:
```python
        return []
```
(the one after the `if confirmed_count:` block, at the end of the method) to:
```python
        return [self._no_tables_confirmed_finding()]
```

Add these two new methods to the `SupabaseExposureScanner` class (e.g. right after `_probe_tables`):
```python
    def _no_backend_finding(self) -> Finding:
        return Finding(
            check_name="supabase-rls-exposure",
            severity="info",
            category="endpoints",
            title="No Supabase backend detected",
            description=(
                "This check looks for a Supabase project URL and anon key in the "
                "site's client-side code. We didn't find one, so this app doesn't "
                "appear to use Supabase as its database backend — this check only "
                "applies to apps that do."
            ),
            what_we_did="Scanned the page and its JavaScript bundles for a Supabase project URL and anon key.",
            remediation="",
        )

    def _no_tables_confirmed_finding(self) -> Finding:
        return Finding(
            check_name="supabase-rls-exposure",
            severity="info",
            category="endpoints",
            title="Found a Supabase backend, but couldn't confirm any readable tables",
            description=(
                "Found a Supabase project URL and anon key, but none of the table "
                "names we tried (from the project's own API schema, or a list of "
                "common table names) returned a successful response — so we "
                "couldn't confirm any tables exist to check for missing RLS."
            ),
            what_we_did="Queried the Supabase REST API for known and commonly-named tables using the site's public anon key.",
            remediation="",
        )
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/scanner && python -m pytest tests/test_supabase_exposure.py -v`
Expected: all 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/scanner/scanners/supabase_exposure.py apps/scanner/tests/test_supabase_exposure.py
git commit -m "fix(scanner): SupabaseExposureScanner reports when there's nothing to test

Replaces two silent return [] paths (no Supabase backend detected;
backend found but no tables confirmed) with an honest info-severity
Finding, so the report UI's Database Exposure badge can distinguish
'ran, found nothing to test' from 'ran, found a real result'."
```

---

### Task 3: `StorageExposureScanner` — replace silent `[]` with honest findings

**Files:**
- Modify: `apps/scanner/scanners/storage_exposure.py`
- Modify: `apps/scanner/tests/test_storage_exposure.py` (3 existing tests updated)

**Interfaces:**
- Produces: `StorageExposureScanner.run() -> list[Finding]` (unchanged signature) — now always returns a non-empty list.

- [ ] **Step 1: Update the 3 existing tests whose assertions assume `[]`**

In `apps/scanner/tests/test_storage_exposure.py`, replace these three tests:

```python
def test_no_credentials_found_returns_no_findings():
```
→ rename and rewrite to:
```python
def test_no_credentials_found_returns_info_finding():
    with respx.mock:
        respx.get(BASE_URL).mock(return_value=httpx.Response(200, text="<html>no keys here</html>"))
        findings = StorageExposureScanner(BASE_URL).run()
    assert len(findings) == 1
    assert findings[0].severity == "info"
    assert findings[0].check_name == "supabase-storage-exposure"
```

```python
def test_bucket_list_request_fails_returns_no_findings():
```
→ rename and rewrite to:
```python
def test_bucket_list_request_fails_returns_info_finding():
    with respx.mock:
        _mock_page_and_script()
        respx.get(f"{SUPABASE_URL}/storage/v1/bucket").mock(side_effect=httpx.ConnectError("refused"))
        findings = StorageExposureScanner(BASE_URL).run()
    assert len(findings) == 1
    assert findings[0].severity == "info"
    assert findings[0].check_name == "supabase-storage-exposure"
```

```python
def test_no_buckets_returns_no_findings():
```
→ rename and rewrite to:
```python
def test_no_buckets_returns_info_finding():
    with respx.mock:
        _mock_page_and_script()
        respx.get(f"{SUPABASE_URL}/storage/v1/bucket").mock(return_value=httpx.Response(200, json=[]))
        findings = StorageExposureScanner(BASE_URL).run()
    assert len(findings) == 1
    assert findings[0].severity == "info"
    assert findings[0].check_name == "supabase-storage-exposure"
```

Also update `test_public_bucket_is_not_flagged` (its premise changes: an all-public bucket list now gets a Finding too, not `[]`):
```python
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/scanner && python -m pytest tests/test_storage_exposure.py -v`
Expected: the 4 updated tests FAIL. The other 4 tests still PASS unchanged.

- [ ] **Step 3: Edit `apps/scanner/scanners/storage_exposure.py`**

Change `run()`:
```python
    def run(self) -> list[Finding]:
        blobs = fetch_page_and_scripts(self.url, self.timeout)
        creds = extract_supabase_credentials(blobs)
        if not creds:
            return []

        supabase_url, anon_key = creds
        buckets = self._list_buckets(supabase_url, anon_key)
        if not buckets:
            return []

        return self._probe_private_buckets(supabase_url, anon_key, buckets)
```
to:
```python
    def run(self) -> list[Finding]:
        blobs = fetch_page_and_scripts(self.url, self.timeout)
        creds = extract_supabase_credentials(blobs)
        if not creds:
            return [self._no_backend_finding()]

        supabase_url, anon_key = creds
        buckets = self._list_buckets(supabase_url, anon_key)
        if not buckets:
            return [self._no_buckets_finding()]

        return self._probe_private_buckets(supabase_url, anon_key, buckets)
```

Change `_probe_private_buckets`'s final line:
```python
        return []
```
(the one after the `if private_buckets:` block, at the end of the method) to:
```python
        return [self._all_buckets_public_finding(len(buckets))]
```

Add these three new methods to the `StorageExposureScanner` class (e.g. right after `_probe_private_buckets`):
```python
    def _no_backend_finding(self) -> Finding:
        return Finding(
            check_name="supabase-storage-exposure",
            severity="info",
            category="endpoints",
            title="No Supabase backend detected",
            description=(
                "This check looks for a Supabase project URL and anon key in the "
                "site's client-side code. We didn't find one, so this app doesn't "
                "appear to use Supabase Storage — this check only applies to apps "
                "that do."
            ),
            what_we_did="Scanned the page and its JavaScript bundles for a Supabase project URL and anon key.",
            remediation="",
        )

    def _no_buckets_finding(self) -> Finding:
        return Finding(
            check_name="supabase-storage-exposure",
            severity="info",
            category="endpoints",
            title="Found a Supabase backend, but no storage buckets were listable",
            description=(
                "Found a Supabase project URL and anon key, but listing storage "
                "buckets with that key didn't return any — so we couldn't confirm "
                "any buckets exist to check for missing RLS."
            ),
            what_we_did="Listed storage buckets via the Supabase Storage API using the site's public anon key.",
            remediation="",
        )

    def _all_buckets_public_finding(self, bucket_count: int) -> Finding:
        return Finding(
            check_name="supabase-storage-exposure",
            severity="info",
            category="endpoints",
            title="All storage buckets found are public",
            description=(
                f"Found {bucket_count} storage bucket(s), all marked public — "
                "there were no private buckets left to check for missing RLS."
            ),
            what_we_did="Listed storage buckets via the Supabase Storage API and checked which are marked public.",
            remediation="",
        )
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/scanner && python -m pytest tests/test_storage_exposure.py -v`
Expected: all 8 tests PASS.

- [ ] **Step 5: Run the full scanner suite**

Run: `cd apps/scanner && python -m pytest -v`
Expected: PASS, full suite green.

- [ ] **Step 6: Commit**

```bash
git add apps/scanner/scanners/storage_exposure.py apps/scanner/tests/test_storage_exposure.py
git commit -m "fix(scanner): StorageExposureScanner reports when there's nothing to test

Replaces three silent return [] paths (no Supabase backend; backend
found but no buckets listable; buckets found but all public) with an
honest info-severity Finding, matching the same fix just applied to
SupabaseExposureScanner."
```

---

### Task 4: `StackUpgradeBlock.tsx` — honest three-state badges

**Files:**
- Modify: `apps/web/types/index.ts` (add `check_name` to `FindingRow` — the column already exists in the DB and is already fetched via `select('*')` on the authenticated report page; the TypeScript type just doesn't declare it yet)
- Modify: `apps/web/components/report/StackUpgradeBlock.tsx`

**Interfaces:**
- Consumes: `FindingRow` from `@/types`, specifically its (new) `check_name: string` field, plus the existing `severity` and `description` fields.
- No change to `StackUpgradeBlock`'s exported props (`findings: FindingRow[]`, `scanType: string | null`) — only internal rendering logic changes.

- [ ] **Step 1: Add `check_name` to the `FindingRow` type**

In `apps/web/types/index.ts`, find:
```ts
export interface FindingRow {
  id: string
  scan_id: string
  severity: 'critical' | 'medium' | 'low' | 'info' | 'pass'
  category: string
  result: 'pass' | 'fail' | 'warn'
  title: string
  description: string | null
  what_we_did: string | null
  remediation: string | null
  first_seen_at: string
  metadata: Record<string, unknown> | null
}
```
Add `check_name: string` after `scan_id`:
```ts
export interface FindingRow {
  id: string
  scan_id: string
  check_name: string
  severity: 'critical' | 'medium' | 'low' | 'info' | 'pass'
  category: string
  result: 'pass' | 'fail' | 'warn'
  title: string
  description: string | null
  what_we_did: string | null
  remediation: string | null
  first_seen_at: string
  metadata: Record<string, unknown> | null
}
```

This is safe: the authenticated report page (`apps/web/app/(app)/report/[scanId]/page.tsx`) already does `supabase.from('findings').select('*')`, which already returns `check_name` at runtime (it's a real column per `supabase/migrations/20260519000005_findings.sql:6`) — only the TypeScript type was missing it. The public report page uses the separate `public_findings` view, which deliberately excludes `check_name` (and isn't affected by this change since `StackUpgradeBlock` isn't rendered there).

- [ ] **Step 2: Replace `apps/web/components/report/StackUpgradeBlock.tsx`**

Replace the full file with:

```tsx
import Link from 'next/link'
import type { FindingRow } from '@/types'

// Static catalogue of deeper checks, each mapped to the check_name(s) the
// underlying scanner(s) actually use — lets the badge below tell "ran and
// found a real result" apart from "ran, but nothing here to test" instead
// of always showing a green checkmark regardless of outcome.
const ACTIVE_SCANS = [
  {
    name: 'Database Exposure',
    blurb: 'Checks whether your Supabase tables are readable with the public anon key — the #1 way AI-generated apps leak customer data via missing RLS.',
    checkNames: ['supabase-rls-exposure', 'supabase-storage-exposure'],
  },
  {
    name: 'Secrets Exposure',
    blurb: 'Scans your JavaScript bundles for leaked API keys — OpenAI, Stripe, AWS, and Supabase service-role keys that should never reach the browser.',
    checkNames: ['exposed-secret', 'public-keys'],
  },
  {
    name: 'Authentication Review',
    blurb: 'Probes login and signup endpoints for missing rate limiting and other common auth misconfigurations.',
    checkNames: ['rate-limit-probe'],
  },
]

/** Pull the detected tech-stack labels out of the tech-disclosure finding's
 *  metadata, and infer a couple more from other findings (e.g. Supabase). */
function detectedStack(findings: FindingRow[]): string[] {
  const stack: string[] = []

  const tech = findings.find(f => (f.metadata as { detected?: unknown })?.detected)
  const detected = (tech?.metadata as { detected?: string[] } | undefined)?.detected
  if (Array.isArray(detected)) {
    for (const d of detected) if (typeof d === 'string' && !stack.includes(d)) stack.push(d)
  }

  // If a Supabase check ran (any tier), we know they use Supabase.
  if (findings.some(f => f.title.toLowerCase().includes('supabase')) && !stack.includes('Supabase')) {
    stack.push('Supabase')
  }

  return stack
}

type BadgeState = 'locked' | 'neutral' | 'ran'

function badgeStateFor(checkNames: string[], findings: FindingRow[]): { state: BadgeState; note: string | null } {
  const matches = findings.filter(f => checkNames.includes(f.check_name))
  if (matches.length === 0) return { state: 'locked', note: null }
  if (matches.every(f => f.severity === 'info')) {
    return { state: 'neutral', note: matches[0].description }
  }
  return { state: 'ran', note: null }
}

export default function StackUpgradeBlock({
  findings,
  scanType,
}: {
  findings: FindingRow[]
  scanType: string | null
}) {
  const stack = detectedStack(findings)
  const isFree = scanType === 'passive' || scanType == null

  return (
    <section
      style={{
        background: 'var(--bg-card)',
        border: '1.5px solid var(--line)',
        borderRadius: 'var(--radius)',
        padding: '24px 28px',
        marginBottom: 24,
      }}
    >
      {/* Detected stack */}
      <div className="section-label" style={{ marginBottom: 12 }}>Detected stack</div>
      {stack.length > 0 ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          {stack.map(tech => (
            <span
              key={tech}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                background: 'var(--violet-soft)',
                color: 'var(--violet-deep)',
                border: '1px solid var(--violet)',
                borderRadius: 'var(--radius-sm)',
                padding: '4px 10px',
              }}
            >
              {tech}
            </span>
          ))}
        </div>
      ) : (
        <p style={{ fontSize: 13.5, color: 'var(--ink-mute)', margin: '0 0 8px' }}>
          No framework or server software was disclosed in your response headers — good, that&apos;s one less hint for attackers.
        </p>
      )}
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.6, margin: '0 0 24px' }}>
        Many AI-generated apps share a stack — Supabase, Next.js, Vercel — and leak customer data the same handful of ways. The deeper checks below target exactly those patterns.
      </p>

      {/* Active scans available / included */}
      <div className="section-label" style={{ marginBottom: 12 }}>
        {isFree ? 'Active scans available' : 'Active scans in this report'}
      </div>
      <div style={{ display: 'grid', gap: 12, marginBottom: isFree ? 20 : 0 }}>
        {ACTIVE_SCANS.map(scan => {
          const { state, note } = isFree
            ? { state: 'locked' as BadgeState, note: null }
            : badgeStateFor(scan.checkNames, findings)

          const icon = state === 'ran' ? '✓' : state === 'neutral' ? '·' : '🔒'
          const borderColor = state === 'ran'
            ? 'var(--lime-deep)'
            : state === 'neutral'
              ? 'var(--ink-mute)'
              : 'var(--ink-mute)'

          return (
            <div
              key={scan.name}
              style={{
                display: 'flex',
                gap: 14,
                alignItems: 'flex-start',
                borderLeft: `3px solid ${borderColor}`,
                paddingLeft: 14,
                opacity: state === 'locked' ? 0.85 : 1,
              }}
            >
              <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{icon}</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{scan.name}</div>
                <div style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.55 }}>{scan.blurb}</div>
                {note && (
                  <div style={{ fontSize: 12.5, color: 'var(--ink-mute)', lineHeight: 1.5, marginTop: 4 }}>
                    {note}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {isFree && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', paddingTop: 4 }}>
          <Link
            href="/billing"
            className="btn btn-primary"
            style={{ padding: '10px 18px', fontSize: 14, textDecoration: 'none' }}
          >
            Unlock active scans →
          </Link>
          <span style={{ fontSize: 13, color: 'var(--ink-mute)' }}>
            Run all three against your verified app on a paid scan.
          </span>
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 3: Type-check**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: no output (clean).

- [ ] **Step 4: Manual verification against the real scan that started this investigation**

Run the dev server (`cd apps/web && npm run dev`) and open the report page for scan `cfda5237-9c0e-4f71-8ef5-dc8808d839da` (bathroomhealthos.com). Before this task's backend fixes (Tasks 1-3) are deployed, this scan's stored findings predate the fix and won't have the new info Findings — so this specific old scan will still show locked/old behavior depending on what's in scan history. To verify the UI logic itself end-to-end, run a **fresh** deep scan against any target after Tasks 1-3 are deployed and confirm:
- If the target has no discoverable login endpoint, "Authentication Review" shows the neutral "·" marker with the "No login endpoint found to test" text visible underneath the blurb, not a green "✓".
- If the target has no Supabase backend, "Database Exposure" shows the same neutral treatment.
- A target where checks do find something (e.g. against a Supabase-backed app or one with a working login) still shows green "✓" as before.

- [ ] **Step 5: Commit**

```bash
git add apps/web/types/index.ts apps/web/components/report/StackUpgradeBlock.tsx
git commit -m "fix(report): Active-scan badges reflect real outcomes, not a static checkmark

Previously every active/deep scan showed a green checkmark for
Database Exposure / Secrets Exposure / Authentication Review
regardless of whether the underlying scanner found anything to test
— a customer-trust gap surfaced by a real scan where Authentication
Review showed green despite RateLimitScanner returning zero findings.
Now distinguishes ran-with-result (green check) from
ran-but-nothing-applicable (neutral marker, with the reason shown)
from didn't-run-this-tier (locked), using the info-severity findings
the scanner fixes in this branch now emit instead of silently
returning []."
```

---

### Task 5: Final verification

**Files:** none modified — verification only.

- [ ] **Step 1: Run the full scanner test suite**

Run: `cd apps/scanner && python -m pytest -v`
Expected: all tests PASS. Record the final count for reference.

- [ ] **Step 2: Run the web type-check**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: no output (clean).

- [ ] **Step 3: Update `PROJECT_STATUS.md`**

Add a new changelog entry at the top of the file (after reading the current top entry to match its style), summarizing: the real bug found via the bathroomhealthos.com scan, the two compounding root causes, the discovery redesign with its bounded request budget, the five new honest info-findings across the three active-tier scanners, and the badge UI fix. Reference the spec at `docs/superpowers/specs/2026-06-17-rate-limit-discovery-and-honest-reporting-design.md`. Note that this fix only affects scans run after deployment — it does not retroactively backfill findings on already-completed scans (including the bathroomhealthos.com scan that started this investigation). Note that this requires a Fly.io redeploy of the scanner service before it takes effect in production, per the established pattern from the most recent redeploy in this file's history.

- [ ] **Step 4: Commit**

```bash
git add PROJECT_STATUS.md
git commit -m "docs: record rate-limit discovery fix and honest active-scan reporting"
```
