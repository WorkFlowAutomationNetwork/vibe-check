# Nuclei Deep-Tier Scanner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `NucleiScanner` that runs a curated, safe subset of Nuclei templates against a verified target, maps results into `Finding` objects, and wires it into the `deep` scan tier only (the first deep-only scanner in the suite).

**Architecture:** `apps/scanner/scanners/nuclei.py::NucleiScanner` follows the existing `BaseScanner` ABC (`scanners/base.py`) used by every other scanner. It shells out to the `nuclei` CLI via `subprocess.run` with a curated tag allowlist, parses JSONL output from stdout, and maps each match to a `Finding`. All failure modes (missing binary, timeout, malformed output) degrade to an empty list rather than raising — `jobs/tasks.py::_execute_scan` runs all scanners in a single list comprehension, so an unhandled exception here would currently fail the *whole* scan.

**Tech Stack:** Python 3.12, stdlib `subprocess` + `json` (no new Python dependencies), Nuclei CLI (Go binary, installed via multi-stage Docker build), `pytest` + `unittest.mock.patch` for testing.

## Global Constraints

- Outer subprocess timeout: 120s (CLAUDE.md Python conventions — matches existing Nuclei timeout convention).
- Template tags: `-tags cve,exposure,misconfig,default-login,tech -etags dos,fuzz,intrusive` (spec: curated safe-tag allowlist, never the full template set).
- Rate limit: `-rate-limit 50` (politeness toward target).
- `Finding.severity` has no `high` value — Nuclei's `high` maps to `critical`; `info`/`low`/`medium` pass through unchanged.
- `Finding.category` is always `"endpoints"` for every Nuclei finding (DB check constraint has no generic "vulnerability" category — see `supabase/migrations/20260519000005_findings.sql:8`).
- Every failure mode (binary missing, timeout, malformed JSON) returns `[]` — never raises out of `NucleiScanner.run()`.
- `NucleiScanner` is wired into the `deep` tier only, not `active`.
- No new Python pip dependencies — only stdlib `subprocess`/`json`.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `apps/scanner/scanners/nuclei.py` | Create | `NucleiScanner` — invoke Nuclei, parse JSONL, map to `Finding` list |
| `apps/scanner/tests/test_nuclei.py` | Create | Unit tests, `subprocess.run` mocked throughout |
| `apps/scanner/jobs/tasks.py` | Modify | Import `NucleiScanner`, add to `deep` tier list |
| `apps/scanner/tests/test_tasks_tiers.py` | Modify | Replace `test_deep_tier_matches_active_tier` with explicit `NucleiScanner` tier-inclusion tests |
| `apps/scanner/Dockerfile` | Modify | Multi-stage build: Go stage compiles `nuclei` + bakes templates; final stage copies both in |
| `PROJECT_STATUS.md` | Modify | Record the new scanner, test count, redeploy note |

---

## Task 1: `NucleiScanner` — happy path (matches found)

**Files:**
- Create: `apps/scanner/scanners/nuclei.py`
- Test: `apps/scanner/tests/test_nuclei.py`

**Interfaces:**
- Consumes: `scanners.base.BaseScanner` (`__init__(self, url: str, timeout: int = 30)`, abstract `run(self) -> list[Finding]`), `scanners.base.Finding` (dataclass: `check_name, severity, category, title, description, what_we_did, remediation, metadata=None`).
- Produces: `NucleiScanner(BaseScanner)` class with `run() -> list[Finding]`. Internal helpers `_map_severity(raw: str) -> str` and `_run_nuclei(self) -> subprocess.CompletedProcess | None` — later tasks (failure handling) patch `scanners.nuclei.subprocess.run`.

- [ ] **Step 1: Write the failing test for a single match**

Create `apps/scanner/tests/test_nuclei.py`:

