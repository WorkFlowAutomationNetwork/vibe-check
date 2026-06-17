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
                check_name="connectivity",
                severity="critical",
                category="headers",
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
        findings.extend(self._check_simple("referrer-policy", "referrer-policy", "Referrer-Policy", "low", headers))
        findings.extend(self._check_simple("permissions-policy", "permissions-policy", "Permissions-Policy", "low", headers))
        findings.extend(self._check_tech_disclosure(headers))

        return findings

    # Headers that reveal the server/framework stack. The value is also the data
    # source for the report's "Detected Stack" block (Sprint 1, item 4).
    _DISCLOSURE_HEADERS = ("x-powered-by", "server", "x-fah-adapter", "x-aspnet-version", "x-generator")

    @staticmethod
    def _infer_tech(header: str, value: str) -> str:
        """Map a disclosure header value to a friendly technology label."""
        v = value.lower()
        if header == "x-fah-adapter" and v.startswith("nextjs"):
            # e.g. "nextjs-14.0.21" -> "Next.js (14.0.21)"
            ver = value.split("-", 1)[1] if "-" in value else ""
            return f"Next.js ({ver})" if ver else "Next.js"
        if "next.js" in v or "nextjs" in v:
            return "Next.js"
        if header == "x-aspnet-version":
            return f"ASP.NET ({value})"
        known = {
            "express": "Express",
            "nginx": "nginx",
            "apache": "Apache",
            "vercel": "Vercel",
            "cloudflare": "Cloudflare",
            "netlify": "Netlify",
            "php": "PHP",
            "django": "Django",
            "flask": "Flask",
        }
        for key, label in known.items():
            if key in v:
                # keep the version suffix where present (e.g. nginx/1.25 -> "nginx (1.25)")
                if "/" in value and value.lower().startswith(key):
                    return f"{label} ({value.split('/', 1)[1]})"
                return label
        # Unrecognised — surface the raw value so the report still shows something.
        return value

    def _check_tech_disclosure(self, headers: dict) -> list[Finding]:
        present = {h: headers[h] for h in self._DISCLOSURE_HEADERS if headers.get(h)}

        if not present:
            return [Finding(
                check_name="tech-disclosure",
                severity="pass",
                category="headers",
                title="No tech-stack disclosure in headers",
                description="The server did not leak framework or server-software details in its response headers.",
                what_we_did="Checked X-Powered-By, Server, X-Fah-Adapter and similar headers for stack disclosure.",
                remediation="",
            )]

        detected: list[str] = []
        for header, value in present.items():
            tech = self._infer_tech(header, value)
            if tech not in detected:
                detected.append(tech)

        leaked = ", ".join(f"{h}: {v}" for h, v in present.items())
        return [Finding(
            check_name="tech-disclosure",
            severity="low",
            category="headers",
            title="Your stack is visible in response headers",
            description=(
                f"Your app advertises its technology stack in HTTP headers ({leaked}). "
                "This is common for AI-generated apps deployed on Vercel/Netlify and isn't "
                "exploitable on its own, but it hands attackers a free shortcut: knowing you "
                "run a specific framework/version lets them target known CVEs for it directly."
            ),
            what_we_did="Inspected response headers that commonly reveal the server and framework stack.",
            remediation=(
                "Strip or override these headers at your edge/CDN. On Next.js set "
                "`poweredByHeader: false` in next.config.js; on Vercel/nginx remove or rewrite "
                "the Server and X-Powered-By headers."
            ),
            metadata={"detected": detected, "headers": present},
        )]

    def _check_csp(self, headers: dict) -> list[Finding]:
        value = headers.get("content-security-policy")
        if not value:
            return [Finding(
                check_name="csp",
                severity="medium",
                category="headers",
                title="Content-Security-Policy Missing",
                description=(
                    "No Content-Security-Policy header was returned. Most AI-generated apps "
                    "(Next.js on Vercel, Vite, etc.) ship without one by default — it's not set "
                    "for you. Without a CSP, a single injected script can run freely in your "
                    "users' browsers, which is the difference between a bug and a stolen session."
                ),
                what_we_did="Checked HTTP response headers for Content-Security-Policy.",
                remediation=(
                    "Add a Content-Security-Policy header. On Next.js set it in `next.config.js` "
                    "headers() or middleware; start with \"default-src 'self'\" and loosen only "
                    "what your app actually needs."
                ),
            )]
        if "'unsafe-inline'" in value or "'unsafe-eval'" in value:
            return [Finding(
                check_name="csp",
                severity="medium",
                category="headers",
                title="Content-Security-Policy Uses Unsafe Directives",
                description=f"CSP contains 'unsafe-inline' or 'unsafe-eval': {value[:120]}",
                what_we_did="Inspected Content-Security-Policy header value for unsafe directives.",
                remediation="Remove 'unsafe-inline' and 'unsafe-eval'. Use nonces or hashes for inline scripts.",
            )]
        return [Finding(
            check_name="csp",
            severity="pass",
            category="headers",
            title="Content-Security-Policy Present",
            description="Content-Security-Policy header is set without unsafe directives.",
            what_we_did="Checked Content-Security-Policy header.",
            remediation="",
        )]

    def _check_hsts(self, headers: dict) -> list[Finding]:
        value = headers.get("strict-transport-security")
        if not value:
            return [Finding(
                check_name="hsts",
                severity="medium",
                category="headers",
                title="Strict-Transport-Security Missing",
                description="No HSTS header was returned. Browsers may connect over HTTP.",
                what_we_did="Checked HTTP response headers for Strict-Transport-Security.",
                remediation="Add: Strict-Transport-Security: max-age=31536000; includeSubDomains",
            )]
        match = re.search(r"max-age=(\d+)", value, re.IGNORECASE)
        max_age = int(match.group(1)) if match else 0
        if max_age < _MIN_HSTS_MAX_AGE:
            return [Finding(
                check_name="hsts",
                severity="medium",
                category="headers",
                title="Strict-Transport-Security max-age Too Short",
                description=f"HSTS max-age is {max_age}s. Minimum recommended is {_MIN_HSTS_MAX_AGE}s (1 year).",
                what_we_did="Parsed max-age from Strict-Transport-Security header.",
                remediation="Set max-age to at least 31536000 (1 year).",
            )]
        return [Finding(
            check_name="hsts",
            severity="pass",
            category="headers",
            title="Strict-Transport-Security Present",
            description=f"HSTS header set with max-age={max_age}s.",
            what_we_did="Checked Strict-Transport-Security header.",
            remediation="",
        )]

    def _check_x_content_type(self, headers: dict) -> list[Finding]:
        value = headers.get("x-content-type-options", "").lower()
        if value == "nosniff":
            return [Finding(
                check_name="x-content-type-options",
                severity="pass",
                category="headers",
                title="X-Content-Type-Options Set",
                description="X-Content-Type-Options: nosniff is present.",
                what_we_did="Checked X-Content-Type-Options header.",
                remediation="",
            )]
        return [Finding(
            check_name="x-content-type-options",
            severity="medium",
            category="headers",
            title="X-Content-Type-Options Missing or Incorrect",
            description="X-Content-Type-Options header is missing or not set to 'nosniff'.",
            what_we_did="Checked X-Content-Type-Options header.",
            remediation="Add: X-Content-Type-Options: nosniff",
        )]

    def _check_x_frame_options(self, headers: dict) -> list[Finding]:
        value = headers.get("x-frame-options", "").upper()
        if value in ("DENY", "SAMEORIGIN"):
            return [Finding(
                check_name="x-frame-options",
                severity="pass",
                category="headers",
                title="X-Frame-Options Set",
                description=f"X-Frame-Options: {value} is present.",
                what_we_did="Checked X-Frame-Options header.",
                remediation="",
            )]
        return [Finding(
            check_name="x-frame-options",
            severity="medium",
            category="headers",
            title="X-Frame-Options Missing or Incorrect",
            description="X-Frame-Options header is missing or not set to DENY or SAMEORIGIN.",
            what_we_did="Checked X-Frame-Options header.",
            remediation="Add: X-Frame-Options: DENY",
        )]

    def _check_simple(self, check_name: str, header_key: str, display_name: str, missing_severity: str, headers: dict) -> list[Finding]:
        if headers.get(header_key):
            return [Finding(
                check_name=check_name,
                severity="pass",
                category="headers",
                title=f"{display_name} Present",
                description=f"{display_name} header is set.",
                what_we_did=f"Checked {display_name} header.",
                remediation="",
            )]
        return [Finding(
            check_name=check_name,
            severity=missing_severity,  # type: ignore[arg-type]
            category="headers",
            title=f"{display_name} Missing",
            description=f"No {display_name} header was returned by the server.",
            what_we_did=f"Checked {display_name} header.",
            remediation=f"Add a {display_name} header.",
        )]
