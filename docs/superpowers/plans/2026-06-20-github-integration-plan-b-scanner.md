# GitHub Committed-Secret Scanner — Plan B (the scanner) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the scanner-side pipeline that clones a connected GitHub repo with a short-lived installation token, runs gitleaks over its git history, stores redacted findings, and exposes the job behind the internal `X-Internal-Key` API — plus the web enqueue/status route that dispatches it.

**Architecture:** Mirror the existing URL-scan pipeline exactly. The web app inserts a `repo_scan` row, picks `full`/`incremental` mode, and POSTs the scanner's internal `/api/repo-scans`. A Celery task (`run_repo_scan`) runs an authorization gate (the repo-equivalent of `consent.verify`), mints an installation token via `lib/github_app.py`, clones into an ephemeral tmpdir, runs `GitHubSecretsScanner` (clone + gitleaks + redaction), writes `repo_findings` + `repo_scans` results, and always deletes the clone. Raw secrets are never persisted — only `fingerprint`, masked `match_preview`, and location metadata.

**Tech Stack:** Python 3.12, FastAPI, Celery, `httpx` (GitHub REST), `PyJWT[crypto]` (App JWT, RS256), `gitleaks` (Go binary in Dockerfile), `git` CLI, Supabase service-role client. Web side: Next.js 14 App Router route handler, Zod, Supabase server client. Tests: pytest (scanner, mocked subprocess/httpx — no live GitHub), vitest (web).

## Global Constraints

- **Authorization gate is non-negotiable** — `run_repo_scan` must abort + log unless the installation is `active` AND the repo belongs to the requesting `user_id`. This mirrors `consent.verify` for URLs; never bypass it. (spec §6, §9)
- **Never persist raw secrets.** gitleaks returns `Secret`/`Match`; persist only `fingerprint`, masked `match_preview`, rule, and location/metadata. (spec §5, CLAUDE.md scan-safety)
- **Repo code is never built, installed, or executed** — gitleaks text scan only. (spec §4, §9)
- **Always delete the clone** after every scan, success or failure. (spec §4, §6)
- **Tokens never logged**; redact the token in any clone URL written to the activity log. (spec §9)
- **No A–F grade for repos** — status is `clean`/`exposed` derived from `secrets_found`. (spec §5)
- **Force-push fallback:** if `last_scanned_sha` is no longer an ancestor of HEAD, fall back to a **full** re-scan. (spec §4)
- **Internal endpoint** stays behind `verify_internal_key` (`X-Internal-Key`), same as `/api/scans`. (spec §9)
- **Failure policy** mirrors URL scans: retry 3× with backoff, then mark `failed`. (spec §6)
- **Severity map** is scanner-side, unit-tested; unknown rules default to `medium`. (spec §5)
- DB tables already exist (migration `20260620000023_github_repos.sql`, applied live). Do **not** create them again.
- Python: type hints on every signature; subprocess calls always pass `timeout`. (CLAUDE.md)
- No live GitHub calls in tests — mock token minting and all REST/subprocess calls.

---

### Task 1: Scanner settings + GitHub App env vars

**Files:**
- Modify: `apps/scanner/lib/settings.py`
- Modify: `apps/scanner/tests/conftest.py`
- Test: `apps/scanner/tests/test_settings_github.py` (create)

**Interfaces:**
- Produces: `settings.github_app_id: str | None`, `settings.github_app_private_key: str | None`, `settings.github_api_url: str` (default `"https://api.github.com"`).

- [ ] **Step 1: Write the failing test**

```python
# apps/scanner/tests/test_settings_github.py
def test_github_settings_present_with_defaults():
    from lib.settings import settings
    # Optional — unset in the test env, so default None
    assert settings.github_app_id is None
    assert settings.github_app_private_key is None
    assert settings.github_api_url == "https://api.github.com"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/scanner && python -m pytest tests/test_settings_github.py -v`
Expected: FAIL — `AttributeError: 'Settings' object has no attribute 'github_app_id'`

- [ ] **Step 3: Add the fields to Settings**

In `apps/scanner/lib/settings.py`, add inside the `Settings` class (after `max_concurrent_scans`):

```python
    github_app_id: str | None = None
    github_app_private_key: str | None = None
    github_api_url: str = "https://api.github.com"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/scanner && python -m pytest tests/test_settings_github.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/scanner/lib/settings.py apps/scanner/tests/test_settings_github.py
git commit -m "feat(scanner): add GitHub App settings (id, private key, api url)"
```

---

### Task 2: Installation-token minting — `lib/github_app.py`

**Files:**
- Create: `apps/scanner/lib/github_app.py`
- Test: `apps/scanner/tests/test_github_app.py`

**Interfaces:**
- Consumes: `settings.github_app_id`, `settings.github_app_private_key`, `settings.github_api_url`.
- Produces:
  - `build_app_jwt(now: int | None = None) -> str` — RS256 App JWT (`iss`=app id, `iat`=now-60, `exp`=now+540).
  - `mint_installation_token(installation_id: int, repository_ids: list[int] | None = None) -> str` — POSTs `/app/installations/{id}/access_tokens` with the App JWT, returns the `token` string. Raises `GitHubAppError` on non-2xx or missing config.
  - `GitHubAppError(Exception)`.

The private key arrives with `\n`-escaped newlines from env (same as the web side); normalise with `.replace("\\n", "\n")` before signing.

- [ ] **Step 1: Write the failing tests**

