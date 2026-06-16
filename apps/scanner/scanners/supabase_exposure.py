import re

import httpx

from lib.js_extraction import fetch_page_and_scripts
from scanners.base import BaseScanner, Finding

_SUPABASE_URL_RE = re.compile(r"https://[a-z0-9]+\.supabase\.co")
_JWT_RE = re.compile(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+")
_MAX_TABLES = 50


def _extract_supabase_credentials(blobs: list[str]) -> tuple[str, str] | None:
    url: str | None = None
    key: str | None = None
    for blob in blobs:
        if url is None:
            match = _SUPABASE_URL_RE.search(blob)
            if match:
                url = match.group(0)
        if key is None:
            match = _JWT_RE.search(blob)
            if match:
                key = match.group(0)
        if url and key:
            return url, key
    return None


class SupabaseExposureScanner(BaseScanner):
    def run(self) -> list[Finding]:
        blobs = fetch_page_and_scripts(self.url, self.timeout)
        creds = _extract_supabase_credentials(blobs)
        if not creds:
            return []

        supabase_url, anon_key = creds
        tables = self._discover_tables(supabase_url, anon_key)
        return self._probe_tables(supabase_url, anon_key, tables)

    def _discover_tables(self, supabase_url: str, anon_key: str) -> list[str]:
        headers = {"apikey": anon_key, "Authorization": f"Bearer {anon_key}"}
        try:
            response = httpx.get(f"{supabase_url}/rest/v1/", headers=headers, timeout=self.timeout)
        except httpx.RequestError:
            return []
        if response.status_code != 200:
            return []
        try:
            paths = response.json().get("paths", {})
        except ValueError:
            return []
        tables = [p.lstrip("/") for p in paths if p not in ("/", "")]
        return tables[:_MAX_TABLES]

    def _probe_tables(self, supabase_url: str, anon_key: str, tables: list[str]) -> list[Finding]:
        headers = {"apikey": anon_key, "Authorization": f"Bearer {anon_key}"}
        exposed: list[tuple[str, int]] = []

        for table in tables:
            try:
                response = httpx.get(
                    f"{supabase_url}/rest/v1/{table}",
                    params={"select": "*", "limit": 1},
                    headers=headers,
                    timeout=self.timeout,
                )
            except httpx.RequestError:
                continue
            if response.status_code != 200:
                continue
            try:
                rows = response.json()
            except ValueError:
                continue
            if isinstance(rows, list) and len(rows) > 0:
                exposed.append((table, len(rows)))

        if exposed:
            return [
                Finding(
                    check_name="supabase-rls-exposure",
                    severity="critical",
                    category="endpoints",
                    title=f"Supabase table '{table}' publicly readable without RLS",
                    description=(
                        f"The table '{table}' returned {count} row(s) when queried with "
                        "the site's own public anon key, with no authentication beyond "
                        "that key. This usually means Row Level Security is not enabled "
                        "or not enforced on this table."
                    ),
                    what_we_did=(
                        "Discovered the Supabase project URL and anon key referenced in "
                        f"the site's JavaScript, then queried GET {supabase_url}/rest/v1/"
                        f"{table}?select=*&limit=1 using that key."
                    ),
                    remediation=(
                        f"Enable Row Level Security on the '{table}' table and add "
                        f"policies that scope reads to the owning user: "
                        f"alter table {table} enable row level security;"
                    ),
                )
                for table, count in exposed
            ]

        if tables:
            return [Finding(
                check_name="supabase-rls-exposure",
                severity="pass",
                category="endpoints",
                title="Supabase tables found, none publicly readable",
                description=(
                    f"Found {len(tables)} table(s) exposed via the Supabase REST API; "
                    "none returned data when queried with the public anon key."
                ),
                what_we_did="Queried each discovered table with the site's public anon key and checked for returned rows.",
                remediation="",
            )]

        return []
