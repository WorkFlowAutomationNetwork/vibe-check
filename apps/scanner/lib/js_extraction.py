import re
from urllib.parse import urljoin

import httpx

_SCRIPT_SRC_RE = re.compile(r'<script[^>]+src=["\']([^"\']+)["\']', re.IGNORECASE)


def fetch_page_and_scripts(
    url: str,
    timeout: float,
    # Secrets/config values almost always land in the first few bundles a page
    # loads (main entry chunk, inline config) rather than deep in vendor code,
    # so a small cap keeps this cheap without losing meaningful coverage.
    max_scripts: int = 10,
    # Per-blob cap (page HTML and each script body) — keeps memory/CPU bounded
    # when handed an untrusted URL that could point at a huge response.
    max_bytes: int = 500_000,
) -> list[str]:
    """Fetch the page HTML plus same-origin <script src> bundles.

    Best-effort: any individual request failure is swallowed, not fatal —
    callers get whatever text was successfully retrieved. Used by scanners
    that need to find values embedded in client-side JS (e.g. Supabase
    project URLs/keys).
    """
    blobs: list[str] = []

    try:
        page = httpx.get(url, timeout=timeout, follow_redirects=True)
    except httpx.RequestError:
        return blobs

    if page.status_code != 200:
        return blobs

    html = page.text
    blobs.append(html[:max_bytes])

    script_srcs = _SCRIPT_SRC_RE.findall(html)[:max_scripts]

    for src in script_srcs:
        script_url = urljoin(str(page.url), src)
        try:
            response = httpx.get(script_url, timeout=timeout)
        except httpx.RequestError:
            continue
        if response.status_code != 200:
            continue
        blobs.append(response.text[:max_bytes])

    return blobs
