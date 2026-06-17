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
