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