```python
# apps/scanner/tests/test_github_app.py
import time
import jwt as pyjwt
import pytest
from unittest.mock import patch, MagicMock

# A throwaway RSA key generated only for tests (never a real GitHub key).
TEST_PRIVATE_KEY = None  # set in fixture below


@pytest.fixture(autouse=True)
def _key(monkeypatch):
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.hazmat.primitives import serialization
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()
    # Simulate env \n-escaping
    monkeypatch.setattr("lib.github_app.settings.github_app_id", "12345", raising=False)
    monkeypatch.setattr(
        "lib.github_app.settings.github_app_private_key",
        pem.replace("\n", "\\n"),
        raising=False,
    )
    return key


def test_build_app_jwt_has_expected_claims(_key):
    from lib.github_app import build_app_jwt
    now = int(time.time())
    token = build_app_jwt(now=now)
    pub = _key.public_key()
    claims = pyjwt.decode(token, pub, algorithms=["RS256"])
    assert claims["iss"] == "12345"
    assert claims["iat"] == now - 60
    assert claims["exp"] == now + 540


def test_mint_installation_token_posts_and_returns_token():
    from lib import github_app
    resp = MagicMock(status_code=201)
    resp.json.return_value = {"token": "ghs_installtoken", "expires_at": "2026-06-20T12:00:00Z"}
    with patch("lib.github_app.httpx.post", return_value=resp) as post:
        token = github_app.mint_installation_token(999, repository_ids=[42])
    assert token == "ghs_installtoken"
    url = post.call_args.args[0]
    assert url.endswith("/app/installations/999/access_tokens")
    assert post.call_args.kwargs["json"] == {"repository_ids": [42]}


def test_mint_installation_token_raises_on_error():
    from lib import github_app
    resp = MagicMock(status_code=404)
    resp.json.return_value = {"message": "Not Found"}
    with patch("lib.github_app.httpx.post", return_value=resp):
        with pytest.raises(github_app.GitHubAppError):
            github_app.mint_installation_token(999)


def test_missing_config_raises():
    from lib import github_app
    with patch("lib.github_app.settings.github_app_private_key", None):
        with pytest.raises(github_app.GitHubAppError):
            github_app.build_app_jwt()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/scanner && python -m pytest tests/test_github_app.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'lib.github_app'`

- [ ] **Step 3: Implement `lib/github_app.py`**

```python
# apps/scanner/lib/github_app.py
import time

import httpx
import jwt as pyjwt

from lib.settings import settings


class GitHubAppError(Exception):
    pass


def _private_key() -> str:
    key = settings.github_app_private_key
    if not key:
        raise GitHubAppError("GITHUB_APP_PRIVATE_KEY is not set")
    return key.replace("\\n", "\n")


def build_app_jwt(now: int | None = None) -> str:
    """Short-lived (≤10 min) App JWT signed RS256 with the App private key.

    iat is backdated 60s to tolerate clock skew, exp is +9 min — both inside
    GitHub's 10-minute ceiling.
    """
    if not settings.github_app_id:
        raise GitHubAppError("GITHUB_APP_ID is not set")
    now = int(time.time()) if now is None else now
    payload = {"iss": settings.github_app_id, "iat": now - 60, "exp": now + 540}
    return pyjwt.encode(payload, _private_key(), algorithm="RS256")


def mint_installation_token(
    installation_id: int, repository_ids: list[int] | None = None
) -> str:
    """Exchange the App JWT for a short-lived installation token, optionally
    scoped to specific repository ids. Returns the token string only."""
    app_jwt = build_app_jwt()
    body: dict = {}
    if repository_ids is not None:
        body["repository_ids"] = repository_ids
    resp = httpx.post(
        f"{settings.github_api_url}/app/installations/{installation_id}/access_tokens",
        headers={
            "Authorization": f"Bearer {app_jwt}",
            "Accept": "application/vnd.github+json",
        },
        json=body,
        timeout=15,
    )
    if resp.status_code not in (200, 201):
        raise GitHubAppError(
            f"installation token mint failed: {resp.status_code}"
        )
    token = resp.json().get("token")
    if not token:
        raise GitHubAppError("installation token response missing 'token'")
    return token
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/scanner && python -m pytest tests/test_github_app.py -v`
Expected: PASS (4 tests). If `PyJWT`/`cryptography` import fails, that is fixed in Task 7 — for local TDD install them now: `pip install "pyjwt[crypto]>=2.8.0"`.

- [ ] **Step 5: Commit**

```bash
git add apps/scanner/lib/github_app.py apps/scanner/tests/test_github_app.py
git commit -m "feat(scanner): mint short-lived GitHub installation tokens (App JWT)"
```

---

### Task 3: Severity map + secret redaction helpers

**Files:**
- Create: `apps/scanner/scanners/github_secrets_rules.py`
- Test: `apps/scanner/tests/test_github_secrets_rules.py`

**Interfaces:**
- Produces:
  - `severity_for(rule_id: str) -> str` — returns `"critical"`/`"medium"`; unknown → `"medium"`.
  - `mask_secret(secret: str) -> str` — `"sk_live_abcd…7f9x"` style; fully masked if ≤ 8 chars.
  - `redact_finding(raw: dict) -> dict` — maps one gitleaks JSON object to a `repo_findings` row dict with keys: `rule_id, severity, title, description, file_path, commit_sha, line_start, fingerprint, match_preview, commit_author, committed_at, remediation`. **Must never include `Secret` or `Match`.**

- [ ] **Step 1: Write the failing tests**

```python
# apps/scanner/tests/test_github_secrets_rules.py
import pytest


def test_severity_critical_for_live_credential_rules():
    from scanners.github_secrets_rules import severity_for
    for rule in ["stripe-access-token", "aws-access-key", "private-key",
                 "github-pat", "openai-api-key"]:
        assert severity_for(rule) == "critical"


def test_severity_defaults_to_medium_for_unknown():
    from scanners.github_secrets_rules import severity_for
    assert severity_for("generic-api-key") == "medium"
    assert severity_for("totally-unknown-rule") == "medium"


def test_mask_secret_keeps_only_ends():
    from scanners.github_secrets_rules import mask_secret
    masked = mask_secret("sk_live_abcdefghijklmnop7f9x")
    assert masked.startswith("sk_l")
    assert masked.endswith("7f9x")
    assert "…" in masked
    assert "efghij" not in masked


def test_mask_secret_short_value_fully_hidden():
    from scanners.github_secrets_rules import mask_secret
    assert mask_secret("abc123") == "……"


def test_redact_finding_never_leaks_raw_secret():
    from scanners.github_secrets_rules import redact_finding
    raw = {
        "RuleID": "stripe-access-token",
        "Description": "Stripe Access Token",
        "File": "config/.env",
        "Commit": "deadbeef",
        "StartLine": 12,
        "Fingerprint": "deadbeef:config/.env:stripe-access-token:12",
        "Secret": "sk_live_SUPERSECRETVALUE123",
        "Match": "STRIPE_KEY=sk_live_SUPERSECRETVALUE123",
        "Author": "Jane",
        "Date": "2026-01-02T03:04:05Z",
    }
    row = redact_finding(raw)
    blob = repr(row)
    assert "SUPERSECRETVALUE123" not in blob
    assert "sk_live_SUPERSECRETVALUE123" not in blob
    assert row["rule_id"] == "stripe-access-token"
    assert row["severity"] == "critical"
    assert row["file_path"] == "config/.env"
    assert row["commit_sha"] == "deadbeef"
    assert row["line_start"] == 12
    assert row["fingerprint"] == raw["Fingerprint"]
    assert row["match_preview"].startswith("sk_l")
    assert row["commit_author"] == "Jane"
    assert row["committed_at"] == "2026-01-02T03:04:05Z"
    assert "remediation" in row
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/scanner && python -m pytest tests/test_github_secrets_rules.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'scanners.github_secrets_rules'`

