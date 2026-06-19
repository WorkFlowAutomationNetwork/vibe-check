import types
from datetime import datetime, timedelta, timezone
from unittest.mock import patch
from scanners.tls import TLSScanner, _analyze_cert_info, _analyze_tls_versions


def _scan_result_with_expiry(days_until_expiry: int):
    """Build a fake sslyze scan_result mirroring the real 6.x CERTIFICATE_INFO shape:
    scan_result.certificate_info.result.certificate_deployments[0]
        .received_certificate_chain[0].not_valid_after_utc
    Cipher-suite attrs are left unset so _has_accepted() reads them as None.
    """
    leaf = types.SimpleNamespace(
        not_valid_after_utc=datetime.now(timezone.utc) + timedelta(days=days_until_expiry)
    )
    deployment = types.SimpleNamespace(received_certificate_chain=[leaf])
    ci_result = types.SimpleNamespace(certificate_deployments=[deployment])
    attempt = types.SimpleNamespace(result=ci_result)
    return types.SimpleNamespace(certificate_info=attempt)


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


def test_process_result_emits_cert_expiry_for_valid_cert():
    """Regression: _process_result must read expiry from the real sslyze 6.x
    certificate_deployments[0].received_certificate_chain[0] path. Previously it
    read a non-existent .verified_certificate_chain, so cert-expiry was never emitted."""
    scanner = TLSScanner("https://example.com")
    findings = scanner._process_result(_scan_result_with_expiry(200))
    cert_findings = [f for f in findings if f.check_name == "cert-expiry"]
    assert len(cert_findings) == 1
    assert cert_findings[0].severity == "pass"


def test_process_result_emits_cert_expiry_medium_when_expiring_soon():
    scanner = TLSScanner("https://example.com")
    findings = scanner._process_result(_scan_result_with_expiry(15))
    cert_findings = [f for f in findings if f.check_name == "cert-expiry"]
    assert len(cert_findings) == 1
    assert cert_findings[0].severity == "medium"


def test_process_result_emits_cert_expiry_critical_when_expired():
    scanner = TLSScanner("https://example.com")
    findings = scanner._process_result(_scan_result_with_expiry(-5))
    cert_findings = [f for f in findings if f.check_name == "cert-expiry"]
    assert len(cert_findings) == 1
    assert cert_findings[0].severity == "critical"


def test_scanner_returns_info_on_connection_failure():
    with patch("scanners.tls.Scanner") as MockScanner:
        MockScanner.return_value.get_results.side_effect = Exception("network error")
        findings = TLSScanner("https://example.com").run()
    assert len(findings) == 1
    assert findings[0].severity == "info"
