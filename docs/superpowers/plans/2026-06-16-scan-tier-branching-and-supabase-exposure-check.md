# Scan-Tier Branching + Supabase Exposure Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `scan_type` (`passive`/`active`/`deep`) actually change which scanners run, and add a new active-tier scanner that detects publicly-readable Supabase tables (missing RLS) via the target's own public anon key.

**Architecture:** A new `lib/js_extraction.py` utility fetches a page's HTML plus its `<script src>` bundles. A new `scanners/supabase_exposure.py` `SupabaseExposureScanner` uses that utility to find a Supabase project URL + anon key, queries the PostgREST root schema to discover table names, then probes each table for publicly-readable rows. `jobs/tasks.py` is changed to pick a scanner list per `scan_type` instead of always running the same two scanners.

**Tech Stack:** Python 3.12, `httpx` (HTTP client), `respx` (HTTP mocking in tests, already a dev dependency — used in `tests/test_headers.py`), `pytest`, existing `BaseScanner`/`Finding` interfaces from `scanners/base.py`.

**Spec:** `docs/superpowers/specs/2026-06-16-scan-tier-branching-and-supabase-exposure-check-design.md`

---

### Task 1: Shared JS-bundle fetch utility

**Files:**
- Create: `apps/scanner/lib/js_extraction.py`
- Test: `apps/scanner/tests/test_js_extraction.py`

- [ ] **Step 1: Write the failing tests**

```python
# apps/scanner/tests/test_js_extraction.py
import httpx
import respx
from lib.js_extraction import fetch_page_and_scripts

BASE_URL = "https://example.com"


def test_fetches_page_and_script_bodies():
    html = '<html><head><script src="/static/app.js"></script></head></html>'
    with respx.mock:
        respx.get(BASE_URL).mock(return_value=httpx.Response(200, text=html))
        respx.get("https://example.com/static/app.js").mock(
            return_value=httpx.Response(200, text="const x = 1;")
        )
        blobs = fetch_page_and_scripts(BASE_URL, timeout=5)

    assert any("script" in b for b in blobs)
    assert any("const x = 1;" in b for b in blobs)


def test_resolves_absolute_script_url():
    html = '<html><script src="https://cdn.example.com/bundle.js"></script></html>'
    with respx.mock:
        respx.get(BASE_URL).mock(return_value=httpx.Response(200, text=html))
        respx.get("https://cdn.example.com/bundle.js").mock(
            return_value=httpx.Response(200, text="ABSOLUTE_MARKER")
        )
        blobs = fetch_page_and_scripts(BASE_URL, timeout=5)

    assert any("ABSOLUTE_MARKER" in b for b in blobs)


def test_failed_script_fetch_does_not_abort():
    html = (
        '<html><script src="/broken.js"></script>'
        '<script src="/ok.js"></script></html>'
    )
    with respx.mock:
        respx.get(BASE_URL).mock(return_value=httpx.Response(200, text=html))
        respx.get("https://example.com/broken.js").mock(side_effect=httpx.ConnectError("refused"))
        respx.get("https://example.com/ok.js").mock(return_value=httpx.Response(200, text="OK_MARKER"))
        blobs = fetch_page_and_scripts(BASE_URL, timeout=5)

    assert any("OK_MARKER" in b for b in blobs)


def test_page_fetch_failure_returns_empty_list():
    with respx.mock:
        respx.get(BASE_URL).mock(side_effect=httpx.ConnectError("refused"))
        blobs = fetch_page_and_scripts(BASE_URL, timeout=5)

    assert blobs == []


def test_respects_max_scripts_cap():
    scripts_html = "".join(f'<script src="/s{i}.js"></script>' for i in range(15))
    html = f"<html>{scripts_html}</html>"
    with respx.mock:
        respx.get(BASE_URL).mock(return_value=httpx.Response(200, text=html))
        for i in range(15):
            respx.get(f"https://example.com/s{i}.js").mock(
                return_value=httpx.Response(200, text=f"MARKER_{i}")
            )
        blobs = fetch_page_and_scripts(BASE_URL, timeout=5, max_scripts=10)

    marker_count = sum(1 for b in blobs if b.startswith("MARKER_"))
    assert marker_count == 10
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `apps/scanner/`): `pytest tests/test_js_extraction.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'lib.js_extraction'`

- [ ] **Step 3: Implement `lib/js_extraction.py`**

```python
# apps/scanner/lib/js_extraction.py
import re
from urllib.parse import urljoin

