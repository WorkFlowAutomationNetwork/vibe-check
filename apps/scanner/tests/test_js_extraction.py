import httpx
import respx
from lib.js_extraction import fetch_page_and_scripts

BASE_URL = "https://example.com"


def test_fetches_page_and_script_bodies():
    html = '<html><head><script src="/static/app.js"></script></head></html>'
    with respx.mock:
        respx.get(BASE_URL + "/").mock(return_value=httpx.Response(200, text=html))
        respx.get("https://example.com/static/app.js").mock(
            return_value=httpx.Response(200, text="const x = 1;")
        )
        blobs = fetch_page_and_scripts(BASE_URL, timeout=5)

    assert any("script" in b for b in blobs)
    assert any("const x = 1;" in b for b in blobs)


def test_resolves_absolute_script_url():
    html = '<html><script src="https://cdn.example.com/bundle.js"></script></html>'
    with respx.mock:
        respx.get(BASE_URL).mock(return_value=httpx.Response(200, text=html))
        respx.get("https://cdn.example.com/bundle.js").mock(
            return_value=httpx.Response(200, text="ABSOLUTE_MARKER")
        )
        blobs = fetch_page_and_scripts(BASE_URL, timeout=5)

    assert any("ABSOLUTE_MARKER" in b for b in blobs)


def test_failed_script_fetch_does_not_abort():
    html = (
        '<html><script src="/broken.js"></script>'
        '<script src="/ok.js"></script></html>'
    )
    with respx.mock:
        respx.get(BASE_URL + "/").mock(return_value=httpx.Response(200, text=html))
        respx.get("https://example.com/broken.js").mock(side_effect=httpx.ConnectError("refused"))
        respx.get("https://example.com/ok.js").mock(return_value=httpx.Response(200, text="OK_MARKER"))
        blobs = fetch_page_and_scripts(BASE_URL, timeout=5)

    assert any("OK_MARKER" in b for b in blobs)


def test_page_fetch_failure_returns_empty_list():
    with respx.mock:
        respx.get(BASE_URL).mock(side_effect=httpx.ConnectError("refused"))
        blobs = fetch_page_and_scripts(BASE_URL, timeout=5)

    assert blobs == []


def test_respects_max_scripts_cap():
    scripts_html = "".join(f'<script src="/s{i}.js"></script>' for i in range(15))
    html = f"<html>{scripts_html}</html>"
    with respx.mock:
        respx.get(BASE_URL + "/").mock(return_value=httpx.Response(200, text=html))
        for i in range(15):
            respx.get(f"https://example.com/s{i}.js").mock(
                return_value=httpx.Response(200, text=f"MARKER_{i}")
            )
        blobs = fetch_page_and_scripts(BASE_URL, timeout=5, max_scripts=10)

    marker_count = sum(1 for b in blobs if b.startswith("MARKER_"))
    assert marker_count == 10
