create table public.profiles (
  id                      uuid primary key references auth.users on delete cascade,
  plan                    text not null default 'free'
                            check (plan in ('free', 'starter', 'monitor')),
  stripe_customer_id      text,
  stripe_subscription_id  text,
  name                    text,
  notify_cve_matched      boolean not null default true,
  notify_scan_complete    boolean not null default false,
  notify_badge_expiry     boolean not null default true,
  notify_weekly_digest    boolean not null default false,
  default_scan_depth      text not null default 'active'
                            check (default_scan_depth in ('passive', 'active', 'deep')),
  default_rate_limit      text not null default 'polite'
                            check (default_rate_limit in ('polite', 'fast')),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- Shared helper: auto-set updated_at on any table that uses it.
-- Defined here; reused by integrations (migration 008).
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile row for every new auth.users row.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id)
  values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