import httpx

_SCRIPT_SRC_RE = re.compile(r'<script[^>]+src=["\']([^"\']+)["\']', re.IGNORECASE)


def fetch_page_and_scripts(
    url: str,
    timeout: float,
    max_scripts: int = 10,
    max_bytes: int = 500_000,
) -> list[str]:
    """Fetch the page HTML plus same-origin <script src> bundles.

    Best-effort: any individual request failure is swallowed, not fatal —
    callers get whatever text was successfully retrieved. Used by scanners
    that need to find values embedded in client-side JS (e.g. Supabase
    project URLs/keys).
    """
    blobs: list[str] = []

    try:
        page = httpx.get(url, timeout=timeout, follow_redirects=True)
    except httpx.RequestError:
        return blobs

    html = page.text
    blobs.append(html)

    script_srcs = _SCRIPT_SRC_RE.findall(html)[:max_scripts]

    for src in script_srcs:
        script_url = urljoin(str(page.url), src)
        try:
            response = httpx.get(script_url, timeout=timeout)
        except httpx.RequestError:
            continue
        if response.status_code != 200:
            continue
        blobs.append(response.text[:max_bytes])

    return blobs
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_js_extraction.py -v`
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add apps/scanner/lib/js_extraction.py apps/scanner/tests/test_js_extraction.py
git commit -m "feat(scanner): add shared JS-bundle fetch utility"
```

---

### Task 2: Supabase/PostgREST exposure scanner

**Files:**
- Create: `apps/scanner/scanners/supabase_exposure.py`
- Test: `apps/scanner/tests/test_supabase_exposure.py`

- [ ] **Step 1: Write the failing tests**

```python
# apps/scanner/tests/test_supabase_exposure.py
import httpx
import respx
from scanners.supabase_exposure import SupabaseExposureScanner

BASE_URL = "https://example.com"
SUPABASE_URL = "https://abcdefghijklmno.supabase.co"
ANON_KEY = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.abc123signature"

PAGE_HTML = '<html><script src="/app.js"></script></html>'
APP_JS = (
    f'window.__SUPABASE_URL__="{SUPABASE_URL}";'
    f'window.__SUPABASE_ANON_KEY__="{ANON_KEY}";'
)

OPENAPI_DOC = {
    "paths": {
        "/profiles": {},
        "/scans": {},
    }
}


def _mock_page_and_script():
    respx.get(BASE_URL).mock(return_value=httpx.Response(200, text=PAGE_HTML))
    respx.get(f"{BASE_URL}/app.js").mock(return_value=httpx.Response(200, text=APP_JS))


def test_no_credentials_found_returns_no_findings():
    with respx.mock:
        respx.get(BASE_URL).mock(return_value=httpx.Response(200, text="<html>no keys here</html>"))
        findings = SupabaseExposureScanner(BASE_URL).run()
    assert findings == []


def test_credentials_found_all_tables_protected_returns_pass():
    with respx.mock:
        _mock_page_and_script()
        respx.get(f"{SUPABASE_URL}/rest/v1/").mock(return_value=httpx.Response(200, json=OPENAPI_DOC))
        respx.get(f"{SUPABASE_URL}/rest/v1/profiles").mock(return_value=httpx.Response(200, json=[]))
        respx.get(f"{SUPABASE_URL}/rest/v1/scans").mock(return_value=httpx.Response(200, json=[]))
        findings = SupabaseExposureScanner(BASE_URL).run()

    assert len(findings) == 1
    assert findings[0].severity == "pass"


def test_exposed_table_returns_critical_without_row_contents():
    with respx.mock:
        _mock_page_and_script()
        respx.get(f"{SUPABASE_URL}/rest/v1/").mock(return_value=httpx.Response(200, json=OPENAPI_DOC))
        respx.get(f"{SUPABASE_URL}/rest/v1/profiles").mock(
            return_value=httpx.Response(200, json=[{"id": 1, "email": "victim@example.com"}])
        )
        respx.get(f"{SUPABASE_URL}/rest/v1/scans").mock(return_value=httpx.Response(200, json=[]))
        findings = SupabaseExposureScanner(BASE_URL).run()

    assert len(findings) == 1
    assert findings[0].severity == "critical"
    assert "profiles" in findings[0].title
    assert "victim@example.com" not in findings[0].description
    assert "victim@example.com" not in findings[0].what_we_did


def test_root_schema_request_fails_returns_no_findings():
    with respx.mock:
        _mock_page_and_script()
        respx.get(f"{SUPABASE_URL}/rest/v1/").mock(side_effect=httpx.ConnectError("refused"))
        findings = SupabaseExposureScanner(BASE_URL).run()
    assert findings == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_supabase_exposure.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'scanners.supabase_exposure'`

