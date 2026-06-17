from jobs.tasks import _scanners_for_tier
from scanners.secrets import SecretsScanner
from scanners.headers import HeadersScanner


def test_passive_excludes_secrets_scanner():
    assert SecretsScanner not in _scanners_for_tier("passive")
    assert HeadersScanner in _scanners_for_tier("passive")


def test_active_includes_secrets_scanner():
    assert SecretsScanner in _scanners_for_tier("active")


def test_deep_includes_secrets_scanner():
    assert SecretsScanner in _scanners_for_tier("deep")
