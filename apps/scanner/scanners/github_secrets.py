"""Clone a repo with a short-lived token and run gitleaks over its history.

Repo code is only ever read by gitleaks here — it is never built, installed,
or executed. The clone tmpdir is always removed, even if gitleaks raises."""

import json
import os
import shutil
import subprocess
import tempfile
from dataclasses import dataclass

from scanners.github_secrets_rules import redact_finding


@dataclass
class RepoScanResult:
    mode: str            # "full" | "incremental"
    head_sha: str
    base_sha: str | None
    findings: list[dict]  # redacted repo_findings rows


class GitHubSecretsScanner:
    """Clone `clone_url` (token-bearing) and run gitleaks over its full git
    history. The clone is always deleted in run()'s finally block."""

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

    def _clone_url_for_log(self) -> str:
        """Clone URL with the token redacted, safe to log."""
        if not self.token:
            return self.clone_url
        return self.clone_url.replace(self.token, "***")

    def _run(self, cmd: list[str], cwd: str | None = None) -> subprocess.CompletedProcess:
        return subprocess.run(
            cmd, capture_output=True, text=True, timeout=self.timeout, cwd=cwd
        )

    def run(self) -> RepoScanResult:
        workdir = tempfile.mkdtemp(prefix="repo-scan-")
        clone_dir = os.path.join(workdir, "repo")
        report_path = os.path.join(workdir, "gitleaks.json")
        try:
            self._run(["git", "clone", self.clone_url, clone_dir])

            head = self._run(
                ["git", "rev-parse", "HEAD"], cwd=clone_dir
            )
            head_sha = head.stdout.strip()

            mode = "full"
            log_opts: str | None = None
            if self.base_sha:
                anc = self._run(
                    ["git", "merge-base", "--is-ancestor", self.base_sha, "HEAD"],
                    cwd=clone_dir,
                )
                if anc.returncode == 0:
                    mode = "incremental"
                    log_opts = f"--log-opts={self.base_sha}..HEAD"

            cmd = [
                "gitleaks", "detect", "--source", clone_dir,
                "--report-format", "json", "--report-path", report_path,
                "--exit-code", "0",
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