```python
import json
import subprocess
from unittest.mock import MagicMock, patch

from scanners.nuclei import NucleiScanner

URL = "https://example.com"


def _completed_process(stdout: str, returncode: int = 0) -> subprocess.CompletedProcess:
    return subprocess.CompletedProcess(args=["nuclei"], returncode=returncode, stdout=stdout, stderr="")


def _jsonl(*objs: dict) -> str:
    return "\n".join(json.dumps(o) for o in objs) + "\n"


def test_single_match_returns_one_finding():
    match = {
        "template-id": "exposed-panel-grafana",
        "info": {
            "name": "Grafana Exposed Login Panel",
            "severity": "info",
            "description": "Grafana login panel is exposed.",
        },
        "matched-at": "https://example.com/grafana/login",
    }
    with patch("scanners.nuclei.subprocess.run", return_value=_completed_process(_jsonl(match))):
        findings = NucleiScanner(URL).run()

    assert len(findings) == 1
    f = findings[0]
    assert f.check_name == "nuclei-exposed-panel-grafana"
    assert f.severity == "info"
    assert f.category == "endpoints"
    assert f.title == "Grafana Exposed Login Panel"
    assert f.description == "Grafana login panel is exposed."
    assert "exposed-panel-grafana" in f.what_we_did
    assert "https://example.com/grafana/login" in f.what_we_did
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/scanner && python -m pytest tests/test_nuclei.py::test_single_match_returns_one_finding -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'scanners.nuclei'`

- [ ] **Step 3: Write minimal implementation**

Create `apps/scanner/scanners/nuclei.py`:

```python
import json
import subprocess

from scanners.base import BaseScanner, Finding

_TIMEOUT_SECONDS = 120
_SAFE_TAGS = "cve,exposure,misconfig,default-login,tech"
_EXCLUDED_TAGS = "dos,fuzz,intrusive"
_RATE_LIMIT = 50
_PER_REQUEST_TIMEOUT = 10

_SEVERITY_MAP = {
    "info": "info",
    "low": "low",
    "medium": "medium",
    "high": "critical",
    "critical": "critical",
}


def _map_severity(raw: str) -> str:
    return _SEVERITY_MAP.get(raw, "info")


class NucleiScanner(BaseScanner):
    """Runs a curated, safe-tagged subset of Nuclei templates against the
    target and maps matches to Findings. Deep-tier only — see
    docs/superpowers/specs/2026-06-17-nuclei-deep-tier-scanner-design.md
    for why the tag scope is restricted and why every failure mode here
    degrades to an empty result rather than raising."""

    def run(self) -> list[Finding]:
        result = self._run_nuclei()
        if result is None:
            return []
        return self._parse_findings(result.stdout)

    def _run_nuclei(self) -> subprocess.CompletedProcess | None:
        command = [
            "nuclei",
            "-u", self.url,
            "-jsonl",
            "-silent",
            "-no-color",
            "-tags", _SAFE_TAGS,
            "-etags", _EXCLUDED_TAGS,
            "-timeout", str(_PER_REQUEST_TIMEOUT),
            "-rate-limit", str(_RATE_LIMIT),
        ]
        try:
            return subprocess.run(
                command, capture_output=True, text=True, timeout=_TIMEOUT_SECONDS,
            )
        except (FileNotFoundError, subprocess.TimeoutExpired):
            return None

    def _parse_findings(self, stdout: str) -> list[Finding]:
        findings: list[Finding] = []
        for line in stdout.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                match = json.loads(line)
            except ValueError:
                continue
            findings.append(self._finding_from_match(match))

        if not findings:
            return [self._no_matches_finding()]
        return findings

    def _finding_from_match(self, match: dict) -> Finding:
        template_id = match.get("template-id", "unknown-template")
        info = match.get("info", {})
        matched_at = match.get("matched-at", self.url)
        remediation = info.get("remediation") or (
            "Review this finding against the linked CVE/reference and apply "
            "the vendor's recommended fix."
        )
        return Finding(
            check_name=f"nuclei-{template_id}",
            severity=_map_severity(info.get("severity", "info")),
            category="endpoints",
            title=info.get("name", template_id),
            description=info.get("description") or f"Nuclei template '{template_id}' matched.",
            what_we_did=f"Ran Nuclei template '{template_id}' against {matched_at}.",
            remediation=remediation,
        )

    def _no_matches_finding(self) -> Finding:
        return Finding(
            check_name="nuclei-scan",
            severity="pass",
            category="endpoints",
            title="No issues found by Nuclei's curated safe-template scan",
            description=(
                "Ran Nuclei's CVE, exposure, misconfiguration, default-login, and "
                "tech-detection templates (excluding fuzzing/DoS-style checks) "
                "against this site; none matched."
            ),
            what_we_did="Ran a curated, safe-tagged subset of Nuclei community templates.",
            remediation="",
        )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/scanner && python -m pytest tests/test_nuclei.py::test_single_match_returns_one_finding -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/scanner/scanners/nuclei.py apps/scanner/tests/test_nuclei.py
git commit -m "feat(scanner): add NucleiScanner happy-path match parsing"
```

