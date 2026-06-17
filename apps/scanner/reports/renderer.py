from datetime import datetime, timezone
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

try:
    # Requires native GTK/Pango/Cairo libs only present in the deploy
    # container (see Dockerfile) — absent on a typical Windows dev machine.
    import weasyprint
except Exception:  # pragma: no cover - environment-dependent
    weasyprint = None

_TEMPLATES_DIR = Path(__file__).parent / "templates"
_env = Environment(
    loader=FileSystemLoader(str(_TEMPLATES_DIR)),
    autoescape=select_autoescape(["html"]),
)

_SEVERITY_ORDER = {"critical": 0, "medium": 1, "low": 2, "info": 3, "pass": 4}


def render_report_html(url: str, scan: dict, findings: list[dict]) -> str:
    issues = sorted(
        (f for f in findings if f.get("severity") != "pass"),
        key=lambda f: _SEVERITY_ORDER.get(f.get("severity"), 99),
    )
    passes = [f for f in findings if f.get("severity") == "pass"]
    template = _env.get_template("report.html")
    return template.render(
        url=url,
        scan=scan,
        issues=issues,
        passes=passes,
        generated_at=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
    )


def render_report_pdf(url: str, scan: dict, findings: list[dict]) -> bytes:
    if weasyprint is None:
        raise RuntimeError("WeasyPrint native dependencies are not available in this environment")
    html = render_report_html(url, scan, findings)
    return weasyprint.HTML(string=html).write_pdf()
