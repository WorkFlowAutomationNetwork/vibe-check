-- Migration 17: Prevent users from self-escalating privileges via direct
-- profile updates. The "users can update own profile" RLS policy
-- (migration 011) only checks auth.uid() = id, so without this trigger
-- any authenticated user could PATCH their own row and set
-- is_admin = true, plan = 'monitor', or rewrite their own stripe_* ids.
--
-- All legitimate writers of these columns already use the service-role
-- client (admin user routes, Stripe webhook handler), which is exempted
-- via auth.role() = 'service_role'.

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

  return new;
end;
$$;

drop trigger if exists profiles_protect_sensitive_fields on public.profiles;
create trigger profiles_protect_sensitive_fields
  before update on public.profiles
  for each row execute function public.protect_profile_sensitive_fields();