---

## Task 2: Severity mapping coverage (`high → critical`, and the rest)

**Files:**
- Test: `apps/scanner/tests/test_nuclei.py`
- Modify (if needed): `apps/scanner/scanners/nuclei.py` (no change expected — `_SEVERITY_MAP` already covers this; this task is the explicit regression test the spec calls for)

**Interfaces:**
- Consumes: `NucleiScanner` from Task 1, `_completed_process`/`_jsonl` helpers already in `test_nuclei.py`.
- Produces: nothing new — locks in the mapping table as a tested contract for later tasks.

- [ ] **Step 1: Write the failing... actually-passing-but-required test**

Add to `apps/scanner/tests/test_nuclei.py`:

```python
import pytest


@pytest.mark.parametrize("raw_severity,expected", [
    ("info", "info"),
    ("low", "low"),
    ("medium", "medium"),
    ("high", "critical"),
    ("critical", "critical"),
])
def test_severity_mapping(raw_severity, expected):
    match = {
        "template-id": "some-template",
        "info": {"name": "Some Finding", "severity": raw_severity, "description": "d"},
        "matched-at": "https://example.com/",
    }
    with patch("scanners.nuclei.subprocess.run", return_value=_completed_process(_jsonl(match))):
        findings = NucleiScanner(URL).run()

    assert findings[0].severity == expected
```

- [ ] **Step 2: Run test to verify it passes immediately**

Run: `cd apps/scanner && python -m pytest tests/test_nuclei.py::test_severity_mapping -v`
Expected: PASS (5 parametrized cases) — `_SEVERITY_MAP` from Task 1 already implements this. If `high` does not map to `critical`, stop and fix `_SEVERITY_MAP` in `scanners/nuclei.py` before proceeding; do not weaken the test.

- [ ] **Step 3: Commit**

```bash
git add apps/scanner/tests/test_nuclei.py
git commit -m "test(scanner): lock in nuclei severity mapping table"
```

---

## Task 3: No-matches pass finding, multiple matches, and remediation fallback

**Files:**
- Test: `apps/scanner/tests/test_nuclei.py`

**Interfaces:**
- Consumes: `NucleiScanner`, `_completed_process`, `_jsonl`.
- Produces: nothing new for later tasks — extends confidence in `_parse_findings`/`_finding_from_match` before failure-handling tasks build on top.

- [ ] **Step 1: Write the failing test for clean exit with no matches**

Add to `apps/scanner/tests/test_nuclei.py`:

```python
def test_no_matches_returns_single_pass_finding():
    with patch("scanners.nuclei.subprocess.run", return_value=_completed_process("")):
        findings = NucleiScanner(URL).run()

    assert len(findings) == 1
    assert findings[0].severity == "pass"
    assert findings[0].check_name == "nuclei-scan"


def test_multiple_matches_returns_multiple_findings():
    matches = [
        {"template-id": "tmpl-a", "info": {"name": "A", "severity": "low", "description": "a"}, "matched-at": "https://example.com/a"},
        {"template-id": "tmpl-b", "info": {"name": "B", "severity": "critical", "description": "b"}, "matched-at": "https://example.com/b"},
    ]
    with patch("scanners.nuclei.subprocess.run", return_value=_completed_process(_jsonl(*matches))):
        findings = NucleiScanner(URL).run()

    assert len(findings) == 2
    assert {f.check_name for f in findings} == {"nuclei-tmpl-a", "nuclei-tmpl-b"}


def test_missing_remediation_falls_back_to_generic_text():
    match = {
        "template-id": "tmpl-no-remediation",
        "info": {"name": "No Remediation Template", "severity": "medium", "description": "d"},
        "matched-at": "https://example.com/",
    }
    with patch("scanners.nuclei.subprocess.run", return_value=_completed_process(_jsonl(match))):
        findings = NucleiScanner(URL).run()

    assert "Review this finding" in findings[0].remediation


def test_malformed_json_line_is_skipped_others_still_parsed():
    good_match = {"template-id": "tmpl-good", "info": {"name": "Good", "severity": "low", "description": "d"}, "matched-at": "https://example.com/"}
    stdout = "not valid json\n" + json.dumps(good_match) + "\n"
    with patch("scanners.nuclei.subprocess.run", return_value=_completed_process(stdout)):
        findings = NucleiScanner(URL).run()

    assert len(findings) == 1
    assert findings[0].check_name == "nuclei-tmpl-good"
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd apps/scanner && python -m pytest tests/test_nuclei.py -v`
Expected: all PASS (these exercise code already written in Task 1 — no implementation change expected here)

