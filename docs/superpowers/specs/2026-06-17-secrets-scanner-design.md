# Secrets Scanner — Design Spec

**Date:** 2026-06-17
**Sprint:** 2, item 6 (highest-value new scanner)
**Status:** Approved — ready for implementation plan

---

## Purpose

Detect credentials leaked into a target's client-side JavaScript bundles — the
catastrophic failure mode for AI-generated apps (a Supabase service-role key or
Stripe secret key shipped to the browser hands an attacker full money/data
access). This is the flagship "we find what vibe-coding tools leak" scanner,
paired with the existing Supabase RLS exposure check.

Detection only — we **never** validate a key against its live API (that would
mean *using* someone's credential). We pattern-match, classify, mask, and
report.

---

## Scope & tier

- New module `apps/scanner/scanners/secrets.py` → `SecretsScanner(BaseScanner)`.
- Runs on **active** and **deep** tiers only (paid). Added to
  `_scanners_for_tier()` in `apps/scanner/jobs/tasks.py`. Passive/free is
  unchanged (headers + TLS).
- Reuses `lib.js_extraction.fetch_page_and_scripts(url, timeout)` — same fetch
  utility the Supabase exposure scanner uses (page HTML + same-origin
  `<script src>` bundles, byte-capped, best-effort).

---

## Architecture

### Components

1. **`SecretPattern`** (dataclass): `provider: str`, `regex: re.Pattern`,
   `kind: Literal["secret", "publishable"]`, `mask: Callable[[str], str]`.
   Optionally `label` for the human provider name.
2. **`_PATTERNS`**: a module-level list of `SecretPattern`. This is the single
   place to extend coverage over time — adding a provider is one entry.
3. **Supabase JWT classifier**: reuse the JWT-role decode logic
   (`role == "service_role"` → secret; `role == "anon"` → publishable). Mirrors
   and inverts the check already in `supabase_exposure.py`. **Decision:** extract
   the existing `_decode_jwt_role` from `supabase_exposure.py` into a new shared
   `lib/jwt.py` and have both scanners import it — avoids a scanner→scanner
   import and keeps one decode implementation. `supabase_exposure.py` is updated
   to import from `lib.jwt`; its existing tests must stay green.
4. **`SecretsScanner.run()`**: orchestration (fetch → scan → classify → dedupe
   → build findings).

### Flow

```
blobs = fetch_page_and_scripts(self.url, self.timeout)
matches = []                       # (provider, kind, raw, masked, source_idx)
for idx, blob in enumerate(blobs):
    for pattern in _PATTERNS:
        for m in pattern.regex.finditer(blob):
            raw = m.group(0)
            if _is_placeholder(raw):        # skip "sk-xxxx", "your-key-here", etc.
                continue
            matches.append((pattern.provider, pattern.kind, raw,
                            pattern.mask(raw), idx))
    # JWTs handled by a dedicated pass that decodes role
matches += _scan_jwts(blobs)

# dedupe by (provider, masked) so the same key across bundles counts once
unique = dedupe(matches)
return _build_findings(unique)
```

### Findings produced

- **Each distinct secret** → one `critical` finding:
  - `check_name="exposed-secret"`, `category="secrets"`, `severity="critical"`.
  - title e.g. `"Exposed OpenAI API key in JavaScript bundle"`.
  - description: what it is + masked identifier (e.g. `OpenAI key …a1B2`),
    framed for vibe-coders. Includes the "even test-mode keys count" reasoning
    where relevant (a leaked `sk_test_` is a behavioural/process leak that will
    eventually leak a live key — we're tough because we care).
  - what_we_did: "Scanned the page and its JavaScript bundles for known
    credential patterns; found this one in `<script #n>`."
  - remediation: rotate the key immediately, then move it server-side (env var /
    serverless function / Supabase edge function) and never reference it from
    client code.
  - `metadata={"provider", "masked", "source": "<script index/url>"}`.
  - Cap distinct secret findings at `_MAX_SECRETS = 25` to bound pathological
    output.
- **All publishable matches** → one `pass` finding:
  - `"Public API keys detected — expected in the browser"`, listing the
    providers found, explaining these are designed to be client-side (Stripe
    publishable, Supabase anon, Firebase/Google) and need no action. Lands in
    the report's "What's working" section.
- **Nothing found** → one `pass` finding `"No exposed secrets found in
  JavaScript"`.

---

## Pattern registry (initial set)

High-precision, anchored on documented prefixes. `secret` → critical;
`publishable` → reassuring note.

| Provider | Pattern (sketch) | Kind |
|---|---|---|
| Stripe secret | `sk_live_[0-9A-Za-z]{20,}` | secret |
| Stripe test secret | `sk_test_[0-9A-Za-z]{20,}` | secret (critical — see note) |
| Stripe restricted | `rk_(live\|test)_[0-9A-Za-z]{20,}` | secret |
| Stripe publishable | `pk_(live\|test)_[0-9A-Za-z]{20,}` | publishable |
| OpenAI | `sk-(proj-)?[A-Za-z0-9_-]{20,}` | secret |
| Anthropic | `sk-ant-[A-Za-z0-9_-]{20,}` | secret |
| AWS access key id | `AKIA[0-9A-Z]{16}` | secret |
| GitHub PAT | `ghp_[0-9A-Za-z]{36}` / `github_pat_[0-9A-Za-z_]{59,}` | secret |
| Slack | `xox[baprs]-[0-9A-Za-z-]{10,}` | secret |
| SendGrid | `SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}` | secret |
| npm | `npm_[0-9A-Za-z]{36}` | secret |
| Private key block | `-----BEGIN (RSA \|EC \|OPENSSH \|PGP )?PRIVATE KEY-----` | secret |
| Supabase service-role JWT | JWT, decoded `role == "service_role"` | secret |
| Supabase anon JWT | JWT, decoded `role == "anon"` | publishable |
| Google / Firebase API key | `AIza[0-9A-Za-z_-]{35}` | publishable |

**Ordering note:** Stripe `sk_`/`pk_` (underscore) vs OpenAI `sk-` (hyphen) are
disambiguated by the separator, so the two `sk` patterns don't collide.

**Test-mode keys are critical** (product decision): a leaked `sk_test_` can't
move real money, but it reveals a credential-handling practice that will
eventually leak a live key. We flag it critical and say so in the copy.

---

## Security invariant (A5 compliance)

- The **full secret value is never stored** anywhere. After a regex match we
  derive a masked identifier (provider + last 4 chars, e.g. `…a1B2`) and discard
  the raw match. Only the mask reaches `description`/`metadata`.
- Critical secret findings are not exposed by the `public_findings` view (it
  selects only `id, scan_id, severity, title, category, result` — no
  description/metadata), so a shared/public report cannot leak even the mask.
  Masking is defense-in-depth for screenshots and the owner's own view.
- A regression test asserts that no full secret value appears in the serialized
  findings (`json.dumps([f.to_dict() ...])`), mirroring
  `test_findings_metadata_safety.py`.

---

## False-positive controls

- Tight, prefix-anchored patterns with minimum lengths.
- `_is_placeholder(raw)`: skip obvious examples/placeholders — values containing
  `x{4,}`, `your-`, `example`, `xxxx`, `<`, `...`, or all-same-char runs.
- Publishable keys never produce a critical (they're classified `publishable`).
- Dedupe by `(provider, masked)` so one key referenced in multiple chunks is a
  single finding.

---

## Testing

`apps/scanner/tests/test_secrets.py`, respx-mocked page + script (pattern from
`test_supabase_exposure.py`). Fixtures built at runtime (no literal secrets in
source — GitGuardian hygiene, as we did for the exposure fixtures). Cases:

1. No scripts / no secrets → single `pass` finding.
2. Each secret provider pattern → one `critical` finding, correct title/provider.
3. Publishable keys (Stripe `pk_`, Supabase anon JWT, Firebase `AIza`) → single
   `pass` "expected" finding, never critical.
4. Supabase **service-role** JWT → critical; **anon** JWT → publishable.
5. `sk_test_` → critical.
6. Placeholder values (`sk-xxxxxxxx`, `your-key-here`) → ignored.
7. Same key across two bundles → one finding (dedupe).
8. **Masking regression:** full secret never present in `to_dict()` output.
9. Cap: more than `_MAX_SECRETS` distinct secrets → capped.

---

## Integration & deployment

- `jobs/tasks.py::_scanners_for_tier()` — add `SecretsScanner` to active/deep.
- No new Python/system dependencies (pure stdlib `re` + existing httpx fetch).
- Requires a scanner **redeploy to Fly.io** to go live (same as the headers
  change).
- Update `PROJECT_STATUS.md` (scanner table, Known Issues "No exposed-secrets
  scanner" → resolved, Sprint 2 progress).

---

## Out of scope (YAGNI)

- Live key validation / API calls.
- Generic high-entropy detection (false-positive engine under all-critical).
- Non-JS sources (HTML comments only insofar as they're in the fetched page
  blob), source maps, env-file probing, git history.
- S3/R2/GCS bucket discovery (separate Sprint 2 item 8, different problem).
