import hashlib
import re
from dataclasses import dataclass
from typing import Literal

from lib.js_extraction import fetch_page_and_scripts
from lib.jwt import JWT_RE, decode_jwt_role
from scanners.base import BaseScanner, Finding

Kind = Literal["secret", "publishable"]

_MAX_SECRETS = 25


def _mask(raw: str) -> str:
    """Identifier for a detected key: the last 4 chars only. The full secret is
    never stored — this is all that reaches the database (A5 invariant)."""
    return f"…{raw[-4:]}" if len(raw) >= 4 else raw


# Dictionary keywords (example/placeholder/changeme) are word-boundaried so they
# only match as standalone words, not as substrings embedded in a key-shaped
# alphanumeric run (e.g. AWS's "AKIAIOSFODNN7EXAMPLE1" must NOT be treated as a
# placeholder — dropping a real key-shaped value is a false negative).
_PLACEHOLDER_RE = re.compile(
    r"(x{4,}|your[-_]|\bexample\b|\bplaceholder\b|\bchangeme\b|\.\.\.|<|>)", re.IGNORECASE
)


def _is_placeholder(raw: str) -> bool:
    """True for obvious example/placeholder values we should not flag."""
    if _PLACEHOLDER_RE.search(raw):
        return True
    # Token body of all-same / near-constant chars (e.g. AKIAAAAA...) is fake.
    body = re.split(r"[_-]", raw)[-1]
    # Obvious dummy: a long run of one repeated character (e.g. AKIAAAAA…).
    # Threshold 6 so realistic keys that happen to contain a short 4-5 char
    # run aren't dropped as false negatives (a random key effectively never
    # has 6 identical chars in a row).
    if re.search(r"(.)\1{5,}", body):
        return True
    return len(set(body)) <= 2


@dataclass(frozen=True)
class SecretPattern:
    provider: str
    regex: re.Pattern
    kind: Kind


# Order matters: more specific patterns (Anthropic sk-ant-) must precede the
# broader OpenAI sk- pattern. The OpenAI regex also excludes ant- via lookahead
# so a single key can't match both.
_PATTERNS: list[SecretPattern] = [
    SecretPattern("Stripe secret key", re.compile(r"[sr]k_live_[0-9A-Za-z]{20,}"), "secret"),
    SecretPattern("Stripe test secret key", re.compile(r"[sr]k_test_[0-9A-Za-z]{20,}"), "secret"),
    SecretPattern("Stripe publishable key", re.compile(r"pk_(?:live|test)_[0-9A-Za-z]{20,}"), "publishable"),
    SecretPattern("Anthropic API key", re.compile(r"sk-ant-[0-9A-Za-z_-]{20,}"), "secret"),
    SecretPattern("OpenAI API key", re.compile(r"sk-(?!ant-)(?:proj-)?[0-9A-Za-z_-]{20,}"), "secret"),
    SecretPattern("AWS access key ID", re.compile(r"AKIA[0-9A-Z]{16}"), "secret"),
    SecretPattern("GitHub token", re.compile(r"(?:ghp_[0-9A-Za-z]{36}|github_pat_[0-9A-Za-z_]{59,})"), "secret"),
    SecretPattern("Slack token", re.compile(r"xox[baprs]-[0-9A-Za-z-]{10,}"), "secret"),
    SecretPattern("SendGrid API key", re.compile(r"SG\.[0-9A-Za-z_-]{22}\.[0-9A-Za-z_-]{43}"), "secret"),
    SecretPattern("npm token", re.compile(r"npm_[0-9A-Za-z]{36}"), "secret"),
    SecretPattern("private key", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----"), "secret"),
    SecretPattern("Google API key", re.compile(r"AIza[0-9A-Za-z_-]{35}"), "publishable"),
]


class SecretsScanner(BaseScanner):
    def run(self) -> list[Finding]:
        blobs = fetch_page_and_scripts(self.url, self.timeout)

        # fingerprint (sha256 of raw, in-memory only) -> (provider, masked)
        secrets: dict[str, tuple[str, str]] = {}
        publishable: set[str] = set()

        for blob in blobs:
            for pat in _PATTERNS:
                for match in pat.regex.finditer(blob):
                    raw = match.group(0)
                    if _is_placeholder(raw):
                        continue
                    if pat.kind == "publishable":
                        publishable.add(pat.provider)
                    else:
                        fp = hashlib.sha256(raw.encode()).hexdigest()[:16]
                        secrets.setdefault(fp, (pat.provider, _mask(raw)))

            for match in JWT_RE.finditer(blob):
                token = match.group(0)
                role = decode_jwt_role(token)
                if role == "service_role":
                    fp = hashlib.sha256(token.encode()).hexdigest()[:16]
                    secrets.setdefault(fp, ("Supabase service-role key", _mask(token)))
                elif role == "anon":
                    publishable.add("Supabase anon key")

        return self._build_findings(secrets, publishable)

    def _build_findings(
        self,
        secrets: dict[str, tuple[str, str]],
        publishable: set[str],
    ) -> list[Finding]:
        findings: list[Finding] = []

        for provider, masked in list(secrets.values())[:_MAX_SECRETS]:
            test_note = (
                " Even though this is a test-mode key, we flag it as critical: a leaked "
                "test key reveals a credential-handling habit that will eventually leak a "
                "live one. We're tough because we care."
                if "test" in provider.lower()
                else ""
            )
            findings.append(Finding(
                check_name="exposed-secret",
                severity="critical",
                category="secrets",
                title=f"Exposed {provider} in JavaScript bundle",
                description=(
                    f"We found what looks like a live {provider} ({masked}) shipped in your "
                    "site's client-side JavaScript. Anyone who opens your app in a browser can "
                    "read it — this is the single most damaging thing AI-generated apps leak, "
                    f"because one key can drain an account or dump your database.{test_note}"
                ),
                what_we_did=(
                    "Fetched the page and its same-origin JavaScript bundles and matched their "
                    "contents against known credential formats. We never store or use the key "
                    "itself — only the masked identifier above."
                ),
                remediation=(
                    "Rotate this key immediately (assume it is compromised), then move it "
                    "server-side — an environment variable behind an API route, a serverless "
                    "function, or a Supabase edge function — and never reference it from "
                    "client-side code."
                ),
                metadata={"provider": provider, "masked": masked},
            ))

        if publishable:
            findings.append(Finding(
                check_name="public-keys",
                severity="pass",
                category="secrets",
                title="Public API keys detected — expected in the browser",
                description=(
                    f"We found public/publishable keys ({', '.join(sorted(publishable))}). "
                    "These are designed to live in client-side code and are safe to expose — "
                    "no action needed. We checked so you know the difference between these and "
                    "a real leak."
                ),
                what_we_did="Matched client-side keys against known publishable-key formats.",
                remediation="",
                metadata={"detected": sorted(publishable)},
            ))

        if not secrets:
            findings.append(Finding(
                check_name="exposed-secret",
                severity="pass",
                category="secrets",
                title="No exposed secrets found in JavaScript",
                description=(
                    "We did not find any server-side credentials in the page or its JavaScript "
                    "bundles. Keep secret keys on the server and only ship publishable keys."
                ),
                what_we_did="Scanned the page HTML and same-origin script bundles for known secret patterns.",
                remediation="",
            ))

        return findings
