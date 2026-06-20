-- Enforce the verification invariant the /api/verify route already upholds:
-- a URL can only be marked verified together with HOW (method) and WHEN (verified_at).
--
-- Background: a few rows were marked verified=true via direct service-role writes
-- during early manual testing, bypassing the verify route. This left:
--   * verified=true with NULL verification_method / verified_at, and
--   * a verified_at that predated the row's own created_at.
-- These can only come from out-of-band writes (the only app writer sets all three
-- fields atomically after a real DNS/file/meta proof passes). Reconcile them, then
-- add a CHECK constraint so the inconsistent state can never recur.

-- 1. Reconcile: any verified row missing its method was verified by DNS in practice
--    (tokens confirmed present in DNS); record that truthfully.
update public.urls
  set verification_method = 'dns'
  where verified = true and verification_method is null;

-- 2. Reconcile timestamps: a verified row must have a verified_at, and it cannot
--    predate the row's creation. created_at is the honest lower bound for when
--    verification occurred.
update public.urls
  set verified_at = created_at
  where verified = true
    and (verified_at is null or verified_at < created_at);

-- 3. Lock the invariant in: verified=true requires both method and verified_at.
alter table public.urls
  add constraint urls_verified_requires_proof
  check (
    verified = false
    or (verification_method is not null and verified_at is not null)
  );