- [ ] **Step 3: Implement `scanners/supabase_exposure.py`**

```python
# apps/scanner/scanners/supabase_exposure.py
import re

import httpx

from lib.js_extraction import fetch_page_and_scripts
from scanners.base import BaseScanner, Finding

_SUPABASE_URL_RE = re.compile(r"https://[a-z0-9]+\.supabase\.co")
_JWT_RE = re.compile(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+")
_MAX_TABLES = 50


def _extract_supabase_credentials(blobs: list[str]) -> tuple[str, str] | None:
    url: str | None = None
    key: str | None = None
    for blob in blobs:
        if url is None:
            match = _SUPABASE_URL_RE.search(blob)
            if match:
                url = match.group(0)
        if key is None:
            match = _JWT_RE.search(blob)
            if match:
                key = match.group(0)
        if url and key:
            return url, key
    return None


class SupabaseExposureScanner(BaseScanner):
    def run(self) -> list[Finding]:
        blobs = fetch_page_and_scripts(self.url, self.timeout)
        creds = _extract_supabase_credentials(blobs)
        if not creds:
            return []

        supabase_url, anon_key = creds
        tables = self._discover_tables(supabase_url, anon_key)
        return self._probe_tables(supabase_url, anon_key, tables)

    def _discover_tables(self, supabase_url: str, anon_key: str) -> list[str]:
        headers = {"apikey": anon_key, "Authorization": f"Bearer {anon_key}"}
        try:
            response = httpx.get(f"{supabase_url}/rest/v1/", headers=headers, timeout=self.timeout)
        except httpx.RequestError:
            return []
        if response.status_code != 200:
            return []
        try:
            paths = response.json().get("paths", {})
        except ValueError:
            return []
        tables = [p.lstrip("/") for p in paths if p not in ("/", "")]
        return tables[:_MAX_TABLES]

    def _probe_tables(self, supabase_url: str, anon_key: str, tables: list[str]) -> list[Finding]:
        headers = {"apikey": anon_key, "Authorization": f"Bearer {anon_key}"}
        exposed: list[tuple[str, int]] = []

        for table in tables:
            try:
                response = httpx.get(
                    f"{supabase_url}/rest/v1/{table}",
                    params={"select": "*", "limit": 1},
                    headers=headers,
                    timeout=self.timeout,
                )
            except httpx.RequestError:
                continue
            if response.status_code != 200:
                continue
            try:
                rows = response.json()
            except ValueError:
                continue
            if isinstance(rows, list) and len(rows) > 0:
                exposed.append((table, len(rows)))

        if exposed:
            return [
                Finding(
                    check_name="supabase-rls-exposure",
                    severity="critical",
                    category="endpoints",
                    title=f"Supabase table '{table}' publicly readable without RLS",
                    description=(
                        f"The table '{table}' returned {count} row(s) when queried with "
                        "the site's own public anon key, with no authentication beyond "
                        "that key. This usually means Row Level Security is not enabled "
                        "or not enforced on this table."
                    ),
                    what_we_did=(
                        "Discovered the Supabase project URL and anon key referenced in "
                        f"the site's JavaScript, then queried GET {supabase_url}/rest/v1/"
                        f"{table}?select=*&limit=1 using that key."
                    ),
                    remediation=(
                        f"Enable Row Level Security on the '{table}' table and add "
                        f"policies that scope reads to the owning user: "
                        f"alter table {table} enable row level security;"
                    ),
                )
                for table, count in exposed
            ]

        if tables:
            return [Finding(
                check_name="supabase-rls-exposure",
                severity="pass",
                category="endpoints",
                title="Supabase tables found, none publicly readable",
                description=(
                    f"Found {len(tables)} table(s) exposed via the Supabase REST API; "
                    "none returned data when queried with the public anon key."
                ),
                what_we_did="Queried each discovered table with the site's public anon key and checked for returned rows.",
                remediation="",
            )]

        return []
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_supabase_exposure.py -v`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add apps/scanner/scanners/supabase_exposure.py apps/scanner/tests/test_supabase_exposure.py
git commit -m "feat(scanner): add Supabase/PostgREST RLS exposure check"
```

---

### Task 3: Wire scan-tier branching into the task runner

**Files:**
- Modify: `apps/scanner/jobs/tasks.py`
- Modify: `apps/scanner/tests/test_tasks.py`

- [ ] **Step 1: Write the failing tests**

Add these three tests to `apps/scanner/tests/test_tasks.py` (append at the end of the file, after the existing `test_run_scan_marks_failed_on_unexpected_error`):

```python
def test_passive_scan_does_not_run_supabase_exposure_scanner(mock_sb, mock_consent_ok):
    with patch("jobs.tasks.HeadersScanner") as mh, \
         patch("jobs.tasks.TLSScanner") as mt, \
         patch("jobs.tasks.SupabaseExposureScanner") as ms:
        mh.return_value.run.return_value = []
        mt.return_value.run.return_value = []
        from jobs.tasks import _execute_scan
        _execute_scan(FakeSelf(), "scan-1", "url-1", "passive", "user-1")

    ms.assert_not_called()


