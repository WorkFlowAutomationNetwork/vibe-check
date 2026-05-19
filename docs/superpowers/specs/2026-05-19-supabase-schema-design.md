# Vibe-Check — Supabase Schema Design

**Date:** 2026-05-19  
**Status:** Approved  
**Scope:** All Postgres tables, RLS rules, enums, and relationships for the Supabase database.

---

## Context

Vibe-Check is a SaaS security auditing tool. Users add URLs, verify ownership, and receive graded security reports. The database backs two services: `apps/web` (Next.js on Vercel) via the anon/service-role Supabase client, and `apps/scanner` (Python/FastAPI on Railway) via the service-role key only.

RLS is enabled on every table. The scanner service uses the service-role key (bypasses RLS). The web app uses the anon key for authenticated reads and writes scoped to the calling user.

---

## Decisions (all approved)

1. Notification prefs + scan defaults stored as columns on `profiles` (not jsonb).
2. `billing_interval` delegated entirely to Stripe — not stored locally.
3. URLs use soft delete (`deleted_at`) to preserve scan history.
4. `urls.url` stored without scheme (always HTTPS; scheme is a display concern).
5. Public report sharing uses the scan UUID directly + `is_public` flag (no separate share token column).
6. All 180 scan checks stored as rows in `findings` (not a separate `scan_checks` table). Description/remediation fields are nullable for low-detail checks.
7. `findings.first_seen_at` computed and stored at write time by the scanner (looks up prior findings for the same URL + check_name).

---

## Tables

### `profiles`

Extends `auth.users`. Created automatically via trigger on new user signup.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | references auth.users |
| plan | text NOT NULL | `'free'` \| `'starter'` \| `'monitor'` |
| stripe_customer_id | text | nullable |
| stripe_subscription_id | text | nullable |
| name | text | nullable — user display name from settings |
| notify_cve_matched | bool | default true |
| notify_scan_complete | bool | default false |
| notify_badge_expiry | bool | default true |
| notify_weekly_digest | bool | default false |
| default_scan_depth | text | default `'active'` — `'passive'` \| `'active'` \| `'deep'` |
| default_rate_limit | text | default `'polite'` — `'polite'` \| `'fast'` |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |

**RLS:** Users can read and update their own row only. Service role can read/write all.

---

### `urls`

One row per URL a user has added for scanning.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | gen_random_uuid() |
| user_id | uuid NOT NULL | references auth.users |
| url | text NOT NULL | stored without scheme e.g. `acme-app.vercel.app` |
| verified | bool | default false |
| verification_token | text NOT NULL unique | e.g. `k8sn3p2-9f1a-c402-d7e1-8b3a91f02e44` |
| verification_method | text | nullable — `'dns'` \| `'file'` \| `'meta'` |
| verified_at | timestamptz | nullable |
| label | text | nullable — user-set e.g. `'production'`, `'staging'` |
| monitoring_mode | text | default `'one_off'` — `'one_off'` \| `'continuous'` |
| created_at | timestamptz | default now() |
| deleted_at | timestamptz | nullable — soft delete |

**RLS:** Users can read/write/soft-delete their own rows. Unique constraint on `(user_id, url)` where `deleted_at IS NULL`.

---

### `scans`

One row per scan run. Idempotent — running the same URL twice produces two rows.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | gen_random_uuid() |
| url_id | uuid NOT NULL | references urls |
| user_id | uuid NOT NULL | references auth.users — denormalized for RLS |
| scan_type | text NOT NULL | `'passive'` \| `'active'` \| `'deep'` |
| status | text NOT NULL | default `'pending'` — `'pending'` \| `'running'` \| `'completed'` \| `'failed'` |
| grade | text | nullable — `'A+'` \| `'A'` \| `'B+'` \| `'B'` \| `'C+'` \| `'C'` \| `'D'` \| `'F'` |
| score | numeric(5,2) | nullable — underlying 0–100 score driving the grade |
| triggered_by | text | default `'manual'` — `'manual'` \| `'webhook'` \| `'api'` |
| rate_limit_mode | text | nullable — `'polite'` \| `'fast'` |
| checks_total | int | nullable — total checks run (e.g. 180) |
| started_at | timestamptz | nullable |
| completed_at | timestamptz | nullable |
| duration_ms | int | nullable |
| scanner_version | text | nullable |
| is_public | bool | default false — controls anon RLS visibility |
| pdf_storage_path | text | nullable — path in Supabase Storage |
| created_at | timestamptz | default now() |

