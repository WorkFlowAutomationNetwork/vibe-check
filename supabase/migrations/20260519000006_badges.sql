-- Public trust badges. One active badge per URL at a time.
-- Older rows remain as lapsed/revoked for audit trail.
create table public.badges (
  id              uuid primary key default gen_random_uuid(),
  url_id          uuid not null references public.urls on delete cascade,
  scan_id         uuid not null references public.scans on delete cascade,
  status          text not null
                    check (status in ('active', 'lapsed', 'revoked')),
  public_token    text not null unique,
  expires_at      timestamptz not null,
  created_at      timestamptz not null default now(),
  revoked_at      timestamptz
);

alter table public.badges enable row level security;
