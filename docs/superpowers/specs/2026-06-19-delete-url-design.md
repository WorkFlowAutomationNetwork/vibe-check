# Design: Delete a URL (`DELETE /api/urls/[id]` + dashboard remove button)

**Date:** 2026-06-19
**Status:** Approved (design)
**Gap addressed:** `PROJECT_STATUS.md` → Gaps #1.

---

## Problem

A user who adds a URL and then realises it's a typo has no way to remove it. On the
Free/Starter plan the 1-URL limit then locks them out entirely. We need a remove path,
but only *before the URL has been used* — once a scan exists the URL has history
(scans, findings, possibly a badge) and should not silently disappear.

## Requirements

1. A URL can be removed **only if it has zero scans of any status** (`pending`,
   `running`, `completed`, `failed`). Any scan blocks removal.
2. Removal is a **hard delete** of the `urls` row.
3. The remove control appears on the dashboard URL card only when the URL has no scans.
4. Deletion is logged to the activity feed as a `url_removed` event.

## Decisions (locked)

- **Hard delete**, not soft delete. Requires a new user-level `DELETE` RLS policy
  (today only admins can delete URLs). The no-scans guard is encoded in the policy's
  `USING` clause so the rule is enforced at the database layer, not only in the route.
- **Any scan blocks removal** (not just completed) — avoids a race where a scan is
  mid-flight but the card still offers a delete button.

---

## Components

### 1. Migration — `supabase/migrations/20260619000021_urls_user_delete_policy.sql`

Add a user `DELETE` policy on `public.urls`, scoped to the owner AND to URLs with no
scans:

```sql
create policy "users can delete own urls without scans"
  on public.urls for delete
  using (
    auth.uid() = user_id
    and not exists (
      select 1 from public.scans where scans.url_id = urls.id
    )
  );
```

- Ownership + no-scans both enforced in the database. A user-scoped client `DELETE`
  against a URL that has scans simply matches **zero rows** (RLS filters it out),
  which the route turns into a clean 409.
- No cascade concern in practice: the guard prevents deleting any URL that has
  scans/badges. (The existing `scans`/`badges` FKs are `on delete cascade` and
  `activity_log.url_id` is `on delete set null` regardless.)

### 2. API route — `apps/web/app/api/urls/[id]/route.ts` (new file)

`export async function DELETE(request: Request, { params }: { params: { id: string } })`

Flow (mirrors the auth/validation style of the existing `POST` in `urls/route.ts`):

1. `createServerClient()`; `getUser()` → **401** if no user.
2. Fetch the URL row: `from('urls').select('id, url').eq('id', params.id)
   .eq('user_id', user.id).is('deleted_at', null).maybeSingle()`.
   - Not found / not owned → **404** `{ error: 'not_found' }`.
3. Count scans: `from('scans').select('id', { count: 'exact', head: true })
   .eq('url_id', params.id)`. If `count > 0` → **409** `{ error: 'url_has_scans' }`.
4. `from('urls').delete().eq('id', params.id).eq('user_id', user.id)`.
   - On DB error → **500** `{ error: 'delete_failed' }`.
5. Log activity **after** delete, with the URL string in `payload` and **no `url_id`**
   (the row is gone; `activity_log.url_id` FK would reject a dangling id even with
   `set null` on delete, because the insert references a now-missing row):
   `logActivity({ userId: user.id, eventType: 'url_removed', payload: { url: row.url } })`.
6. Return **200** `{ ok: true }`.

### 3. UI — `apps/web/components/dashboard/RemoveUrlButton.tsx` (new client component)

- Props: `{ urlId: string; urlLabel: string }`.
- Renders a `btn-mini ghost` "✕ Remove".
- On first click, swap to an inline confirm ("Remove? ✓ / ✗") — **no native
  `confirm()`** (browser modal dialogs block the page / break automation).
- On confirm: `fetch('/api/urls/' + urlId, { method: 'DELETE' })`, then
  `router.refresh()` to re-render the server component. On non-OK, show a brief inline
  error and re-enable.

### 4. Dashboard wiring — `apps/web/app/(app)/dashboard/page.tsx`

- Build `hasScanByUrlId: Set<string>` from `allScans` (any status) — distinct from the
  existing `latestScanByUrlId` map which only tracks `completed` scans.
- In the card footer `.righty`, render `<RemoveUrlButton>` when
  `!hasScanByUrlId.has(url.id)`. (A URL with no scans never shows View report / Re-scan
  today, so the footer has room.)
- Add `url_removed` to `EVENT_DISPLAY`:
  `url_removed: { glyph: '✕', label: 'URL removed', cls: '' }`.

---

## Error handling

| Condition | Status | Body |
|---|---|---|
| No auth | 401 | `{ error: 'Unauthorized' }` |
| URL not found / not owned | 404 | `{ error: 'not_found' }` |
| URL has ≥1 scan | 409 | `{ error: 'url_has_scans' }` |
| DB delete error | 500 | `{ error: 'delete_failed' }` |
| Success | 200 | `{ ok: true }` |

Activity logging is best-effort (existing `logActivity` swallows failures) and never
changes the response.

## Testing

`apps/web` has **no JS test harness today** (no `test` script, no test files; the
`npm test` in CLAUDE.md is aspirational). Two options:

- **(A) Verification without a new harness (recommended for this small change):**
  `npm run type-check` + `npm run build` must pass, then a manual dashboard flow:
  add a URL → remove button appears → remove → URL gone + `url_removed` in activity;
  add a URL → run a scan → remove button absent; confirm DELETE on a scanned URL
  returns 409 (via devtools).
- **(B) Stand up `vitest` + a route unit test** covering the four paths (401 / 404 /
  409-has-scans / 200). More durable but adds test infrastructure that doesn't exist
  yet — a larger decision than this feature.

Recommendation: ship with (A); track (B) as a separate "add web test harness" task so
it's a deliberate choice rather than a side effect of this PR.

## Out of scope

- Bulk delete / multi-select.
- Deleting URLs that have scans (would need an archive/"delete with history" flow —
  separate spec).
- Soft-delete/undo.
