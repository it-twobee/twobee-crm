-- Completa la 221: nessun ruolo proviene da metadati modificabili dall'utente.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, app_role)
  VALUES (NEW.id, NEW.email,
    COALESCE(NULLIF(btrim(NEW.raw_user_meta_data->>'full_name'), ''), NEW.email),
    'guest', 'guest')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- La policy UPDATE own limita le righe, non le colonne: altrimenti il browser
-- può assegnarsi app_role=admin o cambiare email nell'indirizzo del super admin.
-- Invoker, non definer: current_user è il ruolo SQL effettivo, non un claim.
CREATE OR REPLACE FUNCTION public.guard_profile_self_update()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') AND
    (to_jsonb(NEW) - ARRAY['full_name','avatar_url','phone','job_title','competencies','dashboard_config'])
      IS DISTINCT FROM
    (to_jsonb(OLD) - ARRAY['full_name','avatar_url','phone','job_title','competencies','dashboard_config'])
  THEN
    RAISE EXCEPTION 'I permessi e i dati amministrativi del profilo si modificano solo dal server autorizzato'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_profile_self_update() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_profile_self_update ON public.profiles;
CREATE TRIGGER guard_profile_self_update BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_self_update();
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.profiles FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
