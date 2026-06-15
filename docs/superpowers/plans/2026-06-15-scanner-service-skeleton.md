# Scanner Service Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `apps/scanner/` from scratch as a deployable FastAPI + Celery service with passive scan modules (headers + TLS), and update the web app to POST to the scanner instead of BullMQ.

**Architecture:** Scanner is a standalone FastAPI service. The web app POSTs scan jobs to it via HTTP with a shared secret header. The scanner enqueues jobs into its own internal Celery+Redis queue, runs passive checks, and writes findings + grades directly to Supabase using the service role key.

**Tech Stack:** Python 3.12, FastAPI 0.115, Celery 5.4, Redis, httpx, sslyze 6.0, supabase-py 2.7, pydantic-settings 2.4, pytest 8, TypeScript (web app update)

---

## File Map

### New files (apps/scanner/)
| File | Responsibility |
|---|---|
| `requirements.txt` | All Python deps pinned |
| `pytest.ini` | pytest config, test discovery |
| `Dockerfile` | Build image for Fly.io |
| `fly.toml` | Fly.io app config, two processes |
| `.env.example` | All required env vars documented |
| `lib/settings.py` | Pydantic-settings: single source of env vars |
| `lib/supabase.py` | supabase-py singleton (service role) |
| `lib/consent.py` | `verify(url_id)` → url string or raise ConsentError |
| `lib/storage.py` | PDF upload stub |
| `scanners/base.py` | `Finding` dataclass + `BaseScanner` ABC |
| `scanners/headers.py` | `HeadersScanner` — HTTP security header checks |
| `scanners/tls.py` | `TLSScanner` — sslyze TLS/cert checks |
| `reports/grader.py` | `grade(findings)` → (letter, score) |
| `queue/config.py` | Celery app instance + broker config |
| `queue/worker.py` | Worker entry point (`celery -A queue.worker worker`) |
| `queue/tasks.py` | `run_scan` Celery task |
| `api/middleware/auth.py` | `verify_internal_key` FastAPI dependency |
| `api/routes/health.py` | `GET /health` |
| `api/routes/scans.py` | `POST /api/scans` |
| `api/main.py` | FastAPI app, mounts routers |
| `tests/conftest.py` | Shared pytest fixtures |
| `tests/test_consent.py` | Tests for consent.verify |
| `tests/test_grader.py` | Tests for grade calculation |
| `tests/test_headers.py` | Tests for HeadersScanner logic |
| `tests/test_tls.py` | Tests for TLSScanner logic |
| `tests/test_tasks.py` | Tests for run_scan task orchestration |
| `tests/test_routes.py` | Tests for FastAPI endpoints |

### Modified files (apps/web/)
| File | Change |
|---|---|
| `app/api/scans/route.ts` | Replace `scanQueue.add()` with `fetch()` to scanner |
| `app/api/webhooks/route.ts` | Same — replace `scanQueue.add()` with `fetch()` |
| `lib/redis/client.ts` | Delete — no longer needed by web app |
| `package.json` | Remove `bullmq` and `ioredis` |
| `.env.example` | Add `SCANNER_API_URL`, `SCANNER_INTERNAL_KEY`; remove `REDIS_URL` |

---

## Task 1: Project scaffold

**Files:**
- Create: `apps/scanner/requirements.txt`
- Create: `apps/scanner/pytest.ini`
- Create: `apps/scanner/.env.example`
- Create: `apps/scanner/tests/__init__.py`
- Create: `apps/scanner/tests/conftest.py`
- Create: `apps/scanner/lib/__init__.py`
- Create: `apps/scanner/scanners/__init__.py`
- Create: `apps/scanner/reports/__init__.py`
- Create: `apps/scanner/queue/__init__.py`
- Create: `apps/scanner/api/__init__.py`
- Create: `apps/scanner/api/routes/__init__.py`
- Create: `apps/scanner/api/middleware/__init__.py`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p apps/scanner/api/routes apps/scanner/api/middleware
mkdir -p apps/scanner/queue apps/scanner/scanners
mkdir -p apps/scanner/lib apps/scanner/reports
mkdir -p apps/scanner/tests
```

- [ ] **Step 2: Create requirements.txt**

`apps/scanner/requirements.txt`:
```
fastapi==0.115.0
uvicorn[standard]==0.30.0
celery[redis]==5.4.0
redis==5.0.8
httpx==0.27.0
pydantic==2.8.0
pydantic-settings==2.4.0
supabase==2.7.0
sslyze==6.0.0
python-dotenv==1.0.1

# dev/test
pytest==8.3.0
pytest-asyncio==0.24.0
respx==0.21.0
```

- [ ] **Step 3: Create pytest.ini**

`apps/scanner/pytest.ini`:
```ini
[pytest]
testpaths = tests
asyncio_mode = auto
```

- [ ] **Step 4: Create .env.example**

`apps/scanner/.env.example`:
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
REDIS_URL=redis://localhost:6379
SCANNER_INTERNAL_KEY=change-me-shared-secret
SCANNER_VERSION=0.1.0
MAX_CONCURRENT_SCANS=5
```

- [ ] **Step 5: Create all __init__.py files**

Create empty `__init__.py` in: `tests/`, `lib/`, `scanners/`, `reports/`, `queue/`, `api/`, `api/routes/`, `api/middleware/`

- [ ] **Step 6: Create conftest.py**

`apps/scanner/tests/conftest.py`:
```python
import pytest
from unittest.mock import MagicMock, patch


@pytest.fixture
def mock_supabase():
    """Patches get_supabase() everywhere and returns a mock client."""
    with patch("lib.supabase.get_supabase") as mock_getter:
        client = MagicMock()
        mock_getter.return_value = client
        yield client


@pytest.fixture
def mock_settings(monkeypatch):
    """Provides test values for settings without a real .env file."""
    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379")
    monkeypatch.setenv("SCANNER_INTERNAL_KEY", "test-internal-key")
    monkeypatch.setenv("SCANNER_VERSION", "0.1.0")
    monkeypatch.setenv("MAX_CONCURRENT_SCANS", "5")
```

- [ ] **Step 7: Commit scaffold**

