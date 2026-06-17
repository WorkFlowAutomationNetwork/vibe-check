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
