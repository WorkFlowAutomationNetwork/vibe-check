import pytest
from unittest.mock import MagicMock, patch
from scanners.tls import TLSScanner, _analyze_cert_info, _analyze_tls_versions


def test_cert_expired_is_critical():
    findings = _analyze_cert_info(-1)
    assert any(f.severity == "critical" for f in findings)


def test_cert_expiring_soon_is_medium():
    findings = _analyze_cert_info(15)
    assert any(f.severity == "medium" for f in findings)


def test_cert_valid_long_is_pass():
    findings = _analyze_cert_info(180)
    assert all(f.severity == "pass" for f in findings)


def test_tls_12_only_is_pass():
    findings = _analyze_tls_versions(has_tls12=True, has_tls13=False, has_weak=False)
    severities = {f.severity for f in findings}
    assert "critical" not in severities
    assert "high" not in severities


def test_tls_13_adds_pass_finding():
    findings = _analyze_tls_versions(has_tls12=True, has_tls13=True, has_weak=False)
    assert any(f.severity == "pass" and "1.3" in f.title for f in findings)


def test_weak_tls_only_is_critical():
    findings = _analyze_tls_versions(has_tls12=False, has_tls13=False, has_weak=True)
    assert any(f.severity == "critical" for f in findings)


def test_weak_tls_alongside_modern_is_medium():
    findings = _analyze_tls_versions(has_tls12=True, has_tls13=False, has_weak=True)
    assert any(f.severity == "medium" for f in findings)


def test_scanner_returns_info_on_connection_failure():
    with patch("scanners.tls.Scanner") as MockScanner:
        MockScanner.return_value.get_results.side_effect = Exception("network error")
        findings = TLSScanner("https://example.com").run()
    assert len(findings) == 1
    assert findings[0].severity == "info"