```bash
git add apps/scanner/
git commit -m "feat(scanner): project scaffold — dirs, requirements, pytest config"
```

---

## Task 2: Settings

**Files:**
- Create: `apps/scanner/lib/settings.py`

- [ ] **Step 1: Write the failing test**

`apps/scanner/tests/test_settings.py`:
```python
import pytest
from unittest.mock import patch
import importlib


def test_settings_loads_from_env(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://abc.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "svc-key")
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379")
    monkeypatch.setenv("SCANNER_INTERNAL_KEY", "secret")
    monkeypatch.setenv("SCANNER_VERSION", "0.2.0")
    monkeypatch.setenv("MAX_CONCURRENT_SCANS", "3")

    # Re-import to pick up monkeypatched env
    import lib.settings as s
    importlib.reload(s)

    assert s.settings.supabase_url == "https://abc.supabase.co"
    assert s.settings.scanner_version == "0.2.0"
    assert s.settings.max_concurrent_scans == 3
```

- [ ] **Step 2: Run test — expect failure**

```bash
cd apps/scanner && pytest tests/test_settings.py -v
```
Expected: `ModuleNotFoundError: No module named 'lib.settings'`

- [ ] **Step 3: Implement settings**

`apps/scanner/lib/settings.py`:
```python
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    supabase_url: str
    supabase_service_role_key: str
    redis_url: str = "redis://localhost:6379"
    scanner_internal_key: str
    scanner_version: str = "0.1.0"
    max_concurrent_scans: int = 5

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
```

- [ ] **Step 4: Run test — expect pass**

```bash
cd apps/scanner && pytest tests/test_settings.py -v
```
Expected: `PASSED`

- [ ] **Step 5: Commit**

```bash
git add apps/scanner/lib/settings.py apps/scanner/tests/test_settings.py
git commit -m "feat(scanner): settings module via pydantic-settings"
```

---

## Task 3: Supabase client + consent check

**Files:**
- Create: `apps/scanner/lib/supabase.py`
- Create: `apps/scanner/lib/consent.py`
- Create: `apps/scanner/lib/storage.py`
- Create: `apps/scanner/tests/test_consent.py`

- [ ] **Step 1: Write the failing tests**

`apps/scanner/tests/test_consent.py`:
```python
import pytest
from unittest.mock import MagicMock, patch


@pytest.fixture
def mock_sb():
    with patch("lib.consent.get_supabase") as mock:
        client = MagicMock()
        mock.return_value = client
        yield client


def _chain(client, data):
    """Configures the supabase query chain to return data."""
    client.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = data


def test_verify_returns_url_when_verified(mock_sb):
    from lib.consent import verify
    _chain(mock_sb, {"url": "https://example.com", "verified": True})
    result = verify("url-uuid-123")
    assert result == "https://example.com"


def test_verify_raises_when_not_verified(mock_sb):
    from lib.consent import verify, ConsentError
    _chain(mock_sb, {"url": "https://example.com", "verified": False})
    with pytest.raises(ConsentError):
        verify("url-uuid-123")


def test_verify_raises_when_url_not_found(mock_sb):
    from lib.consent import verify, ConsentError
    _chain(mock_sb, None)
    with pytest.raises(ConsentError):
        verify("url-uuid-123")
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd apps/scanner && pytest tests/test_consent.py -v
```
Expected: `ModuleNotFoundError: No module named 'lib.consent'`

- [ ] **Step 3: Implement supabase.py**

`apps/scanner/lib/supabase.py`:
```python
from supabase import Client, create_client
from lib.settings import settings

_client: Client | None = None


def get_supabase() -> Client:
    global _client
    if _client is None:
        _client = create_client(settings.supabase_url, settings.supabase_service_role_key)
    return _client
```

- [ ] **Step 4: Implement consent.py**

`apps/scanner/lib/consent.py`:
```python
from lib.supabase import get_supabase


class ConsentError(Exception):
    pass


def verify(url_id: str) -> str:
    """Returns the URL string if ownership is verified, raises ConsentError otherwise.

    This MUST be called before any scan tool runs. It is the gate that ensures
    we never scan a URL the user does not own.
    """
    supabase = get_supabase()
    result = (
        supabase.table("urls")
        .select("url, verified")
        .eq("id", url_id)
        .eq("verified", True)
        .single()
        .execute()
    )
    if not result.data:
        raise ConsentError(f"URL {url_id} is not verified — scan aborted")
    return result.data["url"]
```

- [ ] **Step 5: Implement storage.py stub**

`apps/scanner/lib/storage.py`:
```python
# PDF upload to Supabase Storage — not implemented in Step 1.
# Placeholder so queue/tasks.py can import it without error.

def upload_pdf(scan_id: str, pdf_bytes: bytes) -> str:
    raise NotImplementedError("PDF upload not implemented in Step 1")
```

- [ ] **Step 6: Run tests — expect pass**

```bash
cd apps/scanner && pytest tests/test_consent.py -v
```
Expected: 3 tests `PASSED`

- [ ] **Step 7: Commit**

```bash
git add apps/scanner/lib/
git commit -m "feat(scanner): supabase client, consent check, storage stub"
```

---

## Task 4: Finding dataclass + BaseScanner + Grader

**Files:**
- Create: `apps/scanner/scanners/base.py`
- Create: `apps/scanner/reports/grader.py`
- Create: `apps/scanner/tests/test_grader.py`

- [ ] **Step 1: Write the failing tests**