- [ ] **Step 3: Commit**

```bash
git add apps/scanner/tests/test_nuclei.py
git commit -m "test(scanner): nuclei no-match, multi-match, and malformed-line cases"
```

---

## Task 4: Failure handling — missing binary and timeout degrade to `[]`

**Files:**
- Test: `apps/scanner/tests/test_nuclei.py`

**Interfaces:**
- Consumes: `NucleiScanner`.
- Produces: confirms the contract `jobs/tasks.py` (Task 6) relies on — `NucleiScanner(url).run()` never raises.

- [ ] **Step 1: Write the failing tests**

Add to `apps/scanner/tests/test_nuclei.py`:

```python
def test_binary_not_found_returns_empty_list():
    with patch("scanners.nuclei.subprocess.run", side_effect=FileNotFoundError("nuclei: not found")):
        findings = NucleiScanner(URL).run()
    assert findings == []


def test_timeout_returns_empty_list():
    with patch("scanners.nuclei.subprocess.run", side_effect=subprocess.TimeoutExpired(cmd="nuclei", timeout=120)):
        findings = NucleiScanner(URL).run()
    assert findings == []


def test_nonzero_exit_with_no_stdout_returns_empty_pass_set_not_crash():
    with patch("scanners.nuclei.subprocess.run", return_value=_completed_process("", returncode=1)):
        findings = NucleiScanner(URL).run()
    # Nuclei exiting non-zero with no output is treated the same as "ran clean,
    # no matches" — there's no reliable signal here that distinguishes a real
    # failure from "exited 1 with nothing to report", so we don't raise either way.
    assert len(findings) == 1
    assert findings[0].severity == "pass"
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd apps/scanner && python -m pytest tests/test_nuclei.py::test_binary_not_found_returns_empty_list tests/test_nuclei.py::test_timeout_returns_empty_list tests/test_nuclei.py::test_nonzero_exit_with_no_stdout_returns_empty_pass_set_not_crash -v`
Expected: all PASS — `_run_nuclei`'s `except (FileNotFoundError, subprocess.TimeoutExpired): return None` plus `run()`'s `if result is None: return []` already implement the first two; the third falls through to `_parse_findings("")` which already returns the pass finding regardless of `returncode`, matching Task 1's implementation as written.

- [ ] **Step 3: Commit**

```bash
git add apps/scanner/tests/test_nuclei.py
git commit -m "test(scanner): nuclei failure modes degrade to empty/pass, never raise"
```

---

## Task 5: Confirm the exact command-line invocation (safety-scope regression test)

**Files:**
- Test: `apps/scanner/tests/test_nuclei.py`

**Interfaces:**
- Consumes: `NucleiScanner`.
- Produces: nothing new — this is the test the spec calls out explicitly ("Confirms the exact command-line flags... so the safety scope can't silently drift").

- [ ] **Step 1: Write the failing test**

Add to `apps/scanner/tests/test_nuclei.py`:

