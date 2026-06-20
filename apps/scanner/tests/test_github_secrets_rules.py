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