`apps/scanner/tests/test_grader.py`:
```python
import pytest
from scanners.base import Finding
from reports.grader import grade, calculate_score, score_to_grade


def make_finding(severity: str) -> Finding:
    return Finding(
        severity=severity,
        category="Test",
        title="Test finding",
        description="desc",
        what_we_did="checked",
        remediation="fix it",
    )


def test_perfect_score_no_findings():
    letter, score = grade([])
    assert score == 100
    assert letter == "A"


def test_critical_deducts_25():
    _, score = grade([make_finding("critical")])
    assert score == 75


def test_high_deducts_15():
    _, score = grade([make_finding("high")])
    assert score == 85


def test_medium_deducts_8():
    _, score = grade([make_finding("medium")])
    assert score == 92


def test_low_deducts_3():
    _, score = grade([make_finding("low")])
    assert score == 97


def test_pass_and_info_dont_deduct():
    _, score = grade([make_finding("pass"), make_finding("info")])
    assert score == 100


def test_score_floors_at_zero():
    findings = [make_finding("critical")] * 10
    _, score = grade(findings)
    assert score == 0


def test_grade_thresholds():
    assert score_to_grade(100) == "A"
    assert score_to_grade(90) == "A"
    assert score_to_grade(89) == "B"
    assert score_to_grade(75) == "B"
    assert score_to_grade(74) == "C"
    assert score_to_grade(60) == "C"
    assert score_to_grade(59) == "D"
    assert score_to_grade(40) == "D"
    assert score_to_grade(39) == "F"
    assert score_to_grade(0) == "F"


def test_mixed_findings_grade():
    findings = [
        make_finding("critical"),  # -25 → 75
        make_finding("high"),      # -15 → 60
        make_finding("medium"),    # -8  → 52
        make_finding("pass"),      # +0
    ]
    letter, score = grade(findings)
    assert score == 52
    assert letter == "D"
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd apps/scanner && pytest tests/test_grader.py -v
```
Expected: `ModuleNotFoundError: No module named 'scanners.base'`

- [ ] **Step 3: Implement scanners/base.py**

`apps/scanner/scanners/base.py`:
```python
from abc import ABC, abstractmethod
from dataclasses import dataclass, asdict
from typing import Literal

Severity = Literal["critical", "high", "medium", "low", "info", "pass"]


@dataclass
class Finding:
    severity: Severity
    category: str
    title: str
    description: str
    what_we_did: str
    remediation: str

    def to_dict(self) -> dict:
        return asdict(self)


class BaseScanner(ABC):
    def __init__(self, url: str, timeout: int = 30) -> None:
        self.url = url
        self.timeout = timeout

    @abstractmethod
    def run(self) -> list[Finding]:
        ...
```

- [ ] **Step 4: Implement reports/grader.py**

`apps/scanner/reports/grader.py`:
```python
from scanners.base import Finding

_DEDUCTIONS: dict[str, int] = {
    "critical": 25,
    "high": 15,
    "medium": 8,
    "low": 3,
    "info": 0,
    "pass": 0,
}

_THRESHOLDS: list[tuple[int, str]] = [
    (90, "A"),
    (75, "B"),
    (60, "C"),
    (40, "D"),
    (0, "F"),
]


def calculate_score(findings: list[Finding]) -> int:
    score = 100 - sum(_DEDUCTIONS.get(f.severity, 0) for f in findings)
    return max(0, score)


def score_to_grade(score: int) -> str:
    for threshold, letter in _THRESHOLDS:
        if score >= threshold:
            return letter
    return "F"


def grade(findings: list[Finding]) -> tuple[str, int]:
    """Returns (letter_grade, score) from a list of findings."""
    score = calculate_score(findings)
    return score_to_grade(score), score
```

- [ ] **Step 5: Run tests — expect pass**

```bash
cd apps/scanner && pytest tests/test_grader.py -v
```
Expected: all 10 tests `PASSED`

- [ ] **Step 6: Commit**

```bash
git add apps/scanner/scanners/base.py apps/scanner/reports/grader.py apps/scanner/tests/test_grader.py
git commit -m "feat(scanner): Finding dataclass, BaseScanner, grade calculator"
```

---

## Task 5: Headers scanner

**Files:**
- Create: `apps/scanner/scanners/headers.py`
- Create: `apps/scanner/tests/test_headers.py`

- [ ] **Step 1: Write the failing tests**