- [ ] **Step 3: Implement `scanners/github_secrets_rules.py`**

```python
# apps/scanner/scanners/github_secrets_rules.py
"""Severity classification and redaction for gitleaks findings.

SECURITY INVARIANT: redact_finding must NEVER copy the raw matched secret
(gitleaks 'Secret' / 'Match') into any persisted field — only a masked
preview, the rule, and location metadata. A security product must not become
a secret store (see scanners/base.py Finding docstring, spec §5)."""

# gitleaks emits a rule id per finding but no severity. Live/usable credential
# patterns are critical; everything else defaults to medium.
_CRITICAL_RULES = {
    "stripe-access-token",
    "aws-access-key",
    "aws-access-token",
    "private-key",
    "github-pat",
    "github-fine-grained-pat",
    "github-app-token",
    "github-oauth",
    "openai-api-key",
    "gcp-service-account",
    "supabase-service-role-key",
    "slack-bot-token",
}

_REMEDIATION = (
    "Rotate this credential immediately at its provider, then remove it from "
    "git history (e.g. git filter-repo / BFG) — deleting it in a later commit "
    "does not remove it from history. Move secrets to untracked environment "
    "configuration."
)


def severity_for(rule_id: str) -> str:
    return "critical" if rule_id in _CRITICAL_RULES else "medium"


def mask_secret(secret: str) -> str:
    if not secret or len(secret) <= 8:
        return "……"
    return f"{secret[:4]}…{secret[-4:]}"


def redact_finding(raw: dict) -> dict:
    rule_id = raw.get("RuleID", "unknown")
    return {
        "rule_id": rule_id,
        "severity": severity_for(rule_id),
        "title": raw.get("Description") or rule_id,
        "description": f"Committed secret detected by rule '{rule_id}'.",
        "file_path": raw.get("File"),
        "commit_sha": raw.get("Commit"),
        "line_start": raw.get("StartLine"),
        "fingerprint": raw.get("Fingerprint"),
        "match_preview": mask_secret(raw.get("Secret", "")),
        "commit_author": raw.get("Author"),
        "committed_at": raw.get("Date"),
        "remediation": _REMEDIATION,
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/scanner && python -m pytest tests/test_github_secrets_rules.py -v`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/scanner/scanners/github_secrets_rules.py apps/scanner/tests/test_github_secrets_rules.py
git commit -m "feat(scanner): gitleaks severity map + secret redaction (no raw secrets)"
```

---

### Task 4: `GitHubSecretsScanner` — clone + gitleaks

**Files:**
- Create: `apps/scanner/scanners/github_secrets.py`
- Test: `apps/scanner/tests/test_github_secrets.py`

**Interfaces:**
- Consumes: `mint_installation_token` (Task 2), `redact_finding` (Task 3), `git`/`gitleaks` CLIs.
- Produces a class:

```python
class GitHubSecretsScanner:
    def __init__(self, *, clone_url: str, token: str,
                 base_sha: str | None = None, timeout: int = 300) -> None: ...
    def run(self) -> "RepoScanResult": ...
```

  and a dataclass:

```python
@dataclass
class RepoScanResult:
    mode: str            # "full" | "incremental"
    head_sha: str
    base_sha: str | None
    findings: list[dict] # redacted repo_findings rows
```

  Behaviour:
  - Clones `clone_url` (token-bearing) into a tmpdir with `git clone` (full history, not `--depth`).
  - `head_sha` = `git rev-parse HEAD`.
  - If `base_sha` is given AND `git merge-base --is-ancestor <base> HEAD` succeeds → `mode="incremental"`, run gitleaks with `--log-opts=<base>..HEAD`. Otherwise → `mode="full"` (this is the force-push fallback).
  - gitleaks: `gitleaks detect --source <dir> --report-format json --report-path <out> --exit-code 0 [--log-opts=...]`; parse the JSON array → `redact_finding` for each.
  - **Always** delete the tmpdir in a `finally`.
  - Build the clone command via a private `_clone_url_for_log()` helper that returns the URL with the token replaced by `***` (for the caller to log).

- [ ] **Step 1: Write the failing tests**

```python
# apps/scanner/tests/test_github_secrets.py
import json
from unittest.mock import patch, MagicMock

import pytest


def _fake_run_factory(head_sha, is_ancestor_ok, gitleaks_json, written):
    """Returns a fake subprocess.run that records gitleaks args and writes the
    report file the scanner will read back."""
    def fake_run(cmd, *args, **kwargs):
        if cmd[0] == "git" and cmd[1] == "clone":
            return MagicMock(returncode=0)
        if cmd[:2] == ["git", "rev-parse"]:
            return MagicMock(returncode=0, stdout=head_sha + "\n")
        if cmd[:2] == ["git", "merge-base"]:
            return MagicMock(returncode=0 if is_ancestor_ok else 1)
        if cmd[0] == "gitleaks":
            written.append(cmd)
            # find --report-path value and write the json there
            rp = cmd[cmd.index("--report-path") + 1]
            with open(rp, "w") as f:
                json.dump(gitleaks_json, f)
            return MagicMock(returncode=0)
        return MagicMock(returncode=0, stdout="")
    return fake_run


