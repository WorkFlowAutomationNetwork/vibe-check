# Vercel Deploy-Hook Integration — Design Spec

**Date:** 2026-06-26
**Status:** Awaiting implementation plan

---

## Summary

Add a Vercel Deploy Hook integration so users on the Monitor plan can trigger an automatic active re-scan whenever they ship to production. The integration is webhook-based: Vibe-Check generates a secret URL per user; the user pastes it into their Vercel project's Deploy Hooks settings; Vercel POSTs to it on every deploy.

Future path to a Vercel Marketplace native integration (OAuth-based) is possible without rebuilding this — the UI and data model are forward-compatible.

---

## What Vercel Deploy Hooks Actually Do

Vercel Deploy Hooks are a URL you register in your Vercel project settings. On deploy, Vercel POSTs a small JSON payload to that URL. There are no custom auth headers — the URL itself is the credential (obscure = secret). The payload shape is:

```json
{ "type": "DEPLOYMENT", "payload": { ... } }
```

We don't need to parse the payload — it's purely a trigger. We respond `200` regardless of payload shape to avoid Vercel treating failed deliveries as errors.

---

## Architecture

```
Vercel deploy
    │
    ▼
POST /api/webhooks/vercel/[token]
    │
    ├─ Hash token → lookup integrations table
    ├─ Find user's verified, monitoring_mode=continuous URLs
    ├─ Skip any URL with a pending/running scan
    ├─ Insert scan rows + dispatch to scanner service
    ├─ Write webhook_log row
    └─ Return { queued: N }
```

The scanner dispatch reuses the existing `dispatchToScanner` pattern from `/api/webhooks/route.ts`.

---

## Data Model

Uses the existing `integrations` table — no migration required. The table already has `type` (supports `'vercel'`), `config jsonb`, `status`, and `last_triggered_at`.

**One row per user, `type = 'vercel'`.**

`config` jsonb shape:
```json
{
  "token_hash": "<sha256-hex>",
  "created_at": "<iso8601>"
}
```

The raw token is never stored. Only the SHA-256 hex digest lives in the DB.

**Token format:** `crypto.randomBytes(32).toString('hex')` — 64 hex chars. Hashed with SHA-256 before storage (same pattern as `api_keys`).

**Webhook URL shown to user:**
```
https://vibe-check-app.com/api/webhooks/vercel/<raw-token>
```

---

## New Files

### `apps/web/app/api/webhooks/vercel/[token]/route.ts`

- Extract `token` from params
- SHA-256 hash it, look up `integrations` where `type='vercel'` and `config->>'token_hash' = <hash>` and `status='active'`
- If not found → `401`
- Update `integrations.last_triggered_at = now()`
- Write a `webhook_log` row (`source='vercel'`, `integration_id`, raw payload, `scan_id` null at this point)
- Find all `urls` for that user: `verified=true`, `monitoring_mode='continuous'`, `deleted_at IS NULL`
- For each URL: skip if a scan is already `pending` or `running`; otherwise insert a `scans` row (`scan_type='active'`, `status='pending'`, `triggered_by='webhook'`) and dispatch to scanner
- Return `{ queued: N }` — always `200`, even if `queued = 0` (Vercel must not see a failure)

### `apps/web/lib/vercel-webhook.ts`

Token generation + hashing helpers, extracted so they're testable independently:

```ts
generateWebhookToken(): string        // crypto.randomBytes(32).toString('hex')
hashToken(token: string): string      // SHA-256 hex
```

### `apps/web/app/api/integrations/vercel/route.ts`

Two handlers, both require auth:

- `POST` — generate a new token, upsert an `integrations` row (`type='vercel'`, `status='active'`, config with token_hash). Returns `{ webhookUrl: string }`. If a token already exists, this regenerates it (old token immediately invalid).
- `DELETE` — set `status='revoked'` on the user's vercel integration row.

---

## UI Changes

### `apps/web/app/(app)/integrations/page.tsx`

Fetch the user's vercel integration row alongside the GitHub query. Pass `vercelIntegration` (or null) to a new `VercelCard` component.

### `apps/web/components/integrations/VercelCard.tsx`

**Disconnected state** (no integration row, or status ≠ active):
- "Connect" button → calls `POST /api/integrations/vercel` → receives webhook URL → transitions to connected state

**Connected state:**
- Shows the full webhook URL in a copy-to-clipboard input (read-only text field + copy button)
- Setup instructions: "In Vercel: Project Settings → Git → Deploy Hooks → paste this URL"
- "Last triggered: X ago" (from `last_triggered_at`) or "Never triggered"
- "Regenerate URL" button (with confirmation: warns the old URL stops working immediately)
- "Disconnect" button → calls `DELETE /api/integrations/vercel`

Component is client-side (`'use client'`) for the copy/generate interactions. Initial state is passed as a prop from the server component.

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Invalid / unknown token | `401 { error: 'Invalid token' }` |
| Valid token but user has no eligible URLs | `200 { queued: 0 }` |
| Scanner dispatch fails for a URL | Scan row left as `pending`; Celery retry picks it up. Log the dispatch failure. |
| Vercel sends malformed JSON | Catch parse error, still return `200` — it's a trigger not a data transfer |
| User not on Monitor plan | Gate at the UI (card shows "Monitor plan required"). The API route doesn't enforce plan — ownership + monitoring_mode on the URL row already acts as the gate. |

---

## Tests

`apps/web/app/api/webhooks/vercel/[token]/route.test.ts`:
- Valid token → queues scans for eligible URLs → returns `{ queued: N }`
- Valid token, all URLs already have active scans → `{ queued: 0 }` with `200`
- Invalid token → `401`
- Valid token, user has no `monitoring_mode=continuous` URLs → `{ queued: 0 }`
- Malformed body → still `200`

`apps/web/lib/vercel-webhook.test.ts`:
- `generateWebhookToken` returns 64 hex chars
- `hashToken` is deterministic and matches SHA-256

---

## Out of Scope

- Vercel payload parsing (branch name, environment, deploy URL) — purely a trigger for now
- Per-URL webhook granularity — one URL per user for now; can be revisited
- Vercel Marketplace / OAuth native integration — future path, architecture is compatible
- Slack / email notification on trigger — separate notification spec
