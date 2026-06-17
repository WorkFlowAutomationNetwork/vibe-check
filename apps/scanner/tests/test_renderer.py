from unittest.mock import MagicMock, patch

import pytest
from reports.renderer import render_report_html, render_report_pdf

SCAN = {"id": "scan-1", "scan_type": "active", "grade": "B+", "score": 82}

FINDINGS = [
    {
        "severity": "critical",
        "title": "Exposed table",
        "description": "desc",
        "what_we_did": "did",
        "remediation": "fix it",
    },
    {
        "severity": "pass",
        "title": "HSTS present",
        "description": "good",
    },
]


def test_render_report_html_includes_url_and_grade():
    html = render_report_html("https://example.com", SCAN, FINDINGS)
    assert "https://example.com" in html
    assert "B+" in html


def test_render_report_html_separates_issues_from_passes():
    html = render_report_html("https://example.com", SCAN, FINDINGS)
    assert "Exposed table" in html
    assert "HSTS present" in html
    assert "Issues (1)" in html
    assert "What's working (1)" in html


def test_render_report_html_orders_issues_by_severity():
    findings = [
        {"severity": "low", "title": "Low issue"},
        {"severity": "critical", "title": "Critical issue"},
    ]
    html = render_report_html("https://example.com", SCAN, findings)
    assert html.index("Critical issue") < html.index("Low issue")


def test_render_report_pdf_raises_when_weasyprint_unavailable():
    with patch("reports.renderer.weasyprint", None):
        with pytest.raises(RuntimeError):
            render_report_pdf("https://example.com", SCAN, FINDINGS)


def test_render_report_pdf_calls_weasyprint_with_rendered_html():
    mock_weasyprint = MagicMock()
    mock_weasyprint.HTML.return_value.write_pdf.return_value = b"%PDF-1.7 fake"
    with patch("reports.renderer.weasyprint", mock_weasyprint):
        pdf_bytes = render_report_pdf("https://example.com", SCAN, FINDINGS)

    assert pdf_bytes == b"%PDF-1.7 fake"
    rendered_html = mock_weasyprint.HTML.call_args.kwargs["string"]
    assert "https://example.com" in rendered_html