GITLEAKS_ONE = [{
    "RuleID": "stripe-access-token", "Description": "Stripe", "File": ".env",
    "Commit": "abc", "StartLine": 1, "Fingerprint": "abc:.env:stripe:1",
    "Secret": "sk_live_RAWSECRETVALUE", "Author": "Jo", "Date": "2026-01-01T00:00:00Z",
}]


def test_full_scan_parses_redacted_findings():
    from scanners.github_secrets import GitHubSecretsScanner
    written = []
    fake = _fake_run_factory("HEADSHA", True, GITLEAKS_ONE, written)
    with patch("scanners.github_secrets.subprocess.run", side_effect=fake), \
         patch("scanners.github_secrets.shutil.rmtree") as rmtree:
        res = GitHubSecretsScanner(
            clone_url="https://x-access-token:ghs_t@github.com/o/r.git",
            token="ghs_t",
        ).run()
    assert res.mode == "full"
    assert res.head_sha == "HEADSHA"
    assert len(res.findings) == 1
    assert "RAWSECRETVALUE" not in repr(res.findings)
    # no --log-opts on a full scan
    assert all("--log-opts" not in " ".join(c) for c in written)
    rmtree.assert_called_once()  # clone cleaned up


def test_incremental_scan_uses_log_opts():
    from scanners.github_secrets import GitHubSecretsScanner
    written = []
    fake = _fake_run_factory("HEADSHA", True, [], written)
    with patch("scanners.github_secrets.subprocess.run", side_effect=fake), \
         patch("scanners.github_secrets.shutil.rmtree"):
        res = GitHubSecretsScanner(
            clone_url="https://x-access-token:ghs_t@github.com/o/r.git",
            token="ghs_t", base_sha="BASESHA",
        ).run()
    assert res.mode == "incremental"
    assert res.base_sha == "BASESHA"
    assert any("--log-opts=BASESHA..HEAD" in " ".join(c) for c in written)


def test_force_push_falls_back_to_full():
    from scanners.github_secrets import GitHubSecretsScanner
    written = []
    fake = _fake_run_factory("HEADSHA", False, [], written)  # not an ancestor
    with patch("scanners.github_secrets.subprocess.run", side_effect=fake), \
         patch("scanners.github_secrets.shutil.rmtree"):
        res = GitHubSecretsScanner(
            clone_url="https://x-access-token:ghs_t@github.com/o/r.git",
            token="ghs_t", base_sha="OLDSHA",
        ).run()
    assert res.mode == "full"
    assert all("--log-opts" not in " ".join(c) for c in written)


def test_clone_deleted_even_on_gitleaks_failure():
    from scanners.github_secrets import GitHubSecretsScanner

    def boom(cmd, *a, **k):
        if cmd[0] == "git" and cmd[1] == "clone":
            return MagicMock(returncode=0)
        if cmd[:2] == ["git", "rev-parse"]:
            return MagicMock(returncode=0, stdout="HEADSHA\n")
        if cmd[0] == "gitleaks":
            raise RuntimeError("gitleaks crashed")
        return MagicMock(returncode=0, stdout="")

    with patch("scanners.github_secrets.subprocess.run", side_effect=boom), \
         patch("scanners.github_secrets.shutil.rmtree") as rmtree:
        with pytest.raises(RuntimeError):
            GitHubSecretsScanner(
                clone_url="https://x-access-token:ghs_t@github.com/o/r.git",
                token="ghs_t",
            ).run()
    rmtree.assert_called_once()  # cleanup still ran
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/scanner && python -m pytest tests/test_github_secrets.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'scanners.github_secrets'`

- [ ] **Step 3: Implement `scanners/github_secrets.py`**

```python
# apps/scanner/scanners/github_secrets.py
import json
import os
import shutil
import subprocess
import tempfile
from dataclasses import dataclass

from scanners.github_secrets_rules import redact_finding


@dataclass
class RepoScanResult:
    mode: str
    head_sha: str
    base_sha: str | None
    findings: list[dict]


class GitHubSecretsScanner:
    """Clone a repo with a short-lived token and run gitleaks over its history.

    Repo code is only ever read by gitleaks — never built, installed, or
    executed. The clone is always deleted (see run()'s finally block)."""

    def __init__(
        self,
        *,
        clone_url: str,
        token: str,
        base_sha: str | None = None,
        timeout: int = 300,
    ) -> None:
        self.clone_url = clone_url
        self.token = token
        self.base_sha = base_sha
        self.timeout = timeout

    def safe_clone_url(self) -> str:
        """Clone URL with the token redacted, for logging."""
        return self.clone_url.replace(self.token, "***")

    def _run(self, cmd: list[str]) -> subprocess.CompletedProcess:
        return subprocess.run(
            cmd, capture_output=True, text=True, timeout=self.timeout
        )

    def run(self) -> RepoScanResult:
        workdir = tempfile.mkdtemp(prefix="repo-scan-")
        clone_dir = os.path.join(workdir, "repo")
        report_path = os.path.join(workdir, "gitleaks.json")
        try:
            self._run(["git", "clone", self.clone_url, clone_dir])
            head = self._run(["git", "-C", clone_dir, "rev-parse", "HEAD"])
            head_sha = head.stdout.strip()

            mode = "full"
            log_opts: str | None = None
            if self.base_sha:
                anc = self._run([
                    "git", "-C", clone_dir, "merge-base",
                    "--is-ancestor", self.base_sha, "HEAD",
                ])
                if anc.returncode == 0:
                    mode = "incremental"
                    log_opts = f"--log-opts={self.base_sha}..HEAD"

            cmd = [
                "gitleaks", "detect", "--source", clone_dir,
                "--report-format", "json", "--report-path", report_path,
                "--exit-code", "0", "--no-banner",
            ]
            if log_opts:
                cmd.append(log_opts)
            self._run(cmd)

            findings: list[dict] = []
            if os.path.exists(report_path):
                with open(report_path) as f:
                    raw = json.load(f) or []
                findings = [redact_finding(item) for item in raw]

            return RepoScanResult(
                mode=mode,
                head_sha=head_sha,
                base_sha=self.base_sha if mode == "incremental" else None,
                findings=findings,
            )
        finally:
            shutil.rmtree(workdir, ignore_errors=True)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/scanner && python -m pytest tests/test_github_secrets.py -v`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/scanner/scanners/github_secrets.py apps/scanner/tests/test_github_secrets.py
git commit -m "feat(scanner): GitHubSecretsScanner (clone + gitleaks, always cleans up)"
```