`apps/scanner/tests/test_headers.py`:
```python
import pytest
import httpx
import respx
from scanners.headers import HeadersScanner


BASE_URL = "https://example.com"


def run_with_headers(headers: dict) -> list:
    with respx.mock:
        respx.get(BASE_URL).mock(return_value=httpx.Response(200, headers=headers))
        return HeadersScanner(BASE_URL).run()


def severities(findings) -> set:
    return {f.severity for f in findings}


def titles(findings) -> list:
    return [f.title for f in findings]


def test_all_headers_present_and_correct():
    headers = {
        "content-security-policy": "default-src 'self'",
        "strict-transport-security": "max-age=31536000; includeSubDomains",
        "x-content-type-options": "nosniff",
        "x-frame-options": "DENY",
        "referrer-policy": "strict-origin-when-cross-origin",
        "permissions-policy": "camera=(), microphone=()",
    }
    findings = run_with_headers(headers)
    assert all(f.severity == "pass" for f in findings), findings


def test_missing_csp_is_high():
    headers = {
        "strict-transport-security": "max-age=31536000",
        "x-content-type-options": "nosniff",
        "x-frame-options": "DENY",
        "referrer-policy": "no-referrer",
        "permissions-policy": "camera=()",
    }
    findings = run_with_headers(headers)
    csp_findings = [f for f in findings if "Content-Security-Policy" in f.title and f.severity != "pass"]
    assert len(csp_findings) == 1
    assert csp_findings[0].severity == "high"


def test_csp_with_unsafe_inline_is_medium():
    headers = {
        "content-security-policy": "default-src 'self' 'unsafe-inline'",
        "strict-transport-security": "max-age=31536000",
        "x-content-type-options": "nosniff",
        "x-frame-options": "DENY",
        "referrer-policy": "no-referrer",
        "permissions-policy": "camera=()",
    }
    findings = run_with_headers(headers)
    csp_findings = [f for f in findings if "Content-Security-Policy" in f.title and f.severity != "pass"]
    assert len(csp_findings) == 1
    assert csp_findings[0].severity == "medium"


def test_missing_hsts_is_high():
    headers = {
        "content-security-policy": "default-src 'self'",
        "x-content-type-options": "nosniff",
        "x-frame-options": "DENY",
        "referrer-policy": "no-referrer",
        "permissions-policy": "camera=()",
    }
    findings = run_with_headers(headers)
    hsts_findings = [f for f in findings if "Strict-Transport-Security" in f.title and f.severity != "pass"]
    assert len(hsts_findings) == 1
    assert hsts_findings[0].severity == "high"


def test_hsts_short_max_age_is_medium():
    headers = {
        "content-security-policy": "default-src 'self'",
        "strict-transport-security": "max-age=3600",
        "x-content-type-options": "nosniff",
        "x-frame-options": "DENY",
        "referrer-policy": "no-referrer",
        "permissions-policy": "camera=()",
    }
    findings = run_with_headers(headers)
    hsts_findings = [f for f in findings if "Strict-Transport-Security" in f.title and f.severity != "pass"]
    assert len(hsts_findings) == 1
    assert hsts_findings[0].severity == "medium"


def test_missing_x_content_type_is_medium():
    headers = {
        "content-security-policy": "default-src 'self'",
        "strict-transport-security": "max-age=31536000",
        "x-frame-options": "DENY",
        "referrer-policy": "no-referrer",
        "permissions-policy": "camera=()",
    }
    findings = run_with_headers(headers)
    xcto_findings = [f for f in findings if "X-Content-Type-Options" in f.title and f.severity != "pass"]
    assert len(xcto_findings) == 1
    assert xcto_findings[0].severity == "medium"


def test_missing_x_frame_options_is_medium():
    headers = {
        "content-security-policy": "default-src 'self'",
        "strict-transport-security": "max-age=31536000",
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
        "permissions-policy": "camera=()",
    }
    findings = run_with_headers(headers)
    xfo_findings = [f for f in findings if "X-Frame-Options" in f.title and f.severity != "pass"]
    assert len(xfo_findings) == 1
    assert xfo_findings[0].severity == "medium"


def test_missing_referrer_policy_is_low():
    headers = {
        "content-security-policy": "default-src 'self'",
        "strict-transport-security": "max-age=31536000",
        "x-content-type-options": "nosniff",
        "x-frame-options": "DENY",
        "permissions-policy": "camera=()",
    }
    findings = run_with_headers(headers)
    rp_findings = [f for f in findings if "Referrer-Policy" in f.title and f.severity != "pass"]
    assert len(rp_findings) == 1
    assert rp_findings[0].severity == "low"


def test_missing_permissions_policy_is_low():
    headers = {
        "content-security-policy": "default-src 'self'",
        "strict-transport-security": "max-age=31536000",
        "x-content-type-options": "nosniff",
        "x-frame-options": "DENY",
        "referrer-policy": "no-referrer",
    }
    findings = run_with_headers(headers)
    pp_findings = [f for f in findings if "Permissions-Policy" in f.title and f.severity != "pass"]
    assert len(pp_findings) == 1
    assert pp_findings[0].severity == "low"


def test_connection_error_returns_critical_finding():
    with respx.mock:
        respx.get(BASE_URL).mock(side_effect=httpx.ConnectError("refused"))
        findings = HeadersScanner(BASE_URL).run()
    assert len(findings) == 1
    assert findings[0].severity == "critical"
    assert "reach" in findings[0].title.lower() or "connect" in findings[0].title.lower()
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd apps/scanner && pytest tests/test_headers.py -v
```
Expected: `ModuleNotFoundError: No module named 'scanners.headers'`

- [ ] **Step 3: Implement scanners/headers.py**

`apps/scanner/scanners/headers.py`:
```python
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

    # --- individual checks ---

    def _check_csp(self, headers: dict) -> list[Finding]:
        value = headers.get("content-security-policy")
        if not value:
            return [Finding(
                severity="high",
                category="Security Headers",
                title="Content-Security-Policy Missing",
                description="No Content-Security-Policy header was returned by the server.",
                what_we_did="Checked HTTP response headers for Content-Security-Policy.",
                remediation="Add a Content-Security-Policy header. Start with 'default-src \\'self\\'' and refine.",
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
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd apps/scanner && pytest tests/test_headers.py -v
```
Expected: all 10 tests `PASSED`

- [ ] **Step 5: Commit**

```bash
git add apps/scanner/scanners/headers.py apps/scanner/tests/test_headers.py
git commit -m "feat(scanner): HeadersScanner — HTTP security header passive checks"
```

---

## Task 6: TLS scanner

**Files:**
- Create: `apps/scanner/scanners/tls.py`
- Create: `apps/scanner/tests/test_tls.py`

The TLS scanner wraps sslyze. Tests mock the sslyze scan to test our logic independently of the library's network calls.

- [ ] **Step 1: Write the failing tests**

`apps/scanner/tests/test_tls.py`:
```python
import pytest
from unittest.mock import MagicMock, patch
from datetime import datetime, timezone, timedelta
from scanners.tls import TLSScanner, _analyze_cert_info, _analyze_tls_versions


def make_cert(days_until_expiry: int, is_valid: bool = True):
    """Builds a mock certificate leaf object."""
    cert = MagicMock()
    not_after = datetime.now(timezone.utc) + timedelta(days=days_until_expiry)
    cert.not_valid_after_utc = not_after
    # sslyze wraps cert in ParsedCertificate; we access not_valid_after_utc directly
    return cert


def test_cert_expired_is_critical():
    findings = _analyze_cert_info(days_until_expiry=-1)
    assert any(f.severity == "critical" for f in findings)


def test_cert_expiring_soon_is_high():
    findings = _analyze_cert_info(days_until_expiry=15)
    assert any(f.severity == "high" for f in findings)


def test_cert_valid_long_is_pass():
    findings = _analyze_cert_info(days_until_expiry=180)
    assert all(f.severity == "pass" for f in findings)


def test_tls_12_only_is_pass():
    findings = _analyze_tls_versions(has_tls12=True, has_tls13=False, has_weak=False)
    severities = {f.severity for f in findings}
    assert "critical" not in severities
    assert "high" not in severities


def test_tls_13_adds_pass_finding():
    findings = _analyze_tls_versions(has_tls12=True, has_tls13=True, has_weak=False)
    assert any(f.severity == "pass" and "1.3" in f.title for f in findings)


def test_weak_tls_only_is_high():
    findings = _analyze_tls_versions(has_tls12=False, has_tls13=False, has_weak=True)
    assert any(f.severity == "high" for f in findings)


def test_scanner_returns_info_on_connection_failure():
    with patch("scanners.tls.Scanner") as MockScanner:
        MockScanner.return_value.get_results.side_effect = Exception("network error")
        findings = TLSScanner("https://example.com").run()
    assert len(findings) == 1
    assert findings[0].severity == "info"
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd apps/scanner && pytest tests/test_tls.py -v
```
Expected: `ModuleNotFoundError: No module named 'scanners.tls'`

