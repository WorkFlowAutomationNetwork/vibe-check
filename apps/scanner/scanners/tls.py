from datetime import datetime, timezone
from urllib.parse import urlparse

from sslyze import Scanner, ServerNetworkLocation, ServerScanRequest
from sslyze.plugins.scan_commands import ScanCommand

from scanners.base import BaseScanner, Finding

_EXPIRY_WARNING_DAYS = 30


def _analyze_cert_info(days_until_expiry: int) -> list[Finding]:
    if days_until_expiry < 0:
        return [Finding(
            check_name="cert-expiry",
            severity="critical",
            category="transport",
            title="SSL Certificate Expired",
            description=f"The certificate expired {abs(days_until_expiry)} days ago.",
            what_we_did="Checked certificate validity period using sslyze.",
            remediation="Renew your SSL certificate immediately.",
        )]
    if days_until_expiry < _EXPIRY_WARNING_DAYS:
        return [Finding(
            check_name="cert-expiry",
            severity="medium",
            category="transport",
            title="SSL Certificate Expiring Soon",
            description=f"Certificate expires in {days_until_expiry} days.",
            what_we_did="Checked certificate expiry date using sslyze.",
            remediation=f"Renew your SSL certificate before it expires in {days_until_expiry} days.",
        )]
    return [Finding(
        check_name="cert-expiry",
        severity="pass",
        category="transport",
        title="SSL Certificate Valid",
        description=f"Certificate is valid for {days_until_expiry} more days.",
        what_we_did="Checked certificate validity and expiry using sslyze.",
        remediation="",
    )]


def _analyze_tls_versions(has_tls12: bool, has_tls13: bool, has_weak: bool) -> list[Finding]:
    findings: list[Finding] = []

    if has_weak and not has_tls12 and not has_tls13:
        findings.append(Finding(
            check_name="tls-versions",
            severity="critical",
            category="transport",
            title="Only Weak TLS Versions Supported (TLS 1.0/1.1)",
            description="The server only supports deprecated TLS 1.0 or TLS 1.1 protocols.",
            what_we_did="Probed supported TLS versions using sslyze.",
            remediation="Disable TLS 1.0 and 1.1. Enable TLS 1.2 as the minimum, and TLS 1.3 if possible.",
        ))
    elif has_weak:
        findings.append(Finding(
            check_name="tls-versions",
            severity="medium",
            category="transport",
            title="Weak TLS Versions Also Supported (TLS 1.0/1.1)",
            description="The server supports TLS 1.2+ but also allows deprecated TLS 1.0 or 1.1.",
            what_we_did="Probed supported TLS versions using sslyze.",
            remediation="Disable TLS 1.0 and 1.1 on your server.",
        ))

    if has_tls13:
        findings.append(Finding(
            check_name="tls-versions",
            severity="pass",
            category="transport",
            title="TLS 1.3 Supported",
            description="Server supports TLS 1.3, the most secure TLS version.",
            what_we_did="Probed TLS 1.3 support using sslyze.",
            remediation="",
        ))
    elif has_tls12:
        findings.append(Finding(
            check_name="tls-versions",
            severity="pass",
            category="transport",
            title="TLS 1.2 Supported",
            description="Server supports TLS 1.2 as the minimum acceptable version.",
            what_we_did="Probed TLS 1.2 support using sslyze.",
            remediation="Consider also enabling TLS 1.3 for improved performance and security.",
        ))

    return findings


class TLSScanner(BaseScanner):
    def run(self) -> list[Finding]:
        hostname = urlparse(self.url).hostname
        if not hostname:
            return [Finding(
                check_name="tls-scan",
                severity="info",
                category="transport",
                title="TLS Scan Skipped",
                description="Could not extract hostname from URL.",
                what_we_did="Attempted to parse hostname from URL.",
                remediation="Ensure the URL includes a valid hostname.",
            )]

        try:
            location = ServerNetworkLocation(hostname=hostname, port=443)
            request = ServerScanRequest(
                server_location=location,
                scan_commands={
                    ScanCommand.CERTIFICATE_INFO,
                    ScanCommand.SSL_2_0_CIPHER_SUITES,
                    ScanCommand.SSL_3_0_CIPHER_SUITES,
                    ScanCommand.TLS_1_0_CIPHER_SUITES,
                    ScanCommand.TLS_1_1_CIPHER_SUITES,
                    ScanCommand.TLS_1_2_CIPHER_SUITES,
                    ScanCommand.TLS_1_3_CIPHER_SUITES,
                },
            )
            scanner = Scanner()
            scanner.queue_scans([request])

            findings: list[Finding] = []
            for result in scanner.get_results():
                if result.scan_result is None:
                    continue
                findings.extend(self._process_result(result.scan_result))
            return findings

        except Exception as exc:
            return [Finding(
                check_name="tls-scan",
                severity="info",
                category="transport",
                title="TLS Scan Could Not Complete",
                description=f"sslyze could not connect to {hostname}:443 — {exc}",
                what_we_did="Attempted TLS/SSL analysis using sslyze.",
                remediation="Ensure the server is accessible on port 443.",
            )]

    def _process_result(self, scan_result) -> list[Finding]:
        findings: list[Finding] = []

        cert_info = getattr(scan_result, "certificate_info", None)
        if cert_info and not isinstance(cert_info, Exception):
            try:
                leaf = cert_info.result.verified_certificate_chain[0]
                expiry: datetime = leaf.not_valid_after_utc
                days_left = (expiry - datetime.now(timezone.utc)).days
                findings.extend(_analyze_cert_info(days_left))
            except Exception:
                pass

        def _has_accepted(attr_name: str) -> bool:
            result = getattr(scan_result, attr_name, None)
            if result is None or isinstance(result, Exception):
                return False
            accepted = getattr(result.result, "accepted_cipher_suites", [])
            return len(accepted) > 0

        has_tls12 = _has_accepted("tls_1_2_cipher_suites")
        has_tls13 = _has_accepted("tls_1_3_cipher_suites")
        has_weak = (
            _has_accepted("ssl_2_0_cipher_suites")
            or _has_accepted("ssl_3_0_cipher_suites")
            or _has_accepted("tls_1_0_cipher_suites")
            or _has_accepted("tls_1_1_cipher_suites")
        )

        findings.extend(_analyze_tls_versions(has_tls12, has_tls13, has_weak))
        return findings