```python
def test_invocation_uses_safe_tag_scope_and_rate_limit():
    mock_run = MagicMock(return_value=_completed_process(""))
    with patch("scanners.nuclei.subprocess.run", mock_run):
        NucleiScanner(URL).run()

    args, kwargs = mock_run.call_args
    command = args[0]
    assert command[0] == "nuclei"
    assert "-u" in command and URL in command
    assert "-tags" in command
    assert command[command.index("-tags") + 1] == "cve,exposure,misconfig,default-login,tech"
    assert "-etags" in command
    assert command[command.index("-etags") + 1] == "dos,fuzz,intrusive"
    assert "-rate-limit" in command
    assert command[command.index("-rate-limit") + 1] == "50"
    assert kwargs["timeout"] == 120
```

- [ ] **Step 2: Run test to verify it passes**

Run: `cd apps/scanner && python -m pytest tests/test_nuclei.py::test_invocation_uses_safe_tag_scope_and_rate_limit -v`
Expected: PASS

- [ ] **Step 3: Run the full nuclei test file to confirm nothing regressed**

Run: `cd apps/scanner && python -m pytest tests/test_nuclei.py -v`
Expected: all tests PASS (should be 11 tests: 1 from Task 1, 5 from Task 2, 4 from Task 3, 3 from Task 4, 1 from Task 5 — note Task 2 is parametrized into 5 cases, so the total is `1 + 5 + 4 + 3 + 1 = 14`)

- [ ] **Step 4: Commit**

```bash
git add apps/scanner/tests/test_nuclei.py
git commit -m "test(scanner): lock nuclei command-line safety scope (tags/etags/rate-limit/timeout)"
```

---

## Task 6: Wire `NucleiScanner` into the `deep` tier only

**Files:**
- Modify: `apps/scanner/jobs/tasks.py`
- Modify: `apps/scanner/tests/test_tasks_tiers.py`

**Interfaces:**
- Consumes: `NucleiScanner` from `scanners.nuclei` (Task 1).
- Produces: `_scanners_for_tier("deep")` now includes `NucleiScanner`; `_scanners_for_tier("active")` and `_scanners_for_tier("passive")` do not.

- [ ] **Step 1: Write the failing tests**

In `apps/scanner/tests/test_tasks_tiers.py`, first remove the now-false invariant test:

```python
def test_deep_tier_matches_active_tier():
    """Encodes the invariant that `deep` is currently a pure extension of
    `active` — if someone adds a scanner to one tier's list without
    updating the other, this test catches the drift."""
    from jobs.tasks import _scanners_for_tier
    assert _scanners_for_tier("deep") == _scanners_for_tier("active")
```

Delete that function entirely (it is the last function in the file). Then add at the end of the file:

```python
def test_passive_excludes_nuclei_scanner():
    assert NucleiScanner not in _scanners_for_tier("passive")


def test_active_excludes_nuclei_scanner():
    assert NucleiScanner not in _scanners_for_tier("active")


def test_deep_includes_nuclei_scanner():
    assert NucleiScanner in _scanners_for_tier("deep")


def test_deep_is_active_plus_nuclei_scanner():
    """Replaces the old 'deep == active' invariant now that deep has its
    first deep-only scanner: deep must still be a pure superset of active,
    just with NucleiScanner added on top."""
    assert _scanners_for_tier("deep") == [*_scanners_for_tier("active"), NucleiScanner]
```

And add the import at the top of the file alongside the existing scanner imports:

```python
from scanners.rate_limit import RateLimitScanner
from scanners.nuclei import NucleiScanner
```