---

### Task 5: Repo authorization gate — `lib/repo_consent.py`

**Files:**
- Create: `apps/scanner/lib/repo_consent.py`
- Test: `apps/scanner/tests/test_repo_consent.py`

**Interfaces:**
- Produces:
  - `RepoConsentError(Exception)`.
  - `verify(repo_id: str, user_id: str) -> dict` — returns `{"full_name", "installation_id", "github_repo_id", "last_scanned_sha"}` (installation_id = the **GitHub** numeric id) when the repo's installation is `active` and the repo belongs to `user_id`; raises `RepoConsentError` otherwise.

This is the repo-equivalent of `consent.verify` for URLs. It joins `repos` → `github_installations` and checks ownership + active status.

- [ ] **Step 1: Write the failing tests**

```python
# apps/scanner/tests/test_repo_consent.py
import pytest
from unittest.mock import MagicMock, patch


@pytest.fixture
def mock_sb():
    with patch("lib.repo_consent.get_supabase") as mock:
        client = MagicMock()
        mock.return_value = client
        yield client


def _repo_row(client, data):
    (client.table.return_value.select.return_value.eq.return_value
        .eq.return_value.single.return_value.execute.return_value.data) = data


def test_verify_returns_repo_when_active_and_owned(mock_sb):
    from lib.repo_consent import verify
    _repo_row(mock_sb, {
        "full_name": "o/r", "github_repo_id": 42, "last_scanned_sha": None,
        "github_installations": {"installation_id": 999, "status": "active"},
    })
    out = verify("repo-uuid", "user-uuid")
    assert out["full_name"] == "o/r"
    assert out["installation_id"] == 999
    assert out["github_repo_id"] == 42


def test_verify_raises_when_repo_missing_or_foreign(mock_sb):
    from lib.repo_consent import verify, RepoConsentError
    _repo_row(mock_sb, None)
    with pytest.raises(RepoConsentError):
        verify("repo-uuid", "user-uuid")


def test_verify_raises_when_installation_not_active(mock_sb):
    from lib.repo_consent import verify, RepoConsentError
    _repo_row(mock_sb, {
        "full_name": "o/r", "github_repo_id": 42, "last_scanned_sha": None,
        "github_installations": {"installation_id": 999, "status": "revoked"},
    })
    with pytest.raises(RepoConsentError):
        verify("repo-uuid", "user-uuid")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/scanner && python -m pytest tests/test_repo_consent.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'lib.repo_consent'`

- [ ] **Step 3: Implement `lib/repo_consent.py`**

```python
# apps/scanner/lib/repo_consent.py
from lib.supabase import get_supabase


class RepoConsentError(Exception):
    pass


def verify(repo_id: str, user_id: str) -> dict:
    """Repo-scan authorization gate — the equivalent of consent.verify for URLs.

    Returns repo + installation metadata only when the repo belongs to user_id
    AND its installation is active. Raises RepoConsentError otherwise. Must be
    called before any clone/scan runs (spec §6, §9)."""
    supabase = get_supabase()
    result = (
        supabase.table("repos")
        .select("full_name, github_repo_id, last_scanned_sha, "
                "github_installations(installation_id, status)")
        .eq("id", repo_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    row = result.data
    if not row:
        raise RepoConsentError(f"repo {repo_id} not found for user — scan aborted")
    install = row.get("github_installations") or {}
    if install.get("status") != "active":
        raise RepoConsentError(f"repo {repo_id} installation not active — scan aborted")
    return {
        "full_name": row["full_name"],
        "github_repo_id": row["github_repo_id"],
        "installation_id": install["installation_id"],
        "last_scanned_sha": row.get("last_scanned_sha"),
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/scanner && python -m pytest tests/test_repo_consent.py -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/scanner/lib/repo_consent.py apps/scanner/tests/test_repo_consent.py
git commit -m "feat(scanner): repo authorization gate (consent equivalent for repos)"
```

---

### Task 6: `run_repo_scan` Celery task

**Files:**
- Modify: `apps/scanner/jobs/tasks.py`
- Test: `apps/scanner/tests/test_repo_tasks.py`

**Interfaces:**
- Consumes: `repo_consent.verify` (Task 5), `mint_installation_token` (Task 2), `GitHubSecretsScanner` (Task 4), `log_event`, `get_supabase`, `settings.scanner_version`.
- Produces:
  - `_execute_repo_scan(task_self, repo_scan_id: str, repo_id: str, user_id: str) -> None` (testable plain function).
  - `run_repo_scan` Celery task wrapping it (`bind=True, max_retries=3, default_retry_delay=5`).

Flow (spec §6 scanner job): mark `running`; `repo_consent.verify` (on failure → mark `failed`, log `repo_scan_failed`, re-raise without retry, same as URL consent); mint token; build `clone_url = https://x-access-token:<token>@github.com/<full_name>.git`; run scanner with `base_sha=last_scanned_sha`; insert redacted `repo_findings` (add `repo_scan_id`, `user_id`, `first_seen_at`); update `repos.last_scanned_sha=head_sha`, `last_scan_at`; mark `repo_scan` `completed` with `mode, base_sha, head_sha, secrets_found, scanner_version, completed_at`; log `repo_scan_completed`. On other exceptions mark `failed` and retry (3×). Activity log uses the **redacted** clone URL (`scanner.safe_clone_url()`), never the token.

- [ ] **Step 1: Write the failing tests**

