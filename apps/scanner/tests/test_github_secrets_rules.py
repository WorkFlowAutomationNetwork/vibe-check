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


def test_mask_secret_ten_char_value_fully_hidden():
    from scanners.github_secrets_rules import mask_secret
    assert mask_secret("abcdefghij") == "……"


def test_mask_secret_long_value_still_shows_ends():
    from scanners.github_secrets_rules import mask_secret
    masked = mask_secret("sk_live_abcdefghijklmnop7f9x")
    assert masked == "sk_l…7f9x"


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
    assert row["variable_name"] == "STRIPE_KEY"
    assert row["still_live"] is False


def test_redact_finding_missing_rule_id_defaults_unknown():
    from scanners.github_secrets_rules import redact_finding
    raw = {"File": "config/.env", "Secret": "sk_live_SUPERSECRETVALUE123"}
    row = redact_finding(raw)
    assert row["rule_id"] == "unknown"
    assert row["severity"] == "medium"


def test_redact_finding_missing_secret_does_not_raise():
    from scanners.github_secrets_rules import redact_finding
    raw = {"RuleID": "generic-api-key", "File": "config/.env"}
    row = redact_finding(raw)
    assert row["match_preview"] == "……"
    assert row["variable_name"] is None


def test_redact_finding_still_live_flag_passed_through():
    from scanners.github_secrets_rules import redact_finding
    raw = {"RuleID": "openai-api-key", "Secret": "sk-abc", "Match": "OPENAI_KEY=sk-abc"}
    row = redact_finding(raw, still_live=True)
    assert row["still_live"] is True
    assert "still present in the latest version" in row["remediation"]


def test_remediation_for_known_provider_differs_from_generic():
    from scanners.github_secrets_rules import remediation_for
    stripe = remediation_for("stripe-access-token", still_live=False)
    generic = remediation_for("totally-unknown-rule", still_live=False)
    assert "Stripe Dashboard" in stripe
    assert "Stripe Dashboard" not in generic
    assert "no longer appears in the latest version" in generic


def test_variable_name_from_match_extracts_key():
    from scanners.github_secrets_rules import variable_name_from_match
    assert variable_name_from_match("AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI", "wJalrXUtnFEMI") == "AWS_SECRET_ACCESS_KEY"


def test_variable_name_from_match_returns_none_for_garbage():
    from scanners.github_secrets_rules import variable_name_from_match
    assert variable_name_from_match("", "") is None
    assert variable_name_from_match("just a sentence with sk-abc in it", "sk-abc") is None
