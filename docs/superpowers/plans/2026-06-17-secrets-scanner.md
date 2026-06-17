# Secrets Scanner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect credentials leaked into a target's client-side JavaScript bundles and report each as a critical finding, while surfacing browser-safe publishable keys as a reassuring pass.

**Architecture:** A new `SecretsScanner(BaseScanner)` reuses `lib.js_extraction.fetch_page_and_scripts` to pull the page + script bundles, runs a curated `SecretPattern` registry plus a Supabase-JWT role check over them, dedupes, masks, and emits `Finding`s. The JWT-role decoder is extracted into a shared `lib/jwt.py` used by both this scanner and the existing Supabase exposure scanner.

**Tech Stack:** Python 3.12, stdlib `re`/`hashlib`/`base64`/`json`, httpx (via existing fetch util), pytest + respx. No new dependencies.

## Global Constraints

- **Branch:** `sprint2-secrets-scanner` (already checked out).
- **Severity enum (exact):** `critical | medium | low | info | pass`. There is no `high`. All real secrets → `critical`; publishable keys → `pass`.
- **A5 invariant:** the full secret value is NEVER stored. Only a masked identifier (`…` + last 4 chars) reaches `description`/`metadata`. A regression test enforces this.
- **Finding category:** must be `"secrets"` (allowed by the `findings` table check constraint).
- **Test fixtures:** build fake keys/JWTs at runtime — no literal secret-shaped strings committed to source (GitGuardian hygiene). Fixtures must look realistic (varied chars) so the placeholder guard does not reject them.
- **Tiers:** secrets scanner runs on `active` and `deep` only; `passive` unchanged.
- **Run scanner tests from** `apps/scanner/` (so `scanners`/`lib` are importable, matching existing tests).

---

### Task 1: Shared JWT-role decoder (`lib/jwt.py`)

Extract the JWT regex + role decoder out of `supabase_exposure.py` into a shared module so the new scanner can classify Supabase keys without a scanner→scanner import. The existing Supabase exposure tests must stay green.

**Files:**
- Create: `apps/scanner/lib/jwt.py`
- Modify: `apps/scanner/scanners/supabase_exposure.py:10-39` (remove local `_JWT_RE` + `_decode_jwt_role`, import from `lib.jwt`)
- Test: `apps/scanner/tests/test_jwt.py` (new); existing `tests/test_supabase_exposure.py` must still pass

**Interfaces:**
- Produces: `lib.jwt.JWT_RE: re.Pattern`, `lib.jwt.decode_jwt_role(token: str) -> str | None`

- [ ] **Step 1: Write the failing test**

Create `apps/scanner/tests/test_jwt.py`:

```python
import base64
import json

from lib.jwt import JWT_RE, decode_jwt_role


def _jwt(role: str) -> str:
    def seg(obj: dict) -> str:
        raw = json.dumps(obj, separators=(",", ":")).encode()
        return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()

    return f"{seg({'alg': 'HS256'})}.{seg({'role': role})}.not-a-real-signature"


def test_decodes_service_role():
    assert decode_jwt_role(_jwt("service_role")) == "service_role"


def test_decodes_anon():
    assert decode_jwt_role(_jwt("anon")) == "anon"


def test_non_jwt_returns_none():
    assert decode_jwt_role("not.a.jwt") is None
    assert decode_jwt_role("only-one-part") is None


def test_jwt_re_matches_token():
    token = _jwt("anon")
    assert JWT_RE.search(token).group(0) == token
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/scanner && python -m pytest tests/test_jwt.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'lib.jwt'`

- [ ] **Step 3: Create `lib/jwt.py`**

```python
import base64
import json
import re

# JWT-shaped token: header.payload.signature, base64url segments.
JWT_RE = re.compile(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+")


def decode_jwt_role(token: str) -> str | None:
    """Decode the payload segment of a JWT and return its "role" claim, or None.

    Structural decode only — does NOT verify the signature. Used to classify
    Supabase keys (anon = publishable, service_role = secret) found in
    client-side code.
    """
    parts = token.split(".")
    if len(parts) != 3:
        return None
    payload_segment = parts[1]
    padded = payload_segment + "=" * (-len(payload_segment) % 4)
    try:
        decoded = base64.urlsafe_b64decode(padded)
        payload = json.loads(decoded)
    except (ValueError, UnicodeDecodeError):
        return None
    if not isinstance(payload, dict):
        return None
    role = payload.get("role")
    return role if isinstance(role, str) else None
```