```python
# apps/scanner/tests/test_repo_tasks.py
from unittest.mock import MagicMock, patch

import pytest

from scanners.github_secrets import RepoScanResult


def _task_self(retries=0, max_retries=3):
    t = MagicMock()
    t.request.retries = retries
    t.max_retries = max_retries
    t.retry.side_effect = RuntimeError("retry called")
    return t


@pytest.fixture
def patched(monkeypatch):
    sb = MagicMock()
    with patch("jobs.tasks.get_supabase", return_value=sb), \
         patch("jobs.tasks.log_event") as log, \
         patch("jobs.tasks.repo_consent") as consent, \
         patch("jobs.tasks.mint_installation_token", return_value="ghs_tok") as mint, \
         patch("jobs.tasks.GitHubSecretsScanner") as scanner_cls:
        consent.verify.return_value = {
            "full_name": "o/r", "github_repo_id": 42,
            "installation_id": 999, "last_scanned_sha": None,
        }
        consent.RepoConsentError = Exception
        yield {"sb": sb, "log": log, "consent": consent, "mint": mint,
               "scanner_cls": scanner_cls}


def test_completed_writes_findings_and_updates_repo(patched):
    from jobs.tasks import _execute_repo_scan
    finding = {"rule_id": "stripe-access-token", "severity": "critical",
               "title": "Stripe", "match_preview": "sk_l…7f9x"}
    inst = patched["scanner_cls"].return_value
    inst.run.return_value = RepoScanResult(mode="full", head_sha="HEAD",
                                           base_sha=None, findings=[finding])
    inst.safe_clone_url.return_value = "https://x-access-token:***@github.com/o/r.git"

    _execute_repo_scan(_task_self(), "scan-1", "repo-1", "user-1")

    tables = [c.args[0] for c in patched["sb"].table.call_args_list]
    assert "repo_findings" in tables
    assert "repos" in tables
    assert "repo_scans" in tables
    # token only minted, never logged raw
    assert all("ghs_tok" not in str(c) for c in patched["log"].call_args_list)


def test_consent_failure_marks_failed_no_retry(patched):
    from jobs.tasks import _execute_repo_scan
    patched["consent"].verify.side_effect = patched["consent"].RepoConsentError("nope")
    with pytest.raises(patched["consent"].RepoConsentError):
        _execute_repo_scan(_task_self(), "scan-1", "repo-1", "user-1")
    # scanner never constructed
    patched["scanner_cls"].assert_not_called()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/scanner && python -m pytest tests/test_repo_tasks.py -v`
Expected: FAIL — `ImportError: cannot import name '_execute_repo_scan'`

- [ ] **Step 3: Implement in `jobs/tasks.py`**

Add imports near the top (with the other `lib`/`scanners` imports):

```python
from lib import repo_consent
from lib.github_app import mint_installation_token
from scanners.github_secrets import GitHubSecretsScanner
```

Add at the end of the file (after `run_scan`):

```python
def _mark_repo_scan(repo_scan_id: str, **fields) -> None:
    get_supabase().table("repo_scans").update(fields).eq("id", repo_scan_id).execute()


def _execute_repo_scan(task_self, repo_scan_id: str, repo_id: str, user_id: str) -> None:
    """Run one committed-secret scan for a connected repo. Mirrors _execute_scan:
    authorization gate first, then mint token → clone → gitleaks → redacted
    findings, with the same retry/failure policy."""
    _mark_repo_scan(repo_scan_id, status="running", started_at=_now())

    try:
        repo = repo_consent.verify(repo_id, user_id)
    except repo_consent.RepoConsentError:
        _mark_repo_scan(repo_scan_id, status="failed", completed_at=_now())
        log_event(user_id, "repo_scan_failed", scan_id=repo_scan_id,
                  payload={"detail": "repo authorization failed"})
        raise  # do not retry authorization errors

    if task_self.request.retries == 0:
        log_event(user_id, "repo_scan_started", scan_id=repo_scan_id,
                  payload={"repo": repo["full_name"]})

    try:
        token = mint_installation_token(
            repo["installation_id"], repository_ids=[repo["github_repo_id"]]
        )
        clone_url = f"https://x-access-token:{token}@github.com/{repo['full_name']}.git"
        scanner = GitHubSecretsScanner(
            clone_url=clone_url, token=token, base_sha=repo["last_scanned_sha"]
        )
        result = scanner.run()

        if result.findings:
            get_supabase().table("repo_findings").insert([
                {**f, "repo_scan_id": repo_scan_id, "user_id": user_id,
                 "first_seen_at": _now()}
                for f in result.findings
            ]).execute()

        get_supabase().table("repos").update(
            {"last_scanned_sha": result.head_sha, "last_scan_at": _now()}
        ).eq("id", repo_id).execute()

        _mark_repo_scan(
            repo_scan_id,
            status="completed",
            mode=result.mode,
            base_sha=result.base_sha,
            head_sha=result.head_sha,
            secrets_found=len(result.findings),
            scanner_version=settings.scanner_version,
            completed_at=_now(),
        )

        log_event(user_id, "repo_scan_completed", scan_id=repo_scan_id,
                  payload={"repo": repo["full_name"], "mode": result.mode,
                           "clone_url": scanner.safe_clone_url(),
                           "secrets_found": len(result.findings),
                           "detail": f"{len(result.findings)} secret(s) · {result.mode} scan"})

    except Exception as exc:
        _mark_repo_scan(repo_scan_id, status="failed", completed_at=_now())
        if task_self.request.retries >= task_self.max_retries:
            log_event(user_id, "repo_scan_failed", scan_id=repo_scan_id,
                      payload={"repo": repo["full_name"], "detail": "scan error"})
        raise task_self.retry(exc=exc)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=5)
def run_repo_scan(self, repo_scan_id: str, repo_id: str, user_id: str) -> None:
    _execute_repo_scan(self, repo_scan_id, repo_id, user_id)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/scanner && python -m pytest tests/test_repo_tasks.py -v`
Expected: PASS (2 tests)

- [ ] **Step 5: Run the full scanner suite (no regressions)**

Run: `cd apps/scanner && python -m pytest -q`
Expected: PASS (all prior tests + the new ones).

- [ ] **Step 6: Commit**

```bash
git add apps/scanner/jobs/tasks.py apps/scanner/tests/test_repo_tasks.py
git commit -m "feat(scanner): run_repo_scan task (gate, token, gitleaks, redacted writes)"
```

---

### Task 7: Internal `/api/repo-scans` endpoint

**Files:**
- Create: `apps/scanner/api/routes/repo_scans.py`
- Modify: `apps/scanner/api/main.py`
- Test: `apps/scanner/tests/test_repo_scans_route.py`