- [ ] **Step 3: Implement scanners/tls.py**

`apps/scanner/scanners/tls.py`:
```python
from datetime import datetime, timezone, timedelta
from urllib.parse import urlparse

from sslyze import Scanner, ServerNetworkLocation, ServerScanRequest
from sslyze.plugins.scan_commands import ScanCommand

from scanners.base import BaseScanner, Finding

_EXPIRY_WARNING_DAYS = 30


def _analyze_cert_info(days_until_expiry: int) -> list[Finding]:
    if days_until_expiry < 0:
        return [Finding(
            severity="critical",
            category="TLS / Certificate",
            title="SSL Certificate Expired",
            description=f"The certificate expired {abs(days_until_expiry)} days ago.",
            what_we_did="Checked certificate validity period using sslyze.",
            remediation="Renew your SSL certificate immediately.",
        )]
    if days_until_expiry < _EXPIRY_WARNING_DAYS:
        return [Finding(
            severity="high",
            category="TLS / Certificate",
            title="SSL Certificate Expiring Soon",
            description=f"Certificate expires in {days_until_expiry} days.",
            what_we_did="Checked certificate expiry date using sslyze.",
            remediation=f"Renew your SSL certificate before it expires in {days_until_expiry} days.",
        )]
    return [Finding(
        severity="pass",
        category="TLS / Certificate",
        title="SSL Certificate Valid",
        description=f"Certificate is valid for {days_until_expiry} more days.",
        what_we_did="Checked certificate validity and expiry using sslyze.",
        remediation="",
    )]


def _analyze_tls_versions(has_tls12: bool, has_tls13: bool, has_weak: bool) -> list[Finding]:
    findings: list[Finding] = []

    if has_weak and not has_tls12 and not has_tls13:
        findings.append(Finding(
            severity="high",
            category="TLS / Protocol",
            title="Only Weak TLS Versions Supported (TLS 1.0/1.1)",
            description="The server only supports deprecated TLS 1.0 or TLS 1.1 protocols.",
            what_we_did="Probed supported TLS versions using sslyze.",
            remediation="Disable TLS 1.0 and 1.1. Enable TLS 1.2 as the minimum, and TLS 1.3 if possible.",
        ))
    elif has_weak:
        findings.append(Finding(
            severity="medium",
            category="TLS / Protocol",
            title="Weak TLS Versions Also Supported (TLS 1.0/1.1)",
            description="The server supports TLS 1.2+ but also allows deprecated TLS 1.0 or 1.1.",
            what_we_did="Probed supported TLS versions using sslyze.",
            remediation="Disable TLS 1.0 and 1.1 on your server.",
        ))

    if has_tls13:
        findings.append(Finding(
            severity="pass",
            category="TLS / Protocol",
            title="TLS 1.3 Supported",
            description="Server supports TLS 1.3, the most secure TLS version.",
            what_we_did="Probed TLS 1.3 support using sslyze.",
            remediation="",
        ))
    elif has_tls12:
        findings.append(Finding(
            severity="pass",
            category="TLS / Protocol",
            title="TLS 1.2 Supported",
            description="Server supports TLS 1.2 as the minimum acceptable version.",
            what_we_did="Probed TLS 1.2 support using sslyze.",
            remediation="Consider also enabling TLS 1.3 for improved performance and security.",
        ))

    return findings


class TLSScanner(BaseScanner):
    def run(self) -> list[Finding]:
        hostname = urlparse(self.url).hostname
        if not hostname:
            return [Finding(
                severity="info",
                category="TLS / Certificate",
                title="TLS Scan Skipped",
                description="Could not extract hostname from URL.",
                what_we_did="Attempted to parse hostname from URL.",
                remediation="Ensure the URL includes a valid hostname.",
            )]

        try:
            location = ServerNetworkLocation(hostname=hostname, port=443)
            request = ServerScanRequest(
                server_location=location,
                scan_commands={
                    ScanCommand.CERTIFICATE_INFO,
                    ScanCommand.SSL_2_0_CIPHER_SUITES,
                    ScanCommand.SSL_3_0_CIPHER_SUITES,
                    ScanCommand.TLS_1_0_CIPHER_SUITES,
                    ScanCommand.TLS_1_1_CIPHER_SUITES,
                    ScanCommand.TLS_1_2_CIPHER_SUITES,
                    ScanCommand.TLS_1_3_CIPHER_SUITES,
                },
            )
            scanner = Scanner()
            scanner.queue_scans([request])

            findings: list[Finding] = []
            for result in scanner.get_results():
                if result.scan_result is None:
                    continue
                findings.extend(self._process_result(result.scan_result))
            return findings

        except Exception as exc:
            return [Finding(
                severity="info",
                category="TLS / Certificate",
                title="TLS Scan Could Not Complete",
                description=f"sslyze could not connect to {hostname}:443 — {exc}",
                what_we_did="Attempted TLS/SSL analysis using sslyze.",
                remediation="Ensure the server is accessible on port 443.",
            )]

    def _process_result(self, scan_result) -> list[Finding]:
        findings: list[Finding] = []

        # Certificate
        cert_info = getattr(scan_result, "certificate_info", None)
        if cert_info and not isinstance(cert_info, Exception):
            try:
                leaf = cert_info.result.verified_certificate_chain[0]
                expiry: datetime = leaf.not_valid_after_utc
                days_left = (expiry - datetime.now(timezone.utc)).days
                findings.extend(_analyze_cert_info(days_left))
            except Exception:
                pass

        # TLS versions
        def _has_accepted(attr_name: str) -> bool:
            result = getattr(scan_result, attr_name, None)
            if result is None or isinstance(result, Exception):
                return False
            accepted = getattr(result.result, "accepted_cipher_suites", [])
            return len(accepted) > 0

        has_tls12 = _has_accepted("tls_1_2_cipher_suites")
        has_tls13 = _has_accepted("tls_1_3_cipher_suites")
        has_weak = (
            _has_accepted("ssl_2_0_cipher_suites")
            or _has_accepted("ssl_3_0_cipher_suites")
            or _has_accepted("tls_1_0_cipher_suites")
            or _has_accepted("tls_1_1_cipher_suites")
        )

        findings.extend(_analyze_tls_versions(has_tls12, has_tls13, has_weak))
        return findings
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd apps/scanner && pytest tests/test_tls.py -v
```
Expected: all 7 tests `PASSED`

