-- User API keys for programmatic scan triggering.
-- Raw key is never stored. key_hash = bcrypt hash (computed by app layer).
-- key_prefix is the first ~16 chars, safe to display in the UI.
-- Rows are never hard-deleted; revoked_at marks revocation for audit trail.
create table public.api_keys (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade,
  key_hash      text not null,
  key_prefix    text not null,
  name          text,
  last_used_at  timestamptz,
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz
);

alter table public.api_keys enable row level security;
