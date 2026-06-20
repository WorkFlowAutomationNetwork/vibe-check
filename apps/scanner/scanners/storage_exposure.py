import httpx

from lib.js_extraction import fetch_page_and_scripts
from lib.supabase_creds import extract_supabase_credentials
from scanners.base import BaseScanner, Finding


class StorageExposureScanner(BaseScanner):
    """Checks Supabase Storage buckets not marked public for missing RLS on
    storage.objects, mirroring the table-exposure check in
    supabase_exposure.py: same anon-key-plus-missing-RLS pattern, applied to
    bucket object listing instead of REST table rows."""

    def run(self) -> list[Finding]:
        blobs = fetch_page_and_scripts(self.url, self.timeout)
        creds = extract_supabase_credentials(blobs)
        if not creds:
            # The table-exposure scanner already reports the single
            # "No Supabase backend detected" note for apps with no Supabase.
            # Staying silent here avoids a duplicate identical row in the report.
            return []

        supabase_url, anon_key = creds
        buckets = self._list_buckets(supabase_url, anon_key)
        if not buckets:
            return [self._no_buckets_finding()]

        return self._probe_private_buckets(supabase_url, anon_key, buckets)

    def _list_buckets(self, supabase_url: str, anon_key: str) -> list[dict]:
        headers = {"apikey": anon_key, "Authorization": f"Bearer {anon_key}"}
        try:
            response = httpx.get(f"{supabase_url}/storage/v1/bucket", headers=headers, timeout=self.timeout)
        except httpx.RequestError:
            return []
        if response.status_code != 200:
            return []
        try:
            buckets = response.json()
        except ValueError:
            return []
        if not isinstance(buckets, list):
            return []
        return buckets

    def _probe_private_buckets(self, supabase_url: str, anon_key: str, buckets: list[dict]) -> list[Finding]:
        headers = {"apikey": anon_key, "Authorization": f"Bearer {anon_key}"}
        # Buckets explicitly marked public are meant to be world-readable —
        # only buckets NOT marked public are a potential RLS gap.
        private_buckets = [b for b in buckets if not b.get("public") and b.get("name")]
        exposed: list[tuple[str, int]] = []

        for bucket in private_buckets:
            name = bucket["name"]
            try:
                response = httpx.post(
                    f"{supabase_url}/storage/v1/object/list/{name}",
                    json={"limit": 1},
                    headers=headers,
                    timeout=self.timeout,
                )
            except httpx.RequestError:
                continue
            if response.status_code != 200:
                continue
            try:
                files = response.json()
            except ValueError:
                continue
            # An empty list is ambiguous (Supabase storage RLS silently
            # filters rather than denying), so it's not treated as proof of
            # exposure — only a non-empty result confirms readable contents.
            if isinstance(files, list) and len(files) > 0:
                exposed.append((name, len(files)))

        if exposed:
            return [
                Finding(
                    check_name="supabase-storage-exposure",
                    severity="critical",
                    category="endpoints",
                    title=f"Supabase storage bucket '{name}' listable without authorization",
                    description=(
                        f"The bucket '{name}' is not marked public, but listing its "
                        f"contents with the site's own public anon key returned "
                        f"{count} file(s). This usually means Row Level Security "
                        "policies on storage.objects are missing or too permissive."
                    ),
                    what_we_did=(
                        "Discovered the Supabase project URL and anon key referenced in "
                        f"the site's JavaScript, listed buckets via GET {supabase_url}"
                        f"/storage/v1/bucket, then queried POST {supabase_url}"
                        f"/storage/v1/object/list/{name} using that key."
                    ),
                    remediation=(
                        f"Add a Row Level Security policy on storage.objects scoping "
                        f"reads on bucket '{name}' to the owning user, or mark the "
                        "bucket public only if its contents are meant to be "
                        "world-readable."
                    ),
                )
                for name, count in exposed
            ]

        if private_buckets:
            return [Finding(
                check_name="supabase-storage-exposure",
                severity="pass",
                category="endpoints",
                title="Supabase storage buckets found, none publicly listable",
                description=(
                    f"Found {len(private_buckets)} non-public bucket(s); none returned "
                    "files when listed with the public anon key."
                ),
                what_we_did="Listed each non-public bucket with the site's public anon key and checked for returned files.",
                remediation="",
            )]

        return [self._all_buckets_public_finding(len(buckets))]

    def _no_buckets_finding(self) -> Finding:
        return Finding(
            check_name="supabase-storage-exposure",
            severity="info",
            category="endpoints",
            title="Found a Supabase backend, but no storage buckets were listable",
            description=(
                "Found a Supabase project URL and anon key, but listing storage "
                "buckets with that key didn't return any — so we couldn't confirm "
                "any buckets exist to check for missing RLS."
            ),
            what_we_did="Listed storage buckets via the Supabase Storage API using the site's public anon key.",
            remediation="",
        )

    def _all_buckets_public_finding(self, bucket_count: int) -> Finding:
        return Finding(
            check_name="supabase-storage-exposure",
            severity="info",
            category="endpoints",
            title="All storage buckets found are public",
            description=(
                f"Found {bucket_count} storage bucket(s), all marked public — "
                "there were no private buckets left to check for missing RLS."
            ),
            what_we_did="Listed storage buckets via the Supabase Storage API and checked which are marked public.",
            remediation="",
        )
