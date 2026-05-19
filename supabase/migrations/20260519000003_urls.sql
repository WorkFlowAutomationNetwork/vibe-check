create table public.urls (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users on delete cascade,
  url                   text not null,
  verified              boolean not null default false,
  verification_token    text not null unique,
  verification_method   text check (verification_method in ('dns', 'file', 'meta')),
  verified_at           timestamptz,
  label                 text,
  monitoring_mode       text not null default 'one_off'
                          check (monitoring_mode in ('one_off', 'continuous')),
  created_at            timestamptz not null default now(),
  deleted_at            timestamptz
);

-- Prevent duplicate URLs per user; ignores soft-deleted rows.
create unique index urls_user_url_unique
  on public.urls (user_id, url)
  where deleted_at is null;

alter table public.urls enable row level security;
