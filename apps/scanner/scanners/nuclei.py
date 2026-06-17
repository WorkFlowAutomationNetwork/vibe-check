import json
import subprocess

from scanners.base import BaseScanner, Finding

# 300s, not the originally-planned 120s: measured against a real target on
# the production VM, a full run of this tag scope took ~257s. 120s would
# have killed almost every real scan and silently dropped all findings.
_TIMEOUT_SECONDS = 300
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
            if not isinstance(match, dict):
                continue
            findings.append(self._finding_from_match(match))

        if not findings:
            return [self._no_matches_finding()]
        return findings

    def _finding_from_match(self, match: dict) -> Finding:
        template_id = match.get("template-id", "unknown-template")
        info = match.get("info", {})
        if not isinstance(info, dict):
            info = {}
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
