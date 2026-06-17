-- Migration 19: persist Terms/Privacy acceptance (security review D7).
--
-- The sign-up form records acceptance into the auth user's metadata
-- (raw_user_meta_data.terms_accepted_at / terms_version) at the moment of
-- consent. This migration adds queryable columns on profiles and extends the
-- existing handle_new_user() trigger to copy the values across on profile
-- creation, so acceptance is auditable from the profiles table.

alter table public.profiles
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version     text;

-- These columns are set from auth metadata by the trigger (service-role / definer
-- context). They are NOT in the protect_profile_sensitive_fields list because a
-- user legitimately recording their own acceptance is fine; if you want them
-- immutable post-set, add them to that trigger as well.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, terms_accepted_at, terms_version)
  values (
    new.id,
    (new.raw_user_meta_data ->> 'terms_accepted_at')::timestamptz,
    new.raw_user_meta_data ->> 'terms_version'
  );
  return new;
end;
$$;