- [ ] **Step 5: Commit**

```bash
git add apps/scanner/scanners/tls.py apps/scanner/tests/test_tls.py
git commit -m "feat(scanner): TLSScanner — certificate and protocol version checks via sslyze"
```

---

## Task 7: Celery queue + scan task

**Files:**
- Create: `apps/scanner/queue/config.py`
- Create: `apps/scanner/queue/worker.py`
- Create: `apps/scanner/queue/tasks.py`
- Create: `apps/scanner/tests/test_tasks.py`

- [ ] **Step 1: Write the failing tests**

`apps/scanner/tests/test_tasks.py`:
```python
import pytest
from unittest.mock import MagicMock, patch, call
from lib.consent import ConsentError


@pytest.fixture
def mock_sb():
    with patch("queue.tasks.get_supabase") as mock:
        client = MagicMock()
        # Make update().eq().execute() chainable
        client.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock()
        client.table.return_value.insert.return_value.execute.return_value = MagicMock()
        mock.return_value = client
        yield client


@pytest.fixture
def mock_consent_ok():
    with patch("queue.tasks.consent.verify", return_value="https://example.com") as mock:
        yield mock


@pytest.fixture
def mock_scanners_empty():
    with patch("queue.tasks.HeadersScanner") as mh, patch("queue.tasks.TLSScanner") as mt:
        mh.return_value.run.return_value = []
        mt.return_value.run.return_value = []
        yield mh, mt


def test_run_scan_marks_running_then_completed(mock_sb, mock_consent_ok, mock_scanners_empty):
    from queue.tasks import run_scan
    run_scan("scan-1", "url-1", "passive", "user-1")

    calls = mock_sb.table.call_args_list
    tables_called = [c[0][0] for c in calls]
    assert "scans" in tables_called


def test_run_scan_aborts_on_consent_error(mock_sb, mock_scanners_empty):
    with patch("queue.tasks.consent.verify", side_effect=ConsentError("not verified")):
        from queue.tasks import run_scan
        with pytest.raises(ConsentError):
            run_scan("scan-1", "url-1", "passive", "user-1")

    # Scan should be marked failed
    update_calls = str(mock_sb.table.return_value.update.call_args_list)
    assert "failed" in update_calls


def test_run_scan_inserts_findings_when_present(mock_sb, mock_consent_ok):
    from scanners.base import Finding
    from queue.tasks import run_scan

    finding = Finding(
        severity="high",
        category="Test",
        title="Test",
        description="d",
        what_we_did="w",
        remediation="r",
    )
    with patch("queue.tasks.HeadersScanner") as mh, patch("queue.tasks.TLSScanner") as mt:
        mh.return_value.run.return_value = [finding]
        mt.return_value.run.return_value = []
        run_scan("scan-1", "url-1", "passive", "user-1")

    mock_sb.table.return_value.insert.assert_called_once()
    inserted = mock_sb.table.return_value.insert.call_args[0][0]
    assert len(inserted) == 1
    assert inserted[0]["severity"] == "high"
    assert inserted[0]["scan_id"] == "scan-1"


def test_run_scan_skips_insert_when_no_findings(mock_sb, mock_consent_ok, mock_scanners_empty):
    from queue.tasks import run_scan
    run_scan("scan-1", "url-1", "passive", "user-1")
    mock_sb.table.return_value.insert.assert_not_called()


def test_run_scan_marks_failed_on_unexpected_error(mock_sb, mock_consent_ok):
    with patch("queue.tasks.HeadersScanner") as mh:
        mh.return_value.run.side_effect = RuntimeError("unexpected")
        from queue.tasks import run_scan
        with pytest.raises(RuntimeError):
            run_scan("scan-1", "url-1", "passive", "user-1")

    update_calls = str(mock_sb.table.return_value.update.call_args_list)
    assert "failed" in update_calls
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd apps/scanner && pytest tests/test_tasks.py -v
```
Expected: `ModuleNotFoundError: No module named 'queue.tasks'`

- [ ] **Step 3: Implement queue/config.py**

`apps/scanner/queue/config.py`:
```python
from celery import Celery
from lib.settings import settings

celery_app = Celery(
    "scanner",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["queue.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    result_expires=3600,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
)
```

- [ ] **Step 4: Implement queue/worker.py**

`apps/scanner/queue/worker.py`:
```python
from queue.config import celery_app  # noqa: F401 — imported so Celery discovers tasks
```

- [ ] **Step 5: Implement queue/tasks.py**

`apps/scanner/queue/tasks.py`:
```python
from datetime import datetime, timezone

from lib import consent
from lib.settings import settings
from lib.supabase import get_supabase
from reports.grader import grade
from scanners.headers import HeadersScanner
from scanners.tls import TLSScanner
from queue.config import celery_app


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _mark_scan(scan_id: str, **fields) -> None:
    get_supabase().table("scans").update(fields).eq("id", scan_id).execute()


@celery_app.task(bind=True, max_retries=3, default_retry_delay=5)
def run_scan(self, scan_id: str, url_id: str, scan_type: str, user_id: str) -> None:
    _mark_scan(scan_id, status="running", started_at=_now())

    try:
        url = consent.verify(url_id)
    except consent.ConsentError:
        _mark_scan(scan_id, status="failed", completed_at=_now())
        raise  # Do not retry consent errors

    try:
        findings = [
            *HeadersScanner(url).run(),
            *TLSScanner(url).run(),
        ]

        if findings:
            get_supabase().table("findings").insert([
                {**f.to_dict(), "scan_id": scan_id, "first_seen_at": _now()}
                for f in findings
            ]).execute()

        letter, score = grade(findings)

        _mark_scan(
            scan_id,
            status="completed",
            grade=letter,
            score=score,
            completed_at=_now(),
            scanner_version=settings.scanner_version,
        )

    except Exception as exc:
        _mark_scan(scan_id, status="failed", completed_at=_now())
        raise self.retry(exc=exc)
```