**Interfaces:**
- Consumes: `verify_internal_key`, `run_repo_scan` (Task 6).
- Produces: `POST /api/repo-scans` (202, `X-Internal-Key` required) with body `{repo_scan_id, repo_id, user_id}` → `.delay(...)` → `{"job_id": repo_scan_id}`.

- [ ] **Step 1: Write the failing test**

```python
# apps/scanner/tests/test_repo_scans_route.py
from unittest.mock import patch
from fastapi.testclient import TestClient


def _client():
    from api.main import app
    return TestClient(app)


def test_enqueue_repo_scan_requires_internal_key():
    res = _client().post("/api/repo-scans", json={
        "repo_scan_id": "s", "repo_id": "r", "user_id": "u"})
    assert res.status_code in (401, 422)


def test_enqueue_repo_scan_dispatches():
    with patch("api.routes.repo_scans.run_repo_scan.delay") as delay:
        res = _client().post(
            "/api/repo-scans",
            headers={"X-Internal-Key": "test-internal-key"},
            json={"repo_scan_id": "s", "repo_id": "r", "user_id": "u"},
        )
    assert res.status_code == 202
    assert res.json() == {"job_id": "s"}
    delay.assert_called_once_with("s", "r", "u")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/scanner && python -m pytest tests/test_repo_scans_route.py -v`
Expected: FAIL — 404 (route not registered) / import error.

- [ ] **Step 3: Implement the route + register it**

Create `apps/scanner/api/routes/repo_scans.py`:

```python
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from api.middleware.auth import verify_internal_key
from jobs.tasks import run_repo_scan

router = APIRouter()


class RepoScanRequest(BaseModel):
    repo_scan_id: str
    repo_id: str
    user_id: str


@router.post("/api/repo-scans", status_code=202,
             dependencies=[Depends(verify_internal_key)])
def enqueue_repo_scan(body: RepoScanRequest) -> dict:
    run_repo_scan.delay(body.repo_scan_id, body.repo_id, body.user_id)
    return {"job_id": body.repo_scan_id}
```

In `apps/scanner/api/main.py`, add:

```python
from api.routes.repo_scans import router as repo_scans_router
```
and below the existing `include_router` calls:
```python
app.include_router(repo_scans_router)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/scanner && python -m pytest tests/test_repo_scans_route.py -v`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/scanner/api/routes/repo_scans.py apps/scanner/api/main.py apps/scanner/tests/test_repo_scans_route.py
git commit -m "feat(scanner): internal POST /api/repo-scans enqueue endpoint"
```

---

### Task 8: Dependencies + gitleaks in the Dockerfile

**Files:**
- Modify: `apps/scanner/requirements.txt`
- Modify: `apps/scanner/Dockerfile`

**Interfaces:** none (build/runtime only). gitleaks pinned (not `@latest`) for the same reason Nuclei is pinned — a silent CLI/flag change on an unrelated redeploy must break the build loudly, not degrade scans.

- [ ] **Step 1: Add PyJWT to requirements**

In `apps/scanner/requirements.txt`, add under the existing runtime deps (e.g. after `python-dotenv`):

```
pyjwt[crypto]>=2.8.0
```

- [ ] **Step 2: Add a gitleaks build stage + copy in the Dockerfile**

In `apps/scanner/Dockerfile`, after the `nuclei-build` stage and before `# --- Final stage ---`, add:

```dockerfile
# --- gitleaks (committed-secret scanning) ---
# Pinned, not @latest — same rationale as Nuclei: an unpinned bump could
# silently change flags and degrade the repo scan.
FROM golang:1.25-bookworm AS gitleaks-build
ENV GOBIN=/usr/local/go-bin
RUN mkdir -p "$GOBIN"
RUN go install github.com/gitleaks/gitleaks/v8@v8.21.2
```

In the final stage, add `git` to the apt install list (clone needs it):

```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpango-1.0-0 libpangocairo-1.0-0 libcairo2 libgdk-pixbuf-2.0-0 \
    libffi8 shared-mime-info git \
    && rm -rf /var/lib/apt/lists/*
```

and copy the gitleaks binary in (next to the nuclei COPY lines):

```dockerfile
COPY --from=gitleaks-build /usr/local/go-bin/gitleaks /usr/local/bin/gitleaks
```

- [ ] **Step 3: Verify the image builds (if Docker is available)**

Run: `cd apps/scanner && docker build -t vibe-scanner-test .`
Expected: build succeeds; `gitleaks` and `git` present. If Docker is unavailable locally, this is verified on the next Fly deploy — note that in the PR.

- [ ] **Step 4: Commit**

```bash
git add apps/scanner/requirements.txt apps/scanner/Dockerfile
git commit -m "build(scanner): install gitleaks + git + pyjwt for repo secret scans"
```

---

### Task 9: Web enqueue/status route — `/api/repo-scans`

**Files:**
- Create: `apps/web/app/api/repo-scans/route.ts`
- Test: `apps/web/app/api/repo-scans/route.test.ts`

**Interfaces:**
- Consumes: `createServerClient` (Supabase), `SCANNER_API_URL`, `SCANNER_INTERNAL_KEY`.
- Produces:
  - `POST` — body `{ repo_id: uuid }`. Auth → load repo (owned, `status='active'`) → reject if a `repo_scan` for that repo is `pending`/`running` (409) → pick `mode` (`full` if `last_scanned_sha` null else `incremental`) → insert `repo_scans` (`status='pending'`, `triggered_by='manual'`, `mode`) → POST scanner `/api/repo-scans` with `X-Internal-Key` → on dispatch failure delete the row + 502 → else 202 `{ repo_scan_id }`.
  - `GET ?id=` — return that user's `repo_scan` status row.

Mirror `apps/web/app/api/scans/route.ts` structure exactly (the dispatch helper, the duplicate-active check, the delete-on-dispatch-failure rollback).

- [ ] **Step 1: Write the failing test**

