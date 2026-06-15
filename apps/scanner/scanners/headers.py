import re
import httpx
from scanners.base import BaseScanner, Finding

_MIN_HSTS_MAX_AGE = 31_536_000  # 1 year in seconds


class HeadersScanner(BaseScanner):
    def run(self) -> list[Finding]:
        try:
            response = httpx.get(self.url, follow_redirects=True, timeout=self.timeout)
        except httpx.RequestError as exc:
            return [Finding(
                severity="critical",
                category="Connectivity",
                title="Failed to connect to URL",
                description=f"Could not reach {self.url}: {exc}",
                what_we_did="Sent an HTTP GET request to the target URL.",
                remediation="Ensure the URL is publicly accessible and returns a valid HTTP response.",
            )]

        headers = {k.lower(): v for k, v in response.headers.items()}
        findings: list[Finding] = []

        findings.extend(self._check_csp(headers))
        findings.extend(self._check_hsts(headers))
        findings.extend(self._check_x_content_type(headers))
        findings.extend(self._check_x_frame_options(headers))
        findings.extend(self._check_simple("referrer-policy", "Referrer-Policy", "low", headers))
        findings.extend(self._check_simple("permissions-policy", "Permissions-Policy", "low", headers))

        return findings

    def _check_csp(self, headers: dict) -> list[Finding]:
        value = headers.get("content-security-policy")
        if not value:
            return [Finding(
                severity="high",
                category="Security Headers",
                title="Content-Security-Policy Missing",
                description="No Content-Security-Policy header was returned by the server.",
                what_we_did="Checked HTTP response headers for Content-Security-Policy.",
                remediation="Add a Content-Security-Policy header. Start with \"default-src 'self'\" and refine.",
            )]
        if "'unsafe-inline'" in value or "'unsafe-eval'" in value:
            return [Finding(
                severity="medium",
                category="Security Headers",
                title="Content-Security-Policy Uses Unsafe Directives",
                description=f"CSP contains 'unsafe-inline' or 'unsafe-eval': {value[:120]}",
                what_we_did="Inspected Content-Security-Policy header value for unsafe directives.",
                remediation="Remove 'unsafe-inline' and 'unsafe-eval'. Use nonces or hashes for inline scripts.",
            )]
        return [Finding(
            severity="pass",
            category="Security Headers",
            title="Content-Security-Policy Present",
            description="Content-Security-Policy header is set without unsafe directives.",
            what_we_did="Checked Content-Security-Policy header.",
            remediation="",
        )]

    def _check_hsts(self, headers: dict) -> list[Finding]:
        value = headers.get("strict-transport-security")
        if not value:
            return [Finding(
                severity="high",
                category="Security Headers",
                title="Strict-Transport-Security Missing",
                description="No HSTS header was returned. Browsers may connect over HTTP.",
                what_we_did="Checked HTTP response headers for Strict-Transport-Security.",
                remediation="Add: Strict-Transport-Security: max-age=31536000; includeSubDomains",
            )]
        match = re.search(r"max-age=(\d+)", value, re.IGNORECASE)
        max_age = int(match.group(1)) if match else 0
        if max_age < _MIN_HSTS_MAX_AGE:
            return [Finding(
                severity="medium",
                category="Security Headers",
                title="Strict-Transport-Security max-age Too Short",
                description=f"HSTS max-age is {max_age}s. Minimum recommended is {_MIN_HSTS_MAX_AGE}s (1 year).",
                what_we_did="Parsed max-age from Strict-Transport-Security header.",
                remediation="Set max-age to at least 31536000 (1 year).",
            )]
        return [Finding(
            severity="pass",
            category="Security Headers",
            title="Strict-Transport-Security Present",
            description=f"HSTS header set with max-age={max_age}s.",
            what_we_did="Checked Strict-Transport-Security header.",
            remediation="",
        )]

    def _check_x_content_type(self, headers: dict) -> list[Finding]:
        value = headers.get("x-content-type-options", "").lower()
        if value == "nosniff":
            return [Finding(
                severity="pass",
                category="Security Headers",
                title="X-Content-Type-Options Set",
                description="X-Content-Type-Options: nosniff is present.",
                what_we_did="Checked X-Content-Type-Options header.",
                remediation="",
            )]
        return [Finding(
            severity="medium",
            category="Security Headers",
            title="X-Content-Type-Options Missing or Incorrect",
            description="X-Content-Type-Options header is missing or not set to 'nosniff'.",
            what_we_did="Checked X-Content-Type-Options header.",
            remediation="Add: X-Content-Type-Options: nosniff",
        )]

    def _check_x_frame_options(self, headers: dict) -> list[Finding]:
        value = headers.get("x-frame-options", "").upper()
        if value in ("DENY", "SAMEORIGIN"):
            return [Finding(
                severity="pass",
                category="Security Headers",
                title="X-Frame-Options Set",
                description=f"X-Frame-Options: {value} is present.",
                what_we_did="Checked X-Frame-Options header.",
                remediation="",
            )]
        return [Finding(
            severity="medium",
            category="Security Headers",
            title="X-Frame-Options Missing or Incorrect",
            description="X-Frame-Options header is missing or not set to DENY or SAMEORIGIN.",
            what_we_did="Checked X-Frame-Options header.",
            remediation="Add: X-Frame-Options: DENY",
        )]

    def _check_simple(self, header_key: str, display_name: str, missing_severity: str, headers: dict) -> list[Finding]:
        if headers.get(header_key):
            return [Finding(
                severity="pass",
                category="Security Headers",
                title=f"{display_name} Present",
                description=f"{display_name} header is set.",
                what_we_did=f"Checked {display_name} header.",
                remediation="",
            )]
        return [Finding(
            severity=missing_severity,
            category="Security Headers",
            title=f"{display_name} Missing",
            description=f"No {display_name} header was returned by the server.",
            what_we_did=f"Checked {display_name} header.",
            remediation=f"Add a {display_name} header.",
        )]