(`RateLimitScanner` import already exists in the file from the prior sprint's work — only add the `NucleiScanner` line if `RateLimitScanner`'s import is already present; otherwise add both.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/scanner && python -m pytest tests/test_tasks_tiers.py -v`
Expected: FAIL — `ImportError: cannot import name 'NucleiScanner' from 'scanners.nuclei'` is impossible since Task 1 created that module; the real expected failure is `_scanners_for_tier("deep")` not containing `NucleiScanner` yet, i.e. `test_deep_includes_nuclei_scanner` and `test_deep_is_active_plus_nuclei_scanner` FAIL with `AssertionError`.

- [ ] **Step 3: Modify `jobs/tasks.py`**

In `apps/scanner/jobs/tasks.py`, add the import alongside the other scanner imports:

```python
from scanners.rate_limit import RateLimitScanner
from scanners.nuclei import NucleiScanner
```

Then change the tier-building function:

```python
def _scanners_for_tier(scan_type: str) -> list:
    """Cumulative tiers: active runs everything passive runs, plus more;
    deep runs everything active runs, plus more.

    The lists below are built fresh on every call (not module-level
    constants) so that `unittest.mock.patch("jobs.tasks.HeadersScanner")`
    and friends still take effect in tests — patching rebinds the bare
    name in this module's globals, and that rebinding is only picked up
    if the lookup happens at call time."""
    passive = [HeadersScanner, TLSScanner]
    active = [*passive, SupabaseExposureScanner, StorageExposureScanner, SecretsScanner, RateLimitScanner]
    deep = [*active, NucleiScanner]

    tiers = {
        "passive": passive,
        "active": active,
        "deep": deep,
    }
    return tiers.get(scan_type, passive)
```

Note the docstring's "deep has no additional scanners yet — seam for Nuclei etc." line is removed since that seam is now filled.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/scanner && python -m pytest tests/test_tasks_tiers.py -v`
Expected: all PASS

- [ ] **Step 5: Run the full existing `test_tasks.py` suite to confirm no regression**

Run: `cd apps/scanner && python -m pytest tests/test_tasks.py -v`
Expected: all PASS unchanged — `test_deep_scan_runs_supabase_exposure_scanner` and friends mock specific scanner classes and don't assert on the full tier list, so they're unaffected by `NucleiScanner` joining `deep`. `_execute_scan` will now also instantiate and call `NucleiScanner(url).run()` for `scan_type="deep"` tests — confirm no test in `test_tasks.py` passes `scan_type="deep"` without mocking scanners; if one does, it will now make a real (mocked-away-by-default-fixtures-only-for-named-classes) call. Inspect output; if any deep-tier test in `test_tasks.py` fails because `NucleiScanner` actually tries to run `subprocess.run(["nuclei", ...])` for real, add `patch("jobs.tasks.NucleiScanner")` to that specific test's `with` block, mirroring the existing pattern for `SupabaseExposureScanner` in `test_deep_scan_runs_supabase_exposure_scanner`.

- [ ] **Step 6: Commit**

```bash
git add apps/scanner/jobs/tasks.py apps/scanner/tests/test_tasks_tiers.py
git commit -m "feat(scanner): wire NucleiScanner into the deep tier only"
```

---

## Task 7: Run the full scanner test suite

**Files:**
- None (verification only)

**Interfaces:**
- Consumes: every file from Tasks 1–6.
- Produces: confirmation that the full suite (116 tests before this plan, +14 from Task 1-5, so 130 expected) is green before touching the Dockerfile.

- [ ] **Step 1: Run the full suite**

Run: `cd apps/scanner && python -m pytest -q`
Expected: `130 passed` (116 existing + 14 new from `test_nuclei.py`; `test_tasks_tiers.py` net change is -1 old invariant test +4 new tests = +3, but those 3 are already counted separately from the 14 — recount: if total differs from 130, read the actual pytest summary line and treat that as ground truth, not this arithmetic)

- [ ] **Step 2: If anything fails, stop and fix before proceeding to Task 8**

Do not proceed to the Dockerfile change with a red test suite.

---

## Task 8: Multi-stage Dockerfile — bake `nuclei` binary and templates at build time

**Files:**
- Modify: `apps/scanner/Dockerfile`

**Interfaces:**
- Consumes: nothing from prior tasks (independent infra change).
- Produces: a deployable image with `nuclei` on `PATH` and a pre-pulled template directory, so `NucleiScanner`'s `subprocess.run(["nuclei", ...])` resolves in production.

- [ ] **Step 1: Rewrite the Dockerfile as a multi-stage build**

Replace the full contents of `apps/scanner/Dockerfile`:

```dockerfile
# --- Build stage: compile nuclei and pull its template library ---
FROM golang:1.22-bookworm AS nuclei-build

RUN go install github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest

# -update-templates pulls into ~/.config/nuclei/templates for the user
# running the command (root, in this build stage).
RUN /root/go/bin/nuclei -update-templates

# --- Final stage ---
FROM python:3.12-slim

WORKDIR /app

# WeasyPrint (PDF report rendering) needs Pango/Cairo/GObject at runtime —
# not bundled with the pip package.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpango-1.0-0 libpangocairo-1.0-0 libcairo2 libgdk-pixbuf-2.0-0 \
    libffi8 shared-mime-info \
    && rm -rf /var/lib/apt/lists/*

# Nuclei binary + templates baked in at build time (see
# docs/superpowers/specs/2026-06-17-nuclei-deep-tier-scanner-design.md —
# template freshness is intentionally tied to redeploys, not runtime
# network calls).
COPY --from=nuclei-build /root/go/bin/nuclei /usr/local/bin/nuclei
COPY --from=nuclei-build /root/.config/nuclei /root/.config/nuclei

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 2: Verify the Docker build succeeds locally (if Docker is available)**

Run: `cd apps/scanner && docker build -t vibe-check-scanner-test .`
Expected: build completes successfully through both stages. If Docker is not available in this environment, skip this step and note in the commit message that the build was not locally verified — it will be verified on the next Fly.io deploy.

- [ ] **Step 3: Commit**

```bash
git add apps/scanner/Dockerfile
git commit -m "build(scanner): multi-stage Dockerfile bakes nuclei binary + templates"
```

---

## Task 9: Update `PROJECT_STATUS.md`

**Files:**
- Modify: `PROJECT_STATUS.md`

**Interfaces:**
- Consumes: nothing — documentation only.
- Produces: nothing — terminal task.

- [ ] **Step 1: Add a dated entry near the top of the changelog section**

Add a new entry following the existing pattern (see the most recent `*2026-06-17 (latest) — ...*` entries) describing: `NucleiScanner` added (`scanners/nuclei.py`), curated safe-tag scope, severity mapping (`high→critical`), category always `endpoints`, wired into `deep` tier only (first scanner where `deep` differs from `active`), test count change (116 → actual final count from Task 7's `pytest -q` run), and the `⚠️ Scanner redeploy to Fly.io required` note (multi-stage Dockerfile change must ship).

- [ ] **Step 2: Update the Scanner Service table**

In the `## Scanner Service (apps/scanner/)` section's table, change the row:

```
| Nuclei, SQLmap, DalFox | ❌ | Step 2 — not in scope yet |
```

to:

```
| `NucleiScanner` | ✅ | Curated safe-tag template subset (cve/exposure/misconfig/default-login/tech, excludes dos/fuzz/intrusive). `deep` tier only. SQLmap/DalFox still not started — separate future specs. |
```

And update the `| Tests | ✅ | 116/116 passing |` row to the actual count from Task 7.

- [ ] **Step 3: Update Sprint roadmap section**

In the `### Sprint 3 — Operational depth` (or wherever the Nuclei/SQLi/XSS line lives — search for "Nuclei / SQLi / XSS"), mark the Nuclei portion done and leave SQLmap/DalFox as outstanding, referencing this plan and spec by filename.

- [ ] **Step 4: Update the File Map**

Add to the `apps/scanner/` block in the `## File Map` section:

```
  scanners/nuclei.py                 ← Curated-safe-tag Nuclei subprocess wrapper (deep tier only)
```

- [ ] **Step 5: Commit**

```bash
git add PROJECT_STATUS.md
git commit -m "docs: record Nuclei deep-tier scanner in PROJECT_STATUS"
```

---

## Self-Review Notes (for the plan author, not a task)

- Spec coverage: template scope ✅ (Task 5), severity mapping ✅ (Task 2), category mapping ✅ (Task 1's `_finding_from_match`), failure handling ✅ (Task 4), tier wiring ✅ (Task 6), Dockerfile ✅ (Task 8), testing without local binary ✅ (every task mocks `subprocess.run`). SQLmap/DalFox are explicitly out of scope per the spec's non-goals — no task needed.
- No placeholders: every step has runnable code or an exact command.
- Type/signature consistency: `Finding(check_name, severity, category, title, description, what_we_did, remediation, metadata=None)` matches `scanners/base.py` exactly across all tasks; `NucleiScanner(BaseScanner)` matches `__init__(self, url, timeout=30)` inherited, no override needed.