def test_active_scan_runs_supabase_exposure_scanner(mock_sb, mock_consent_ok):
    with patch("jobs.tasks.HeadersScanner") as mh, \
         patch("jobs.tasks.TLSScanner") as mt, \
         patch("jobs.tasks.SupabaseExposureScanner") as ms:
        mh.return_value.run.return_value = []
        mt.return_value.run.return_value = []
        ms.return_value.run.return_value = []
        from jobs.tasks import _execute_scan
        _execute_scan(FakeSelf(), "scan-1", "url-1", "active", "user-1")

    ms.assert_called_once_with("https://example.com")


def test_deep_scan_runs_supabase_exposure_scanner(mock_sb, mock_consent_ok):
    with patch("jobs.tasks.HeadersScanner") as mh, \
         patch("jobs.tasks.TLSScanner") as mt, \
         patch("jobs.tasks.SupabaseExposureScanner") as ms:
        mh.return_value.run.return_value = []
        mt.return_value.run.return_value = []
        ms.return_value.run.return_value = []
        from jobs.tasks import _execute_scan
        _execute_scan(FakeSelf(), "scan-1", "url-1", "deep", "user-1")

    ms.assert_called_once_with("https://example.com")
```

`mock_consent_ok` (already defined in this file) makes `consent.verify` return `"https://example.com"`, which is why the assertions check `assert_called_once_with("https://example.com")`.

- [ ] **Step 2: Run tests to verify they fail**

Run (from `apps/scanner/`): `pytest tests/test_tasks.py -v`
Expected: the 3 new tests FAIL — `test_passive_scan_does_not_run_supabase_exposure_scanner` fails because `patch("jobs.tasks.SupabaseExposureScanner")` raises `AttributeError: <module 'jobs.tasks'> does not have the attribute 'SupabaseExposureScanner'`; the other two fail the same way. Existing tests still pass.

- [ ] **Step 3: Modify `jobs/tasks.py`**

Change the imports at the top of `apps/scanner/jobs/tasks.py`:

```python
from datetime import datetime, timezone

from lib import consent
from lib.settings import settings
from lib.supabase import get_supabase
from reports.grader import grade
from scanners.headers import HeadersScanner
from scanners.tls import TLSScanner
from scanners.supabase_exposure import SupabaseExposureScanner
from jobs.config import celery_app
```

Add this function after `_mark_scan` and before `_execute_scan`:

```python
def _scanners_for_tier(scan_type: str) -> list:
    """Cumulative tiers: active runs everything passive runs, plus more;
    deep runs everything active runs, plus more (currently identical to
    active — this is the seam for future intrusive scanners)."""
    tiers = {
        "passive": [HeadersScanner, TLSScanner],
        "active": [HeadersScanner, TLSScanner, SupabaseExposureScanner],
        "deep": [HeadersScanner, TLSScanner, SupabaseExposureScanner],
    }
    return tiers.get(scan_type, tiers["passive"])