- [ ] **Step 6: Run tests — expect pass**

```bash
cd apps/scanner && pytest tests/test_tasks.py -v
```
Expected: all 5 tests `PASSED`

- [ ] **Step 7: Commit**

```bash
git add apps/scanner/queue/ apps/scanner/tests/test_tasks.py
git commit -m "feat(scanner): Celery queue config, worker, run_scan task"
```

---

## Task 8: FastAPI app — auth, routes, main

**Files:**
- Create: `apps/scanner/api/middleware/auth.py`
- Create: `apps/scanner/api/routes/health.py`
- Create: `apps/scanner/api/routes/scans.py`
- Create: `apps/scanner/api/main.py`
- Create: `apps/scanner/tests/test_routes.py`

- [ ] **Step 1: Write the failing tests**

`apps/scanner/tests/test_routes.py`:
```python
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    # Patch Celery task so it doesn't try to connect to Redis
    with patch("api.routes.scans.run_scan") as mock_task:
        mock_task.delay.return_value = MagicMock(id="celery-job-id")
        from api.main import app
        yield TestClient(app), mock_task


VALID_KEY = "test-internal-key"
HEADERS = {"X-Internal-Key": VALID_KEY}


def test_health_returns_ok(client):
    tc, _ = client
    resp = tc.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"
    assert "version" in resp.json()


def test_post_scan_requires_auth(client):
    tc, _ = client
    resp = tc.post("/api/scans", json={
        "scan_id": "a" * 36,
        "url_id": "b" * 36,
        "scan_type": "passive",
        "user_id": "c" * 36,
    })
    assert resp.status_code == 422 or resp.status_code == 401  # missing header → 422 (FastAPI) or 401


def test_post_scan_wrong_key_returns_401(client):
    tc, _ = client
    resp = tc.post(
        "/api/scans",
        json={"scan_id": "a" * 36, "url_id": "b" * 36, "scan_type": "passive", "user_id": "c" * 36},
        headers={"X-Internal-Key": "wrong-key"},
    )
    assert resp.status_code == 401


def test_post_scan_valid_returns_202(client):
    tc, mock_task = client
    resp = tc.post(
        "/api/scans",
        json={"scan_id": "scan-uuid-1234", "url_id": "url-uuid-1234", "scan_type": "passive", "user_id": "user-uuid-1"},
        headers=HEADERS,
    )
    assert resp.status_code == 202
    assert resp.json()["job_id"] == "scan-uuid-1234"
    mock_task.delay.assert_called_once_with(
        "scan-uuid-1234", "url-uuid-1234", "passive", "user-uuid-1"
    )


def test_post_scan_invalid_scan_type_returns_422(client):
    tc, _ = client
    resp = tc.post(
        "/api/scans",
        json={"scan_id": "scan-uuid-1234", "url_id": "url-uuid-1234", "scan_type": "invalid", "user_id": "user-uuid-1"},
        headers=HEADERS,
    )
    assert resp.status_code == 422
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd apps/scanner && pytest tests/test_routes.py -v
```
Expected: `ModuleNotFoundError: No module named 'api.main'`

- [ ] **Step 3: Implement api/middleware/auth.py**

`apps/scanner/api/middleware/auth.py`:
```python
import hmac
from fastapi import Header, HTTPException
from lib.settings import settings


def verify_internal_key(x_internal_key: str = Header(...)) -> None:
    if not hmac.compare_digest(x_internal_key, settings.scanner_internal_key):
        raise HTTPException(status_code=401, detail="Unauthorized")
```

- [ ] **Step 4: Implement api/routes/health.py**

`apps/scanner/api/routes/health.py`:
```python
from fastapi import APIRouter
from lib.settings import settings

router = APIRouter()


@router.get("/health")
def health() -> dict:
    return {"status": "ok", "version": settings.scanner_version}
```

- [ ] **Step 5: Implement api/routes/scans.py**

`apps/scanner/api/routes/scans.py`:
```python
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Literal

from api.middleware.auth import verify_internal_key
from queue.tasks import run_scan

router = APIRouter()


class ScanRequest(BaseModel):
    scan_id: str
    url_id: str
    scan_type: Literal["passive", "active", "deep"]
    user_id: str


@router.post("/api/scans", status_code=202, dependencies=[Depends(verify_internal_key)])
def enqueue_scan(body: ScanRequest) -> dict:
    run_scan.delay(body.scan_id, body.url_id, body.scan_type, body.user_id)
    return {"job_id": body.scan_id}
```

- [ ] **Step 6: Implement api/main.py**

`apps/scanner/api/main.py`:
```python
from fastapi import FastAPI
from api.routes.health import router as health_router
from api.routes.scans import router as scans_router

app = FastAPI(title="Vibe-Check Scanner", version="0.1.0", docs_url=None, redoc_url=None)

app.include_router(health_router)
app.include_router(scans_router)
```

- [ ] **Step 7: Run tests — expect pass**

```bash
cd apps/scanner && pytest tests/test_routes.py -v
```
Expected: all 5 tests `PASSED`

- [ ] **Step 8: Run full test suite**

```bash
cd apps/scanner && pytest -v
```
Expected: all tests `PASSED`

- [ ] **Step 9: Commit**

```bash
git add apps/scanner/api/ apps/scanner/tests/test_routes.py
git commit -m "feat(scanner): FastAPI app — auth middleware, health, scans endpoints"
```

---

## Task 9: Dockerfile + fly.toml

**Files:**
- Create: `apps/scanner/Dockerfile`
- Create: `apps/scanner/fly.toml`
- Create: `apps/scanner/.dockerignore`

- [ ] **Step 1: Create Dockerfile**

`apps/scanner/Dockerfile`:
```dockerfile
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 2: Create .dockerignore**

`apps/scanner/.dockerignore`:
```
__pycache__/
*.pyc
*.pyo
.env
.env.*
tests/
*.md
.git/
```

- [ ] **Step 3: Create fly.toml**

`apps/scanner/fly.toml`:
```toml
app = "vibe-check-scanner"
primary_region = "syd"

