from scanners.secrets import _PATTERNS, _is_placeholder, _mask

# Fake, non-real key bodies built by concatenation so that no full key-shaped
# literal (e.g. "sk_live_<24 chars>") ever sits in committed source — that would
# trip GitHub push protection / GitGuardian, which is exactly the hygiene this
# scanner exists to enforce. The split halves are individually non-matching.
_BODY = "0aB3xY9zQw1mN7kP4rT6vL2s"
_SK_LIVE = "sk_live_" + _BODY
_SK_TEST = "sk_test_" + _BODY + "7yu"
_PK_LIVE = "pk_live_" + _BODY
_OPENAI = "sk-proj-" + "Abc123Def456Ghi789Jkl012"
_ANTHROPIC = "sk-ant-" + "Abc123Def456Ghi789Jkl012mno"
_GOOGLE = "AIza" + "SyB1c2D3e4F5g6H7i8J9k0L1m2N3o4P5q6R7"


def _first_match(text: str):
    """Return (provider, kind) for the first pattern that matches text."""
    for pat in _PATTERNS:
        if pat.regex.search(text):
            return pat.provider, pat.kind
    return None


def test_mask_shows_only_last_four():
    assert _mask(_SK_LIVE) == "…" + _BODY[-4:]
    assert _mask("ab") == "ab"  # shorter than 4 -> returned as-is


def test_stripe_live_secret_is_secret():
    provider, kind = _first_match(f"const k='{_SK_LIVE}'")
    assert kind == "secret"
    assert "Stripe" in provider


def test_stripe_test_secret_is_secret():
    _, kind = _first_match(_SK_TEST)
    assert kind == "secret"


def test_stripe_publishable_is_publishable():
    _, kind = _first_match(_PK_LIVE)
    assert kind == "publishable"


def test_openai_key_is_secret_and_not_anthropic():
    provider, kind = _first_match(_OPENAI)
    assert kind == "secret"
    assert "OpenAI" in provider


def test_anthropic_key_classified_as_anthropic_not_openai():
    provider, kind = _first_match(_ANTHROPIC)
    assert "Anthropic" in provider
    assert kind == "secret"


def test_aws_access_key_is_secret():
    # AWS's canonical documentation example key (push protection allowlists it).
    _, kind = _first_match("AKIAIOSFODNN7EXAMPLE1")
    assert kind == "secret"


def test_google_api_key_is_publishable():
    _, kind = _first_match(_GOOGLE)
    assert kind == "publishable"


def test_private_key_block_is_secret():
    _, kind = _first_match("-----BEGIN RSA PRIVATE KEY-----")
    assert kind == "secret"


def test_placeholder_values_are_rejected():
    assert _is_placeholder("sk_live_" + "x" * 24)
    assert _is_placeholder("sk-your-key-here-goes-something")
    assert _is_placeholder("AKIAAAAAAAAAAAAAAAAA")  # all-same body
    assert _is_placeholder("sk-test-example-key-value-here")  # 'example' as a word
    assert not _is_placeholder(_SK_LIVE)
    # 'example' embedded in a key-shaped run must NOT count as a placeholder —
    # dropping a real key-shaped value would be a false negative (review fix).
    assert not _is_placeholder("AKIAIOSFODNN7EXAMPLE1")
