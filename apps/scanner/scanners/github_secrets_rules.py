"""Severity classification and redaction for gitleaks findings.

SECURITY INVARIANT: redact_finding must NEVER copy the raw matched secret
(gitleaks 'Secret' / 'Match') into any persisted field — only a masked
preview, the rule, and location metadata. A security product must not become
a secret store (see scanners/base.py Finding docstring, spec §5)."""

import re

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

# Per-rule rotation guidance, used in place of the generic line above when we
# know the provider. Anything not listed here falls back to _REMEDIATION.
_PROVIDER_REMEDIATION = {
    "stripe-access-token": (
        "Rotate this key from the Stripe Dashboard → Developers → API keys, "
        "then delete the old one. Then remove it from git history (e.g. "
        "git filter-repo / BFG)."
    ),
    "aws-access-key": (
        "Deactivate this key in AWS IAM → Users → Security credentials, then "
        "create a replacement. Then remove it from git history (e.g. "
        "git filter-repo / BFG)."
    ),
    "aws-access-token": (
        "Deactivate this key in AWS IAM → Users → Security credentials, then "
        "create a replacement. Then remove it from git history (e.g. "
        "git filter-repo / BFG)."
    ),
    "github-pat": (
        "Revoke immediately at github.com/settings/tokens and issue a new "
        "fine-grained token. Then remove it from git history (e.g. "
        "git filter-repo / BFG)."
    ),
    "github-fine-grained-pat": (
        "Revoke immediately at github.com/settings/tokens and issue a new "
        "fine-grained token. Then remove it from git history (e.g. "
        "git filter-repo / BFG)."
    ),
    "github-app-token": (
        "Revoke the GitHub App installation token / reinstall the app, then "
        "remove it from git history (e.g. git filter-repo / BFG)."
    ),
    "github-oauth": (
        "Revoke this OAuth token at github.com/settings/applications, then "
        "remove it from git history (e.g. git filter-repo / BFG)."
    ),
    "openai-api-key": (
        "Revoke and regenerate at platform.openai.com/api-keys. Then remove "
        "it from git history (e.g. git filter-repo / BFG)."
    ),
    "gcp-service-account": (
        "Delete this key in GCP Console → IAM & Admin → Service Accounts → "
        "Keys, then issue a new one. Then remove it from git history (e.g. "
        "git filter-repo / BFG)."
    ),
    "gcp-api-key": (
        "Restrict or regenerate this key at GCP Console → APIs & Services → "
        "Credentials. Then remove it from git history (e.g. git filter-repo "
        "/ BFG)."
    ),
    "supabase-service-role-key": (
        "Reset the service_role key in Supabase Dashboard → Project Settings "
        "→ API — this invalidates the old key for every client using it. "
        "Then remove it from git history (e.g. git filter-repo / BFG)."
    ),
    "slack-bot-token": (
        "Revoke and reinstall the app at api.slack.com/apps → OAuth & "
        "Permissions. Then remove it from git history (e.g. git filter-repo "
        "/ BFG)."
    ),
    "private-key": (
        "Treat as fully compromised — generate a new keypair and redeploy "
        "every service that trusted it; a private key cannot be partially "
        "rotated. Then remove it from git history (e.g. git filter-repo / "
        "BFG)."
    ),
    "sendgrid-api-key": (
        "Rotate at SendGrid → Settings → API Keys. Then remove it from git "
        "history (e.g. git filter-repo / BFG)."
    ),
    "twilio-api-key": (
        "Rotate at the Twilio Console → Account → API keys & tokens. Then "
        "remove it from git history (e.g. git filter-repo / BFG)."
    ),
    "mailchimp-api-key": (
        "Rotate at Mailchimp → Account → Extras → API keys. Then remove it "
        "from git history (e.g. git filter-repo / BFG)."
    ),
}

_STILL_LIVE_NOTE = " This secret is still present in the latest version of the file — treat as urgent."
_HISTORY_ONLY_NOTE = (
    " This secret no longer appears in the latest version of the file, but "
    "it remains exposed in git history until purged — rotate it regardless."
)


def severity_for(rule_id: str) -> str:
    return "critical" if rule_id in _CRITICAL_RULES else "medium"


def remediation_for(rule_id: str, still_live: bool) -> str:
    base = _PROVIDER_REMEDIATION.get(rule_id, _REMEDIATION)
    return base + (_STILL_LIVE_NOTE if still_live else _HISTORY_ONLY_NOTE)


def mask_secret(secret: str) -> str:
    if not secret or len(secret) <= 12:
        return "……"
    return f"{secret[:4]}…{secret[-4:]}"


_VAR_NAME_RE = re.compile(r"^[A-Za-z0-9_.\-]{2,80}$")


def variable_name_from_match(match: str, secret: str) -> str | None:
    """Best-effort extraction of the key/variable name from gitleaks' 'Match'
    field (the full matched line), e.g. 'AWS_SECRET_ACCESS_KEY=...' -> the
    key. Never includes the secret value itself. Returns None rather than a
    guess when the surrounding text doesn't look like a simple assignment."""
    if not match:
        return None
    remainder = match.replace(secret, "") if secret else match
    remainder = remainder.strip().rstrip("=:").strip().strip("'\" \t")
    if not remainder:
        return None
    name = remainder.replace(":", "=").split("=")[0].strip().strip("'\"")
    return name if _VAR_NAME_RE.fullmatch(name) else None


def redact_finding(raw: dict, still_live: bool = False) -> dict:
    rule_id = raw.get("RuleID", "unknown")
    secret = raw.get("Secret", "")
    return {
        "rule_id": rule_id,
        "severity": severity_for(rule_id),
        "title": raw.get("Description") or rule_id,
        "description": f"Committed secret detected by rule '{rule_id}'.",
        "file_path": raw.get("File"),
        "commit_sha": raw.get("Commit"),
        "line_start": raw.get("StartLine"),
        "fingerprint": raw.get("Fingerprint"),
        "match_preview": mask_secret(secret),
        "variable_name": variable_name_from_match(raw.get("Match", ""), secret),
        "still_live": bool(still_live),
        "commit_author": raw.get("Author"),
        "committed_at": raw.get("Date"),
        "remediation": remediation_for(rule_id, still_live),
    }
