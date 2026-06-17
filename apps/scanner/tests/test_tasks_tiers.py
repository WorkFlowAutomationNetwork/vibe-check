from jobs.tasks import _scanners_for_tier
from scanners.secrets import SecretsScanner
from scanners.headers import HeadersScanner
from scanners.storage_exposure import StorageExposureScanner
from scanners.rate_limit import RateLimitScanner
from scanners.nuclei import NucleiScanner


def test_passive_excludes_secrets_scanner():
    assert SecretsScanner not in _scanners_for_tier("passive")
    assert HeadersScanner in _scanners_for_tier("passive")


def test_passive_excludes_storage_exposure_scanner():
    assert StorageExposureScanner not in _scanners_for_tier("passive")


def test_active_includes_secrets_scanner():
    assert SecretsScanner in _scanners_for_tier("active")


def test_active_includes_storage_exposure_scanner():
    assert StorageExposureScanner in _scanners_for_tier("active")


def test_deep_includes_secrets_scanner():
    assert SecretsScanner in _scanners_for_tier("deep")


def test_deep_includes_storage_exposure_scanner():
    assert StorageExposureScanner in _scanners_for_tier("deep")


def test_passive_excludes_rate_limit_scanner():
    assert RateLimitScanner not in _scanners_for_tier("passive")


def test_active_includes_rate_limit_scanner():
    assert RateLimitScanner in _scanners_for_tier("active")


def test_deep_includes_rate_limit_scanner():
    assert RateLimitScanner in _scanners_for_tier("deep")


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
