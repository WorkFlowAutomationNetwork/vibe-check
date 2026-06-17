import httpx

from lib.js_extraction import fetch_page_and_scripts
from lib.supabase_creds import extract_supabase_credentials
from scanners.base import BaseScanner, Finding

_MAX_TABLES = 50

# Common table names worth guessing directly when the OpenAPI root spec
# doesn't disclose paths (schema introspection disabled, or a proxy strips
# the `paths` key) — covers the same exposure even without discovery.
_COMMON_TABLE_NAMES = [
    "users", "profiles", "accounts", "user_profiles", "customers",
    "orders", "products", "posts", "comments", "messages", "chats",
    "sessions", "subscriptions", "payments", "invoices", "transactions",
    "items", "files", "documents", "uploads", "notifications", "teams",
    "organizations", "projects", "tasks", "todos", "settings", "logs",
    "events", "leads", "contacts", "tickets",
]


class SupabaseExposureScanner(BaseScanner):
    def run(self) -> list[Finding]:
        blobs = fetch_page_and_scripts(self.url, self.timeout)
        creds = extract_supabase_credentials(blobs)
        if not creds:
            return [self._no_backend_finding()]

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

        # OpenAPI introspection can be disabled or stripped by a proxy, in
        # which case `paths` comes back empty even though the REST endpoint
        # itself is reachable — fall back to guessing common table names so
        # the same RLS-exposure check still has something to probe.
        if not tables:
            tables = list(_COMMON_TABLE_NAMES)

        seen: set[str] = set()
        deduped: list[str] = []
        for table in tables:
            if table not in seen:
                seen.add(table)
                deduped.append(table)
        return deduped[:_MAX_TABLES]

    def _probe_tables(self, supabase_url: str, anon_key: str, tables: list[str]) -> list[Finding]:
        headers = {"apikey": anon_key, "Authorization": f"Bearer {anon_key}"}
        exposed: list[tuple[str, int]] = []
        # Guessed table names that don't exist return non-200 and are dropped
        # here — only count tables that actually responded for the pass message,
        # so a guess-only run doesn't claim to have "found" tables it merely tried.
        confirmed_count = 0

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
            confirmed_count += 1
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

        if confirmed_count:
            return [Finding(
                check_name="supabase-rls-exposure",
                severity="pass",
                category="endpoints",
                title="Supabase tables found, none publicly readable",
                description=(
                    f"Found {confirmed_count} table(s) exposed via the Supabase REST API; "
                    "none returned data when queried with the public anon key."
                ),
                what_we_did="Queried each discovered table with the site's public anon key and checked for returned rows.",
                remediation="",
            )]

        return [self._no_tables_confirmed_finding()]

    def _no_backend_finding(self) -> Finding:
        return Finding(
            check_name="supabase-rls-exposure",
            severity="info",
            category="endpoints",
            title="No Supabase backend detected",
            description=(
                "This check looks for a Supabase project URL and anon key in the "
                "site's client-side code. We didn't find one, so this app doesn't "
                "appear to use Supabase as its database backend — this check only "
                "applies to apps that do."
            ),
            what_we_did="Scanned the page and its JavaScript bundles for a Supabase project URL and anon key.",
            remediation="",
        )

    def _no_tables_confirmed_finding(self) -> Finding:
        return Finding(
            check_name="supabase-rls-exposure",
            severity="info",
            category="endpoints",
            title="Found a Supabase backend, but couldn't confirm any readable tables",
            description=(
                "Found a Supabase project URL and anon key, but none of the table "
                "names we tried (from the project's own API schema, or a list of "
                "common table names) returned a successful response — so we "
                "couldn't confirm any tables exist to check for missing RLS."
            ),
            what_we_did="Queried the Supabase REST API for known and commonly-named tables using the site's public anon key.",
            remediation="",
        )