```

Note: this is a function, not a module-level constant — the scanner classes (`HeadersScanner`, etc.) must be looked up from `jobs.tasks`'s module globals *at call time* so that `unittest.mock.patch("jobs.tasks.HeadersScanner")` in tests actually takes effect. A module-level dict built once at import time would capture the original (unpatched) classes and silently ignore test patches.

Replace the findings-building lines inside `_execute_scan`:

```python
        findings = [
            *HeadersScanner(url).run(),
            *TLSScanner(url).run(),
        ]
```

with:

```python
        findings = [
            f
            for scanner_cls in _scanners_for_tier(scan_type)
            for f in scanner_cls(url).run()
        ]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_tasks.py -v`
Expected: all tests pass (existing 5 + new 3 = 8 passed)

Then run the full scanner test suite to confirm nothing else broke:

Run: `pytest -v`
Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add apps/scanner/jobs/tasks.py apps/scanner/tests/test_tasks.py
git commit -m "feat(scanner): branch scanner selection on scan_type tier"
```

---

### Task 4: Update PROJECT_STATUS.md

**Files:**
- Modify: `PROJECT_STATUS.md`

- [ ] **Step 1: Update the scanner table and known-issues section**

In the `## Scanner Service (apps/scanner/)` table, add two rows after the existing `TLSScanner` row:

```markdown
| `SupabaseExposureScanner` | ✅ | Detects Supabase tables readable via the site's own public anon key (missing RLS) — the CVE-2025-48757 pattern. Runs on `active`/`deep` tiers only. |
| Scan-tier branching | ✅ | `jobs/tasks.py::_scanners_for_tier()` — `passive` = headers+TLS, `active`/`deep` = passive + Supabase exposure check. `deep` has no additional scanners yet. |
```

In the `## Known Issues / Gaps` table, update the row added previously for this work:

Find this line:
```markdown
| Admin unlimited-scan bypass | ✅ Confirmed secure | `can_run_scan_type()`/`can_add_url()` (migration 014) already bypass for `is_admin = true` at the RLS layer — verified end-to-end by inserting a `deep` scan as the admin account on the `free` plan. Closed a related hole in migration 017: the `profiles` "update own row" RLS policy had no column restriction, so any user could have PATCHed their own `is_admin`/`plan`/`stripe_*` fields directly. Now blocked by a `BEFORE UPDATE` trigger unless `auth.role() = 'service_role'`. |
```

Replace the row immediately below it:
```markdown
| No Supabase/PostgREST exposed-data check | High | No check for publicly readable `/rest/v1/*` endpoints on apps without RLS (the CVE-2025-48757 Lovable pattern). High-relevance gap for our Supabase-using target audience. Source: r/ChatGPTCoding post review, 2026-06-16. |
```

with:
```markdown
| Supabase/PostgREST exposed-data check | ✅ Built | `scanners/supabase_exposure.py` — runs on `active`/`deep` scan tiers. `scan_type` previously did nothing; now `jobs/tasks.py` branches scanner selection by tier. |
```

- [ ] **Step 2: Commit**

```bash
git add PROJECT_STATUS.md
git commit -m "docs: update PROJECT_STATUS for scan-tier branching and Supabase exposure check"
```

---

## Verification (after all tasks complete)

1. Run the full scanner test suite once more from `apps/scanner/`: `pytest -v` — confirm all tests pass, including the 5 from Task 1, 4 from Task 2, and 8 from Task 3 (12 new tests total).
2. Manually sanity-check tier behavior against a real-ish Supabase app if one is available: trigger a `passive` scan and confirm no outbound requests to any `*.supabase.co` host occur (e.g. by eyeballing scanner logs), then trigger an `active` scan against the same URL and confirm the Supabase exposure check runs (look for a `supabase-rls-exposure` finding, pass or critical, in the `findings` table for that scan).
3. Confirm no finding ever contains row contents: grep any inserted `findings` rows with `check_name = 'supabase-rls-exposure'` and visually confirm `description`/`what_we_did` only reference table names and counts, never field values.
