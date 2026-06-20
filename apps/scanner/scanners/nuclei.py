import json
import subprocess

from scanners.base import BaseScanner, Finding

# 450s: 300s was the prior value (measured ~257s on the prod VM) but real
# targets observed in validation rode or exceeded the 300s ceiling — merlin.systems
# timed out and dropped its entire Nuclei dimension. 450s gives slower "vibe-coded"
# sites room to finish; when it still times out we salvage partial output and flag
# the result as incomplete rather than silently returning nothing.
_TIMEOUT_SECONDS = 450
_SAFE_TAGS = "cve,exposure,misconfig,default-login,tech"
_EXCLUDED_TAGS = "dos,fuzz,intrusive"
_RATE_LIMIT = 50
_PER_REQUEST_TIMEOUT = 10
# Cap how many matched locations we list in a collapsed finding's description.
_MAX_LOCATIONS_LISTED = 15

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
        stdout, status = self._run_nuclei()

        if status == "unavailable":
            return [self._unavailable_finding()]

        matches = self._parse_matches(stdout)

        if status == "timeout":
            # A truncated scan must never present as a clean bill of health: keep
            # whatever Nuclei streamed before the kill, and flag the gap explicitly.
            return matches + [self._incomplete_finding()]

        if not matches:
            return [self._no_matches_finding()]
        return matches

    def _run_nuclei(self) -> tuple[str, str]:
        """Returns (stdout, status). status is 'ok' | 'timeout' | 'unavailable'.

        On timeout we recover the partial output Nuclei already streamed —
        `-jsonl` emits one complete JSON object per line as each template matches,
        so partial stdout is still valid, parseable findings."""
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
            proc = subprocess.run(
                command, capture_output=True, text=True, timeout=_TIMEOUT_SECONDS,
            )
            return proc.stdout, "ok"
        except subprocess.TimeoutExpired as exc:
            partial = exc.stdout or ""
            if isinstance(partial, bytes):
                partial = partial.decode("utf-8", "replace")
            return partial, "timeout"
        except FileNotFoundError:
            return "", "unavailable"

    def _parse_matches(self, stdout: str) -> list[Finding]:
        """Parse JSONL matches, collapsing repeats of the same template into a
        single finding. The same opportunity reported at many endpoints (e.g.
        'missing security headers' on every page) is one finding listing the
        locations — not N near-identical rows."""
        grouped: dict[str, list[dict]] = {}
        order: list[str] = []
        for line in stdout.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                match = json.loads(line)
            except ValueError:
                continue
            if not isinstance(match, dict):
                continue
            template_id = match.get("template-id", "unknown-template")
            if template_id not in grouped:
                grouped[template_id] = []
                order.append(template_id)
            grouped[template_id].append(match)

        return [self._finding_from_group(tid, grouped[tid]) for tid in order]

    def _finding_from_group(self, template_id: str, matches: list[dict]) -> Finding:
        info = matches[0].get("info", {})
        if not isinstance(info, dict):
            info = {}
        remediation = info.get("remediation") or (
            "Review this finding against the linked CVE/reference and apply "
            "the vendor's recommended fix."
        )
        description = info.get("description") or f"Nuclei template '{template_id}' matched."

        if len(matches) == 1:
            matched_at = matches[0].get("matched-at", self.url)
            what_we_did = f"Ran Nuclei template '{template_id}' against {matched_at}."
        else:
            locations = []
            for m in matches:
                loc = m.get("matched-at")
                if loc and loc not in locations:
                    locations.append(loc)
            shown = locations[:_MAX_LOCATIONS_LISTED]
            more = len(locations) - len(shown)
            suffix = f" (+{more} more)" if more > 0 else ""
            description = (
                f"{description} Matched at {len(locations)} locations: "
                f"{', '.join(shown)}{suffix}."
            )
            what_we_did = (
                f"Ran Nuclei template '{template_id}'; it matched at "
                f"{len(locations)} locations on this site."
            )

        return Finding(
            check_name=f"nuclei-{template_id}",
            severity=_map_severity(info.get("severity", "info")),
            category="endpoints",
            title=info.get("name", template_id),
            description=description,
            what_we_did=what_we_did,
            remediation=remediation,
        )

    def _incomplete_finding(self) -> Finding:
        return Finding(
            check_name="nuclei-incomplete",
            severity="info",
            category="endpoints",
            title="Nuclei scan did not finish in the time budget",
            description=(
                f"The curated Nuclei template scan was still running after "
                f"{_TIMEOUT_SECONDS}s and was stopped. Any matches found before then "
                "are included above, but this part of the report may be incomplete."
            ),
            what_we_did=(
                "Ran a curated, safe-tagged subset of Nuclei community templates "
                f"for up to {_TIMEOUT_SECONDS}s."
            ),
            remediation="Re-run the deep scan to let Nuclei finish a full pass.",
        )

    def _unavailable_finding(self) -> Finding:
        return Finding(
            check_name="nuclei-unavailable",
            severity="info",
            category="endpoints",
            title="Nuclei check could not be run",
            description=(
                "The Nuclei scanner was unavailable, so CVE, exposure, "
                "misconfiguration, and default-login template checks were skipped "
                "for this scan."
            ),
            what_we_did="Attempted to run a curated, safe-tagged subset of Nuclei community templates.",
            remediation="This is a scanner-side issue — please re-run the scan.",
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