[build]

[http_service]
  internal_port = 8000
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 1

[[http_service.checks]]
  grace_period = "10s"
  interval = "15s"
  method = "GET"
  path = "/health"
  timeout = "5s"

[processes]
  web = "uvicorn api.main:app --host 0.0.0.0 --port 8000"
  worker = "celery -A queue.worker worker --loglevel=info --concurrency=2"

[[vm]]
  memory = "512mb"
  cpu_kind = "shared"
  cpus = 1
```

- [ ] **Step 4: Commit**

```bash
git add apps/scanner/Dockerfile apps/scanner/.dockerignore apps/scanner/fly.toml
git commit -m "feat(scanner): Dockerfile and fly.toml for Fly.io deployment"
```

---

## Task 10: Update web app — remove BullMQ, add HTTP scanner calls

**Files:**
- Modify: `apps/web/app/api/scans/route.ts`
- Modify: `apps/web/app/api/webhooks/route.ts`
- Delete: `apps/web/lib/redis/client.ts`
- Modify: `apps/web/package.json`
- Modify: `apps/web/.env.example`

- [ ] **Step 1: Update /api/scans/route.ts**

Replace the entire file content of `apps/web/app/api/scans/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'

const EnqueueSchema = z.object({
  url_id: z.string().uuid(),
  scan_type: z.enum(['passive', 'active', 'deep']),
})

async function dispatchToScanner(payload: {
  scan_id: string
  url_id: string
  scan_type: string
  user_id: string
}): Promise<boolean> {
  try {
    const res = await fetch(`${process.env.SCANNER_API_URL}/api/scans`, {
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

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parsed = EnqueueSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { url_id, scan_type } = parsed.data

  const { data: url } = await supabase
    .from('urls')
    .select('id, verified')
    .eq('id', url_id)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single()

  if (!url) {
    return NextResponse.json({ error: 'URL not found' }, { status: 404 })
  }

  if (!url.verified) {
    return NextResponse.json({ error: 'URL not verified' }, { status: 403 })
  }

  const { data: activeScan } = await supabase
    .from('scans')
    .select('id')
    .eq('url_id', url_id)
    .in('status', ['pending', 'running'])
    .maybeSingle()

  if (activeScan) {
    return NextResponse.json({ error: 'Scan already in progress' }, { status: 409 })
  }

  const { data: scan, error: insertError } = await supabase
    .from('scans')
    .insert({
      url_id,
      user_id: user.id,
      scan_type,
      status: 'pending',
      triggered_by: 'manual',
    })
    .select('id')
    .single()

  if (insertError || !scan) {
    return NextResponse.json({ error: 'Failed to create scan' }, { status: 500 })
  }

  const dispatched = await dispatchToScanner({
    scan_id: scan.id,
    url_id,
    scan_type,
    user_id: user.id,
  })

  if (!dispatched) {
    await supabase.from('scans').delete().eq('id', scan.id)
    return NextResponse.json({ error: 'Scanner service unavailable' }, { status: 502 })
  }

  return NextResponse.json({ scan_id: scan.id }, { status: 202 })
}

export async function GET(request: Request) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const scanId = searchParams.get('id')

  if (!scanId) {
    return NextResponse.json({ error: 'Missing scan id' }, { status: 400 })
  }

  const { data: scan } = await supabase
    .from('scans')
    .select('id, status, grade, score, completed_at')
    .eq('id', scanId)
    .eq('user_id', user.id)
    .single()

  if (!scan) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json(scan)
}
```

- [ ] **Step 2: Update /api/webhooks/route.ts — replace scanQueue.add with fetch**

Read the current file first, then find and replace only the BullMQ import and usage:

Remove this import from the top of `apps/web/app/api/webhooks/route.ts`:
```typescript
import { scanQueue } from '@/lib/redis/client'
```

Replace the `scanQueue.add(...)` call (around line 72) with:
```typescript
await fetch(`${process.env.SCANNER_API_URL}/api/scans`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Internal-Key': process.env.SCANNER_INTERNAL_KEY ?? '',
  },
  body: JSON.stringify({
    scan_id: scan.id,
    url_id: url.id,
    scan_type: 'active',
    user_id: apiKey.user_id,
  }),
})
```

- [ ] **Step 3: Delete lib/redis/client.ts**

```bash
rm apps/web/lib/redis/client.ts
```

- [ ] **Step 4: Remove bullmq and ioredis from package.json**

In `apps/web/package.json`, remove these two lines from `"dependencies"`:
```json
"bullmq": "^5.0.0",
"ioredis": "^5.3.0",
```

- [ ] **Step 5: Install updated dependencies**

```bash
cd apps/web && npm install
```

- [ ] **Step 6: Update .env.example**

In `apps/web/.env.example`, add these two lines and remove `REDIS_URL`:
```bash
SCANNER_API_URL=https://your-scanner.fly.dev   # URL of the deployed scanner service
SCANNER_INTERNAL_KEY=                           # Shared secret — must match scanner's SCANNER_INTERNAL_KEY
```

Remove:
```bash
REDIS_URL=
```

- [ ] **Step 7: Type-check**

```bash
cd apps/web && npm run type-check
```
Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/api/scans/route.ts apps/web/app/api/webhooks/route.ts
git add apps/web/package.json apps/web/package-lock.json apps/web/.env.example
git rm apps/web/lib/redis/client.ts
git commit -m "feat(web): replace BullMQ queue with HTTP POST to scanner service"
```

---

## Task 11: Full test run + verify build

- [ ] **Step 1: Run all scanner tests**

```bash
cd apps/scanner && pytest -v
```
Expected: all tests `PASSED`, 0 failures

- [ ] **Step 2: Run web app type-check**

```bash
cd apps/web && npm run type-check
```
Expected: no TypeScript errors

- [ ] **Step 3: Verify web app builds**

```bash
cd apps/web && npm run build
```
Expected: build completes successfully

- [ ] **Step 4: Final commit if any last fixes needed**

```bash
git add -A
git commit -m "chore: scanner service Step 1 complete — passive scans, FastAPI, Celery"
```
