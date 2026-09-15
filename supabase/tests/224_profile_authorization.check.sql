-- Solo staging: nessun account reale, ogni fixture è annullata.
BEGIN;
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('e0000000-0000-4000-8000-000000000001','roles-absent@example.invalid','{}'),
 ('e0000000-0000-4000-8000-000000000002','roles-forged@example.invalid','{"role":"admin","app_role":"super_admin","full_name":"Prova"}'),
 ('e0000000-0000-4000-8000-000000000003','roles-invalid@example.invalid','{"app_role":"inventato"}'),
 ('e0000000-0000-4000-8000-000000000004','roles-null@example.invalid',NULL);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.profiles WHERE email LIKE 'roles-%@example.invalid'
      AND role='guest' AND app_role='guest') <> 4 THEN
    RAISE EXCEPTION 'Il trigger ha accettato ruoli non autorizzati o perso una fixture';
  END IF;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','e0000000-0000-4000-8000-000000000002',true);
DO $$ DECLARE col text; BEGIN
  FOREACH col IN ARRAY ARRAY['role','app_role','email','is_active'] LOOP
    BEGIN
      EXECUTE format('UPDATE public.profiles SET %I = %s WHERE id=auth.uid()',col,
        CASE col WHEN 'is_active' THEN 'false' WHEN 'email' THEN quote_literal('forged@example.invalid') ELSE quote_literal('admin') END);
      RAISE EXCEPTION 'Colonna protetta modificabile: %',col USING ERRCODE='XX000';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  END LOOP;
  UPDATE public.profiles SET full_name='Nome aggiornato',phone='02123',job_title='Referente',
    competencies=ARRAY['Test'],dashboard_config='{}' WHERE id=auth.uid();
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND full_name='Nome aggiornato') THEN
    RAISE EXCEPTION 'Modifica personale bloccata';
  END IF;
END $$;
RESET ROLE;
SET LOCAL ROLE service_role;
UPDATE public.profiles SET role='team',app_role='manager'
  WHERE id='e0000000-0000-4000-8000-000000000002';
RESET ROLE;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id='e0000000-0000-4000-8000-000000000002'
    AND role='team' AND app_role='manager') THEN RAISE EXCEPTION 'Assegnazione server bloccata'; END IF;
END $$;
ROLLBACK;