- [ ] **Step 4: Refactor `supabase_exposure.py` to use the shared module**

In `apps/scanner/scanners/supabase_exposure.py`, replace the top imports and remove the local JWT helpers. Change lines 1-39 so they read:

```python
import re

import httpx

from lib.js_extraction import fetch_page_and_scripts
from lib.jwt import JWT_RE, decode_jwt_role
from scanners.base import BaseScanner, Finding

_SUPABASE_URL_RE = re.compile(r"https://[a-z0-9]+\.supabase\.co")
_MAX_TABLES = 50


def _find_anon_jwt(blob: str) -> str | None:
    """Return the first JWT-shaped match in blob whose decoded role is "anon"."""
    for match in JWT_RE.finditer(blob):
        token = match.group(0)
        if decode_jwt_role(token) == "anon":
            return token
    return None
```

(That deletes the old `_JWT_RE`, `_decode_jwt_role`, and the `import base64`/`import json` lines, which are no longer used in this file. Leave `_extract_supabase_credentials` and the class below unchanged.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/scanner && python -m pytest tests/test_jwt.py tests/test_supabase_exposure.py -q`
Expected: PASS (all green — the exposure tests still work through the shared helper)

- [ ] **Step 6: Commit**

```bash
git add apps/scanner/lib/jwt.py apps/scanner/tests/test_jwt.py apps/scanner/scanners/supabase_exposure.py
git commit -m "refactor(scanner): extract shared lib/jwt.py from supabase_exposure"
```

---

### Task 2: Pattern registry + masking + placeholder guard

The pure-logic core of the scanner: the `SecretPattern` registry, the masker, and the placeholder filter. No network. Fully unit-tested in isolation.

**Files:**
- Create: `apps/scanner/scanners/secrets.py` (partial — helpers + registry only)
- Test: `apps/scanner/tests/test_secrets_patterns.py` (new)

**Interfaces:**
- Produces:
  - `secrets.SecretPattern` dataclass: `provider: str`, `regex: re.Pattern`, `kind: Literal["secret","publishable"]`
  - `secrets._PATTERNS: list[SecretPattern]`
  - `secrets._mask(raw: str) -> str` → `"…" + last 4 chars`
  - `secrets._is_placeholder(raw: str) -> bool`
  - `secrets._MAX_SECRETS: int = 25`

- [ ] **Step 1: Write the failing test**

Create `apps/scanner/tests/test_secrets_patterns.py`:

```python
from scanners.secrets import _PATTERNS, _is_placeholder, _mask


def _first_match(text: str):
    """Return (provider, kind) for the first pattern that matches text."""
    for pat in _PATTERNS:
        if pat.regex.search(text):
            return pat.provider, pat.kind
    return None


def test_mask_shows_only_last_four():
    assert _mask("sk_live_<redacted-fake-body>") == "…p7dc"
    assert _mask("ab") == "ab"  # shorter than 4 -> returned as-is


def test_stripe_live_secret_is_secret():
    provider, kind = _first_match("const k='sk_live_<redacted-fake-body>'")
    assert kind == "secret"
    assert "Stripe" in provider


def test_stripe_test_secret_is_secret():
    _, kind = _first_match("sk_test_<redacted-fake-body>")
    assert kind == "secret"


def test_stripe_publishable_is_publishable():
    _, kind = _first_match("pk_live_<redacted-fake-body>")
    assert kind == "publishable"


def test_openai_key_is_secret_and_not_anthropic():
    provider, kind = _first_match("sk-proj-Abc123Def456Ghi789Jkl012")
    assert kind == "secret"
    assert "OpenAI" in provider


def test_anthropic_key_classified_as_anthropic_not_openai():
    provider, kind = _first_match("sk-ant-Abc123Def456Ghi789Jkl012mno")
    assert "Anthropic" in provider
    assert kind == "secret"


def test_aws_access_key_is_secret():
    _, kind = _first_match("AKIAIOSFODNN7EXAMPLE1")
    assert kind == "secret"


def test_google_api_key_is_publishable():
    _, kind = _first_match("AIzaSyB1c2D3e4F5g6H7i8J9k0L1m2N3o4P5q6R7")
    assert kind == "publishable"


def test_private_key_block_is_secret():
    _, kind = _first_match("-----BEGIN RSA PRIVATE KEY-----")
    assert kind == "secret"


def test_placeholder_values_are_rejected():
    assert _is_placeholder("sk_live_" + "x" * 24")
    assert _is_placeholder("sk-your-key-here-goes-something")
    assert _is_placeholder("AKIAAAAAAAAAAAAAAAAA")  # all-same body
    assert not _is_placeholder("sk_live_<redacted-fake-body>")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/scanner && python -m pytest tests/test_secrets_patterns.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'scanners.secrets'`

- [ ] **Step 3: Create `scanners/secrets.py` (helpers + registry)**

```python
import re
from dataclasses import dataclass
from typing import Literal

Kind = Literal["secret", "publishable"]

_MAX_SECRETS = 25


def _mask(raw: str) -> str:
    """Identifier for a detected key: the last 4 chars only. The full secret is
    never stored — this is all that reaches the database (A5 invariant)."""
    return f"…{raw[-4:]}" if len(raw) >= 4 else raw


_PLACEHOLDER_RE = re.compile(
    r"(x{4,}|your[-_]|example|placeholder|changeme|\.\.\.|<|>)", re.IGNORECASE
)


def _is_placeholder(raw: str) -> bool:
    """True for obvious example/placeholder values we should not flag."""
    if _PLACEHOLDER_RE.search(raw):
        return True
    # Token body of all-same / near-constant chars (e.g. AKIAAAAA...) is fake.
    body = re.split(r"[_-]", raw)[-1]
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/scanner && python -m pytest tests/test_secrets_patterns.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/scanner/scanners/secrets.py apps/scanner/tests/test_secrets_patterns.py
git commit -m "feat(scanner): secrets pattern registry + masking + placeholder guard"
```

---

### Task 3: `SecretsScanner` orchestration + findings

Wire the registry into a `BaseScanner` that fetches bundles, classifies matches (incl. Supabase JWTs), dedupes by content fingerprint, caps, and builds `Finding`s. Includes the A5 masking regression test.

**Files:**
- Modify: `apps/scanner/scanners/secrets.py` (append the scanner class + imports)
- Test: `apps/scanner/tests/test_secrets.py` (new)

**Interfaces:**
- Consumes: `lib.js_extraction.fetch_page_and_scripts(url, timeout) -> list[str]`; `lib.jwt.JWT_RE`, `lib.jwt.decode_jwt_role`; `scanners.base.BaseScanner`, `scanners.base.Finding`; `_PATTERNS`, `_mask`, `_is_placeholder`, `_MAX_SECRETS` from Task 2.
- Produces: `secrets.SecretsScanner(BaseScanner)` with `run() -> list[Finding]`. Findings: `check_name="exposed-secret"` (critical) per secret; one `check_name="public-keys"` (pass) if publishable keys seen; one `check_name="exposed-secret"` (pass) "No exposed secrets" when none found.

- [ ] **Step 1: Write the failing test**

Create `apps/scanner/tests/test_secrets.py`:

```python
import base64
import json

import httpx
import respx

from scanners.secrets import SecretsScanner

BASE_URL = "https://example.com"


def _jwt(role: str) -> str:
    def seg(obj: dict) -> str:
        raw = json.dumps(obj, separators=(",", ":")).encode()
        return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()

    return f"{seg({'alg': 'HS256'})}.{seg({'role': role})}.not-a-real-signature"


# Realistic-but-fake secrets, built inline (no literal committed key strings).
OPENAI = "sk-proj-" + "Abc123Def456Ghi789Jkl012Mno345"
STRIPE_SECRET = "sk_live_" + "<redacted-fake-body>Q9"
STRIPE_PUB = "pk_live_" + "51H8sK2eZvKYlo2C0a1b2c3d4e5"
SERVICE_JWT = _jwt("service_role")
ANON_JWT = _jwt("anon")


def _serve(html: str, js: str = ""):
    respx.get(BASE_URL + "/").mock(return_value=httpx.Response(200, text=html))
    if js:
        respx.get(f"{BASE_URL}/app.js").mock(return_value=httpx.Response(200, text=js))


def _run():
    return SecretsScanner(BASE_URL).run()


def test_no_secrets_returns_single_pass():
    with respx.mock:
        _serve("<html>nothing to see</html>")
        findings = _run()
    assert len(findings) == 1
    assert findings[0].severity == "pass"
    assert findings[0].category == "secrets"


def test_exposed_openai_key_is_critical():
    with respx.mock:
        _serve(f'<html><script src="/app.js"></script></html>', js=f'const k="{OPENAI}";')
        findings = _run()
    secret = [f for f in findings if f.severity == "critical"]
    assert len(secret) == 1
    assert "OpenAI" in secret[0].title
    assert secret[0].category == "secrets"


def test_service_role_jwt_is_critical():
    with respx.mock:
        _serve('<html><script src="/app.js"></script></html>', js=f'window.KEY="{SERVICE_JWT}";')
        findings = _run()
    assert any(f.severity == "critical" and "service-role" in f.title.lower() for f in findings)


def test_publishable_keys_are_pass_not_critical():
    with respx.mock:
        _serve(
            '<html><script src="/app.js"></script></html>',
            js=f'const a="{STRIPE_PUB}"; const b="{ANON_JWT}";',
        )
        findings = _run()
    assert all(f.severity != "critical" for f in findings)
    pub = [f for f in findings if f.check_name == "public-keys"]
    assert len(pub) == 1
    assert pub[0].severity == "pass"


def test_same_secret_in_two_bundles_dedupes():
    with respx.mock:
        respx.get(BASE_URL + "/").mock(return_value=httpx.Response(
            200, text='<html><script src="/app.js"></script><script src="/b.js"></script></html>'))
        respx.get(f"{BASE_URL}/app.js").mock(return_value=httpx.Response(200, text=f'k="{STRIPE_SECRET}"'))
        respx.get(f"{BASE_URL}/b.js").mock(return_value=httpx.Response(200, text=f'k2="{STRIPE_SECRET}"'))
        findings = _run()
    criticals = [f for f in findings if f.severity == "critical"]
    assert len(criticals) == 1


def test_full_secret_never_appears_in_findings():
    with respx.mock:
        _serve('<html><script src="/app.js"></script></html>', js=f'const k="{STRIPE_SECRET}";')
        findings = _run()
    serialized = json.dumps([f.to_dict() for f in findings])
    assert STRIPE_SECRET not in serialized              # full secret must not leak
    assert STRIPE_SECRET[-4:] in serialized             # masked tail is fine
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/scanner && python -m pytest tests/test_secrets.py -q`
Expected: FAIL — `ImportError: cannot import name 'SecretsScanner'`

- [ ] **Step 3: Append the scanner to `scanners/secrets.py`**

Add these imports at the top of `scanners/secrets.py` (with the existing `import re`):

```python
import hashlib

from lib.js_extraction import fetch_page_and_scripts
from lib.jwt import JWT_RE, decode_jwt_role
from scanners.base import BaseScanner, Finding
```

Append at the end of the file:

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/scanner && python -m pytest tests/test_secrets.py -q`
Expected: PASS (all cases, including the masking regression)

- [ ] **Step 5: Commit**

```bash
git add apps/scanner/scanners/secrets.py apps/scanner/tests/test_secrets.py
git commit -m "feat(scanner): SecretsScanner detects leaked credentials in JS bundles"
```

---

### Task 4: Wire into active/deep scan tiers

Register the scanner so paid scans run it.

**Files:**
- Modify: `apps/scanner/jobs/tasks.py:7-9` (import) and `:31-33` (`_scanners_for_tier`)
- Test: `apps/scanner/tests/test_tasks_tiers.py` (new — or add to an existing tier test if present; check first)

**Interfaces:**
- Consumes: `scanners.secrets.SecretsScanner`
- Produces: `SecretsScanner` present in `active` and `deep` tier lists, absent from `passive`.

- [ ] **Step 1: Write the failing test**

Create `apps/scanner/tests/test_tasks_tiers.py`:

```python
from jobs.tasks import _scanners_for_tier
from scanners.secrets import SecretsScanner
from scanners.headers import HeadersScanner


def test_passive_excludes_secrets_scanner():
    assert SecretsScanner not in _scanners_for_tier("passive")
    assert HeadersScanner in _scanners_for_tier("passive")


def test_active_includes_secrets_scanner():
    assert SecretsScanner in _scanners_for_tier("active")


def test_deep_includes_secrets_scanner():
    assert SecretsScanner in _scanners_for_tier("deep")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/scanner && python -m pytest tests/test_tasks_tiers.py -q`
Expected: FAIL — `assert SecretsScanner in [...]` is False for active/deep

- [ ] **Step 3: Add the import and register the scanner**

In `apps/scanner/jobs/tasks.py`, add to the scanner imports (after line 9):

```python
from scanners.secrets import SecretsScanner
```

Then change the `active` list inside `_scanners_for_tier` (line 32) from:

```python
    active = [*passive, SupabaseExposureScanner]
```

to:

```python
    active = [*passive, SupabaseExposureScanner, SecretsScanner]
```

(`deep = [*active]` already inherits it.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/scanner && python -m pytest tests/test_tasks_tiers.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/scanner/jobs/tasks.py apps/scanner/tests/test_tasks_tiers.py
git commit -m "feat(scanner): run secrets scanner on active/deep tiers"
```

---

### Task 5: Full suite, docs, and deploy

Confirm everything is green, update the living docs, and redeploy the scanner.

**Files:**
- Modify: `PROJECT_STATUS.md` (scanner table; "No exposed-secrets scanner" known-gap → resolved; Sprint 2 progress; test count)

- [ ] **Step 1: Run the full scanner suite**

Run: `cd apps/scanner && python -m pytest -q`
Expected: PASS — all prior tests plus the new `test_jwt.py`, `test_secrets_patterns.py`, `test_secrets.py`, `test_tasks_tiers.py`. Note the new total count.

- [ ] **Step 2: Update `PROJECT_STATUS.md`**

- In the scanner component table, add a row:
  `| `SecretsScanner` | ✅ | Scans page + JS bundles for leaked credentials (Stripe/OpenAI/Anthropic/AWS/GitHub/Slack/SendGrid/npm/private keys/Supabase service-role). Critical per secret; publishable keys (Stripe pk_, Supabase anon, Google/Firebase) → pass note. Masked, never stores raw. Active/deep tiers. |`
- In "Known Issues / Gaps", change the `No exposed-secrets scanner` row to ✅ resolved (now `scanners/secrets.py`).
- Update the scanner test count and the "Last updated" header line to record the secrets scanner (Sprint 2, item 6) and that a Fly redeploy is required.

- [ ] **Step 3: Commit docs**

```bash
git add PROJECT_STATUS.md
git commit -m "docs: record secrets scanner (Sprint 2 item 6)"
```

- [ ] **Step 4: Merge to master and push**

```bash
git checkout master
git merge --no-ff sprint2-secrets-scanner -m "Merge sprint2-secrets-scanner: JS-bundle secrets detection"
git push origin master
git branch -d sprint2-secrets-scanner
```

- [ ] **Step 5: Redeploy the scanner to Fly.io**

Run: `cd apps/scanner && fly deploy`
Expected: all machines reach a good state; then verify:
`curl -fsS https://vibe-check-scanner.fly.dev/health` → `{"status":"ok",...}`
(The new scanner only affects active/deep job execution; the health check confirms the service is up.)

---

## Self-Review

**Spec coverage:**
- Module `secrets.py` + `SecretsScanner` → Tasks 2-3. ✓
- Active/deep tier only → Task 4. ✓
- Reuse `fetch_page_and_scripts` → Task 3 Step 3. ✓
- `SecretPattern` registry (secret/publishable) → Task 2. ✓
- Shared `lib/jwt.py` extracted from `supabase_exposure.py` → Task 1. ✓
- Findings: critical per secret, single publishable `pass`, no-secrets `pass` → Task 3. ✓
- Masking / A5 (full secret never stored) + regression test → Tasks 2 (`_mask`) & 3 (`test_full_secret_never_appears_in_findings`). ✓
- False-positive controls (`_is_placeholder`, tight prefixes, dedupe, cap) → Tasks 2-3. ✓
- Test-mode keys critical with explanatory copy → Task 3 Step 3 (`test_note`). ✓
- Runtime-built fixtures, no literal secrets → Tasks 1-4 tests. ✓
- Pattern set matches spec table → Task 2 `_PATTERNS`. ✓ (AWS secret-access-key body intentionally omitted — too generic; AKIA id is the signal, per spec false-positive section.)
- Deploy + PROJECT_STATUS → Task 5. ✓

**Placeholder scan:** No TBD/TODO/"add error handling"; all code shown in full. ✓

**Type consistency:** `decode_jwt_role`/`JWT_RE` defined in Task 1 and consumed by name in Task 3. `_mask`/`_is_placeholder`/`_PATTERNS`/`_MAX_SECRETS`/`SecretPattern` defined in Task 2, consumed in Task 3. `SecretsScanner` defined in Task 3, consumed in Task 4. Finding fields match `scanners/base.py` (incl. the optional `metadata`). ✓

**Scope:** Single subsystem (one scanner) — appropriate for one plan. ✓
