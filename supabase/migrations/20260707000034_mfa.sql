-- ============================================================
-- Mandatory TOTP MFA (2026-07-07) — spec docs/superpowers/specs/2026-07-07-totp-mfa-design.md
--
-- NOT YET APPLIED to prod. Apply to a preview/branch DB first, verify the
-- enroll/challenge/recover flows, then apply to prod as part of the deliberate
-- MFA_REQUIRED rollout.
--
-- Two pieces:
--   1. profiles.mfa_enrolled_at — set server-side when a user completes TOTP
--      enrollment; the middleware enrollment gate keys off it. Added to the
--      protect_profile_sensitive_fields trigger so a user can't self-set it to
--      dodge the gate.
--   2. mfa_recovery_codes — hashed single-use backup codes. Service-role-only
--      (RLS on, no policy), mirroring the rate_limits/waitlist posture. Hashes
--      are never exposed to the client.
-- ============================================================

-- 1. Enrollment marker -------------------------------------------------------
alter table public.profiles
  add column if not exists mfa_enrolled_at timestamptz;

comment on column public.profiles.mfa_enrolled_at is
  'When the user completed TOTP MFA enrollment. Null => not enrolled (middleware '
  'forces /mfa/enroll when MFA_REQUIRED). Written only server-side (service role).';

-- Extend the sensitive-fields guard (migration 017) to cover mfa_enrolled_at.
create or replace function public.protect_profile_sensitive_fields()
returns trigger
language plpgsql
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if new.is_admin is distinct from old.is_admin then
    raise exception 'is_admin cannot be changed directly';
  end if;

  if new.plan is distinct from old.plan then
    raise exception 'plan cannot be changed directly';
  end if;

  if new.stripe_customer_id is distinct from old.stripe_customer_id then
    raise exception 'stripe_customer_id cannot be changed directly';
  end if;

  if new.stripe_subscription_id is distinct from old.stripe_subscription_id then
    raise exception 'stripe_subscription_id cannot be changed directly';
  end if;

  if new.stripe_subscription_status is distinct from old.stripe_subscription_status then
    raise exception 'stripe_subscription_status cannot be changed directly';
  end if;

  if new.mfa_enrolled_at is distinct from old.mfa_enrolled_at then
    raise exception 'mfa_enrolled_at cannot be changed directly';
  end if;

  return new;
end;
$$;

-- Trigger definition unchanged (migration 017), function body replaced above.

-- 2. Hashed single-use backup codes -----------------------------------------
create table public.mfa_recovery_codes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  code_hash  text not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

create index mfa_recovery_codes_user_id_idx on public.mfa_recovery_codes (user_id);

comment on table public.mfa_recovery_codes is
  'Hashed single-use MFA backup codes (sha256 of the normalised code). Written '
  'and read only by the service role from the MFA API routes. RLS on + no policy '
  '=> no anon/authenticated access; hashes are never exposed to the client.';

-- Service-role-only, same posture as public.rate_limits.
alter table public.mfa_recovery_codes enable row level security;
revoke all on public.mfa_recovery_codes from anon, authenticated;
