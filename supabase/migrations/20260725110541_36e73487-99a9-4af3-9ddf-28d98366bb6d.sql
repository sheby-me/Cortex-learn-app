
CREATE OR REPLACE FUNCTION public.promote_existing_admin_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid;
BEGIN
  SELECT id INTO _uid FROM auth.users WHERE lower(email) = lower(NEW.email) LIMIT 1;
  IF _uid IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'admin')
      ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_admin_email_added ON public.admin_emails;
CREATE TRIGGER on_admin_email_added
AFTER INSERT ON public.admin_emails FOR EACH ROW EXECUTE FUNCTION public.promote_existing_admin_email();