**RLS:**
- Authenticated users can read scans where `user_id = auth.uid()`.
- Anon can read scans where `is_public = true` (selected columns only: id, url_id, grade, score, completed_at, checks_total — not raw findings detail).
- Service role can read/write all.

One active scan per URL enforced at the DB level with a partial unique index:
`CREATE UNIQUE INDEX one_active_scan_per_url ON scans (url_id) WHERE status IN ('pending', 'running');`

---

### `findings`

All check results from a scan — both the 15 notable findings shown in the report cards and the full 180 checks shown in the checks table. Description/remediation are nullable for low-detail pass checks.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | gen_random_uuid() |
| scan_id | uuid NOT NULL | references scans |
| check_name | text NOT NULL | e.g. `'tls.hsts'`, `'headers.csp'`, `'ai.prompt_injection'` |
| category | text NOT NULL | `'headers'` \| `'transport'` \| `'ai'` \| `'auth'` \| `'cors'` \| `'deps'` \| `'endpoints'` \| `'secrets'` |
| severity | text NOT NULL | `'critical'` \| `'medium'` \| `'low'` \| `'info'` \| `'pass'` |
| result | text NOT NULL | `'pass'` \| `'fail'` \| `'warn'` |
| title | text NOT NULL | human-readable finding name |
| method | text | nullable — e.g. `'HEAD / → header inspect'` |
| duration_ms | int | nullable |
| description | text | nullable — "What it is" |
| what_we_did | text | nullable — "What we did" |
| remediation | text | nullable — "Recommended fix" |
| first_seen_at | timestamptz NOT NULL | when this check_name first returned non-pass for this URL; scanner computes at write time |
| metadata | jsonb | nullable — CVE IDs, payload counts, raw scanner output refs |

**RLS:** Users can read findings for scans they own (`scan_id → scans.user_id = auth.uid()`). Anon can read findings for public scans (severity and title only — not description/what_we_did/remediation to prevent exploit farming).

Index: `(scan_id, category, severity)` for report page queries.

---

### `badges`

Public trust badges. One active badge per URL at a time; older entries stay as `lapsed`/`revoked`.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | gen_random_uuid() |
| url_id | uuid NOT NULL | references urls |
| scan_id | uuid NOT NULL | references scans — the qualifying scan |
| status | text NOT NULL | `'active'` \| `'lapsed'` \| `'revoked'` |
| public_token | text NOT NULL unique | opaque token for the badge embed endpoint |
| expires_at | timestamptz NOT NULL | 30 days from scan for starter; continuously refreshed for monitor |
| created_at | timestamptz | default now() |
| revoked_at | timestamptz | nullable |

**RLS:** Users can read badges for their own URLs. Anon can read rows where `status = 'active'` via a filtered view `public_badges_view` (exposes only: url_id, status, expires_at, public_token — keyed by public_token for the badge endpoint).

---

### `activity_log`

Event feed shown on the dashboard. Append-only.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | gen_random_uuid() |
| user_id | uuid NOT NULL | references auth.users |
| url_id | uuid | nullable — references urls |
| scan_id | uuid | nullable — references scans |
| event_type | text NOT NULL | see below |
| payload | jsonb NOT NULL | default `'{}'` — event-specific structured data |
| created_at | timestamptz | default now() |

**Event types and payload shapes:**

