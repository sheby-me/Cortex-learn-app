
-- Admin allowlist
CREATE TABLE public.admin_emails (
  email text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_emails TO authenticated;
GRANT ALL ON public.admin_emails TO service_role;
ALTER TABLE public.admin_emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage admin_emails" ON public.admin_emails FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Tutor applications
CREATE TABLE public.tutor_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  bio text,
  credentials text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by uuid,
  review_notes text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tutor_applications TO authenticated;
GRANT ALL ON public.tutor_applications TO service_role;
ALTER TABLE public.tutor_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own application" ON public.tutor_applications FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users insert own application" ON public.tutor_applications FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own pending application" ON public.tutor_applications FOR UPDATE TO authenticated
  USING ((auth.uid() = user_id AND status = 'pending') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK ((auth.uid() = user_id AND status = 'pending') OR public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;
CREATE TRIGGER tutor_apps_updated BEFORE UPDATE ON public.tutor_applications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Updated new-user trigger: allowlist admins, tutors become pending applications
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  requested_role public.app_role;
  is_admin_email boolean;
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url');

  BEGIN
    requested_role := COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'student');
  EXCEPTION WHEN others THEN requested_role := 'student';
  END;

  SELECT EXISTS(SELECT 1 FROM public.admin_emails WHERE lower(email) = lower(NEW.email))
    INTO is_admin_email;

  IF is_admin_email THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
      ON CONFLICT DO NOTHING;
  ELSIF requested_role = 'tutor' THEN
    -- Tutors start as students and must be approved by an admin
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'student')
      ON CONFLICT DO NOTHING;
    INSERT INTO public.tutor_applications (user_id, bio, credentials)
    VALUES (NEW.id,
      NEW.raw_user_meta_data->>'tutor_bio',
      NEW.raw_user_meta_data->>'tutor_credentials')
    ON CONFLICT (user_id) DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'student')
      ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Approve / reject actions (admin-only)
CREATE OR REPLACE FUNCTION public.approve_tutor_application(_app_id uuid, _notes text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can approve tutor applications';
  END IF;
  UPDATE public.tutor_applications
  SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), review_notes = _notes
  WHERE id = _app_id RETURNING user_id INTO _uid;
  IF _uid IS NULL THEN RAISE EXCEPTION 'Application not found'; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'tutor')
    ON CONFLICT DO NOTHING;
END; $$;

CREATE OR REPLACE FUNCTION public.reject_tutor_application(_app_id uuid, _notes text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can reject tutor applications';
  END IF;
  UPDATE public.tutor_applications
  SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), review_notes = _notes
  WHERE id = _app_id;
END; $$;

REVOKE ALL ON FUNCTION public.approve_tutor_application(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_tutor_application(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.reject_tutor_application(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_tutor_application(uuid, text) TO authenticated;
