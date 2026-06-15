-- Migration 16: Auto-admin patrickcampbell@workflowautomationnetwork.com
-- This account is used for testing with no usage restrictions.
-- If the account already exists, set is_admin immediately.
-- If it signs up later, a trigger handles it.

UPDATE public.profiles
SET is_admin = true
WHERE id = (
  SELECT id FROM auth.users
  WHERE email = 'patrickcampbell@workflowautomationnetwork.com'
  LIMIT 1
);

-- Trigger function: set is_admin=true for admin email on profile creation
CREATE OR REPLACE FUNCTION public.auto_admin_on_signup()
RETURNS TRIGGER AS $$
DECLARE
  user_email text;
BEGIN
  SELECT email INTO user_email FROM auth.users WHERE id = NEW.id;
  IF user_email = 'patrickcampbell@workflowautomationnetwork.com' THEN
    NEW.is_admin := true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fire BEFORE INSERT on profiles so we can modify NEW.is_admin in the same operation
DROP TRIGGER IF EXISTS auto_admin_signup ON public.profiles;
CREATE TRIGGER auto_admin_signup
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_admin_on_signup();