```typescript
// apps/web/app/api/repo-scans/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state: any = {}

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => state.client,
}))

function makeClient(over: any = {}) {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from: over.from,
  }
}

describe('POST /api/repo-scans', () => {
  beforeEach(() => {
    state.client = null
    vi.restoreAllMocks()
    process.env.SCANNER_API_URL = 'http://scanner'
    process.env.SCANNER_INTERNAL_KEY = 'k'
  })

  it('rejects an unverified/foreign repo with 404', async () => {
    state.client = makeClient({
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: null }) }),
            single: async () => ({ data: null }),
          }),
        }),
      }),
    })
    const { POST } = await import('./route')
    const res = await POST(new Request('http://x/api/repo-scans', {
      method: 'POST', body: JSON.stringify({ repo_id: '11111111-1111-1111-1111-111111111111' }),
    }))
    expect(res.status).toBe(404)
  })

  it('picks full mode and dispatches for a never-scanned repo', async () => {
    const inserted = { id: 'scan-1' }
    const calls: any = { insertMode: null }
    state.client = makeClient({
      from: (table: string) => {
        if (table === 'repos') return {
          select: () => ({ eq: () => ({ eq: () => ({
            single: async () => ({ data: { id: 'repo-1', status: 'active', last_scanned_sha: null } }),
          }) }) }),
        }
        // repo_scans: active-check then insert
        return {
          select: () => ({ eq: () => ({ in: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
          insert: (row: any) => { calls.insertMode = row.mode; return {
            select: () => ({ single: async () => ({ data: inserted, error: null }) }) } },
          delete: () => ({ eq: async () => ({}) }),
        }
      },
    })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })) as any)
    const { POST } = await import('./route')
    const res = await POST(new Request('http://x/api/repo-scans', {
      method: 'POST', body: JSON.stringify({ repo_id: '11111111-1111-1111-1111-111111111111' }),
    }))
    expect(res.status).toBe(202)
    expect(calls.insertMode).toBe('full')
    expect(await res.json()).toEqual({ repo_scan_id: 'scan-1' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run app/api/repo-scans/route.test.ts`
Expected: FAIL — cannot find `./route`.

- [ ] **Step 3: Implement `apps/web/app/api/repo-scans/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'

const EnqueueSchema = z.object({ repo_id: z.string().uuid() })

async function dispatchToScanner(payload: {
  repo_scan_id: string
  repo_id: string
  user_id: string
}): Promise<boolean> {
  try {
    const res = await fetch(`${process.env.SCANNER_API_URL}/api/repo-scans`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Key': process.env.SCANNER_INTERNAL_KEY ?? '',
      },
      body: JSON.stringify(payload),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function POST(request: Request) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = EnqueueSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }
  const { repo_id } = parsed.data

  const { data: repo } = await supabase
    .from('repos')
    .select('id, status, last_scanned_sha')
    .eq('id', repo_id)
    .eq('user_id', user.id)
    .single()

  if (!repo || repo.status !== 'active') {
    return NextResponse.json({ error: 'Repo not found' }, { status: 404 })
  }

  const { data: activeScan } = await supabase
    .from('repo_scans')
    .select('id')
    .eq('repo_id', repo_id)
    .in('status', ['pending', 'running'])
    .maybeSingle()

  if (activeScan) {
    return NextResponse.json(
      { error: 'Scan already in progress', repo_scan_id: activeScan.id },
      { status: 409 },
    )
  }

  const mode = repo.last_scanned_sha ? 'incremental' : 'full'

  const { data: scan, error: insertError } = await supabase
    .from('repo_scans')
    .insert({
      repo_id,
      user_id: user.id,
      mode,
      status: 'pending',
      triggered_by: 'manual',
    })
    .select('id')
    .single()

  if (insertError || !scan) {
    return NextResponse.json({ error: 'Failed to create scan' }, { status: 500 })
  }

  const dispatched = await dispatchToScanner({
    repo_scan_id: scan.id,
    repo_id,
    user_id: user.id,
  })

  if (!dispatched) {
    await supabase.from('repo_scans').delete().eq('id', scan.id)
    return NextResponse.json({ error: 'Scanner service unavailable' }, { status: 502 })
  }

  return NextResponse.json({ repo_scan_id: scan.id }, { status: 202 })
}

export async function GET(request: Request) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing scan id' }, { status: 400 })

  const { data: scan } = await supabase
    .from('repo_scans')
    .select('id, status, mode, secrets_found, completed_at')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!scan) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(scan)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run app/api/repo-scans/route.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Run the full web suite + build (no regressions)**

Run: `cd apps/web && npx vitest run && npm run build`
Expected: all tests pass; production build clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/api/repo-scans/route.ts apps/web/app/api/repo-scans/route.test.ts
git commit -m "feat(web): /api/repo-scans enqueue+status (mode select, duplicate guard)"
```

---

## Self-Review

**Spec coverage:**
- §3/§4 token minting + clone → Tasks 2, 4. §5 redaction + severity + no-raw-secret → Tasks 3, 4 (asserted). §5 force-push fallback → Task 4. §6 authorization gate → Task 5; scanner job → Task 6; web enqueue + mode selection + duplicate guard → Task 9. §9 internal-key endpoint → Task 7; token never logged → Task 6 (asserted). gitleaks in Dockerfile → Task 8. **Out of scope (correctly not in this plan):** report UI `/repos` + `/repos/[repoId]` (Plan C), push-event auto-trigger, email alerts, Vercel.
- §11 testing strategy: redaction safety (T3/T4), full vs incremental log-opts (T4), force-push fallback (T4), authorization gate aborts (T5/T6), clone cleanup (T4), web mode select + duplicate (T9), token-minting + REST mocked (T2). **Copy-accuracy assertion** lives on the web side (GitHubCard) shipped in Plan A and belongs to Plan C's UI verification — noted, not duplicated here.

**Placeholder scan:** none — every code step is complete.

**Type consistency:** `RepoScanResult(mode, head_sha, base_sha, findings)` produced in T4 and consumed in T6. `repo_consent.verify` returns `full_name, github_repo_id, installation_id, last_scanned_sha` (T5) — exactly the keys T6 reads. `mint_installation_token(installation_id, repository_ids=)` signature matches T2↔T6. Redacted-row keys (T3) match the `repo_findings` columns in migration `20260620000023`. Web inserts `mode` ∈ {full, incremental} matching the table CHECK.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-20-github-integration-plan-b-scanner.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks.
2. **Inline Execution** — execute tasks in this session with checkpoints.

Which approach?