| event_type | payload keys |
|---|---|
| `url_added` | `{ url }` |
| `url_verified` | `{ url, method }` |
| `scan_started` | `{ scan_type, triggered_by }` |
| `scan_completed` | `{ grade, prev_grade, checks_total, issues_resolved }` |
| `scan_failed` | `{ error }` |
| `cve_matched` | `{ package, version, cve_id, severity, fix_version }` |
| `badge_renewed` | `{ expires_at, public_token }` |
| `badge_lapsed` | `{ expired_at }` |
| `fix_applied` | `{ finding_id, check_name, commit_ref, branch }` |

**RLS:** Users can read their own rows. Insert via service role only (scanner and web API routes write events; no client-side inserts).

Index: `(user_id, created_at DESC)` for dashboard feed.

---

### `integrations`

Connected third-party services. Config jsonb is encrypted at the application layer before insert.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | gen_random_uuid() |
| user_id | uuid NOT NULL | references auth.users |
| type | text NOT NULL | `'github'` \| `'vercel'` \| `'netlify'` \| `'slack'` |
| status | text NOT NULL | `'active'` \| `'disconnected'` \| `'pending'` |
| config | jsonb NOT NULL | default `'{}'` — encrypted tokens, webhook secrets, channel IDs |
| last_triggered_at | timestamptz | nullable |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |

**Config shapes by type:**

| type | config keys |
|---|---|
| github | `{ access_token, repos: [{ owner, name }], connected_at }` |
| vercel | `{ webhook_secret, projects: [{ name, webhook_url }] }` |
| netlify | `{ webhook_secret, sites: [{ name, webhook_url }] }` |
| slack | `{ access_token, channel_id, channel_name, team_id }` |

**RLS:** Users can read/write their own integrations. No direct client insert of config — web API routes handle OAuth callbacks server-side.

---

### `webhook_log`

Incoming deploy hook history. Append-only. Shown in the integrations screen (last 5 rows, full log paginated).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | gen_random_uuid() |
| integration_id | uuid NOT NULL | references integrations |
| source | text NOT NULL | `'Vercel'` \| `'GitHub'` \| `'Netlify'` \| `'api'` |
| payload | jsonb NOT NULL | raw incoming webhook body |
| scan_id | uuid | nullable — references scans (set when scan triggered) |
| action | text | nullable — human summary e.g. `'prod deploy · scan queued'` |
| status | text NOT NULL | `'SCAN_QUEUED'` \| `'SCAN_DONE'` \| `'IGNORED'` |
| response_code | int | nullable |
| created_at | timestamptz | default now() |

**RLS:** Users can read webhook_log rows for their own integrations (via integration_id → integrations.user_id).

---

### `api_keys`

User API keys for CI/programmatic scan triggering. Raw key never stored — only bcrypt hash.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | gen_random_uuid() |
| user_id | uuid NOT NULL | references auth.users |
| key_hash | text NOT NULL | bcrypt hash |
| key_prefix | text NOT NULL | first ~16 chars for UI display e.g. `'vc_live_sk_8f3a'` |
| name | text | nullable — user label e.g. `'CI pipeline'` |
| last_used_at | timestamptz | nullable |
| created_at | timestamptz | default now() |
| revoked_at | timestamptz | nullable |

**RLS:** Users can read/write their own keys. Revocation sets `revoked_at`; rows are never hard-deleted (audit trail).

---

## Migrations order

1. Enable extensions: `uuid-ossp`, `pgcrypto`
2. Create `profiles` table + trigger to create profile on auth.user insert
3. Create `urls` table
4. Create `scans` table
5. Create `findings` table + index
6. Create `badges` table + `public_badges_view`
7. Create `activity_log` table + index
8. Create `integrations` table
9. Create `webhook_log` table
10. Create `api_keys` table
11. Apply RLS policies to all tables
12. Insert seed data (`supabase/seed.sql`)

---

## Out of scope

- Stripe invoice history is read from the Stripe API at query time — no local invoices table.
- Billing interval (monthly/annual) tracked in Stripe only.
- Scanner IP allowlist published as static content at `/trust` — not DB-driven.
