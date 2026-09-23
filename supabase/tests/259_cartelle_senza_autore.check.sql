-- Solo database di staging. NON eseguire sul progetto Supabase di produzione.
-- Prerequisito: migration 244, 246, 250, 251, 254, 256, 257 e 259. Tutto annullato a fine suite.
BEGIN;

CREATE FUNCTION pg_temp.ok(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', label; END IF; END;
$$;
CREATE FUNCTION pg_temp.no(statement text, expected_state text DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
DECLARE rejected boolean := false; actual_state text;
BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS actual_state = RETURNED_SQLSTATE;
    IF expected_state IS NOT NULL AND actual_state <> expected_state THEN RAISE; END IF;
    rejected := true;
  END;
  PERFORM pg_temp.ok(rejected, 'operazione doveva essere rifiutata: ' || statement);
END;
$$;
CREATE FUNCTION pg_temp.as_actor(actor text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.headers', CASE WHEN actor IS NULL THEN '{}' ELSE json_build_object('x-actor-id', actor)::text END, true);
$$;

INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('f2590000-0000-4000-8000-000000000001','autore-admin@example.invalid','{}'),
 ('f2590000-0000-4000-8000-000000000002','autore-che-se-ne-va@example.invalid','{}'),
 ('f2590000-0000-4000-8000-000000000003','autore-che-resta@example.invalid','{}');
UPDATE public.profiles SET role='admin',app_role='super_admin',is_active=true WHERE id='f2590000-0000-4000-8000-000000000001';
UPDATE public.profiles SET role='team',app_role='junior',is_active=true WHERE id IN
 ('f2590000-0000-4000-8000-000000000002','f2590000-0000-4000-8000-000000000003');
SELECT set_config('request.jwt.claim.sub','',true);
INSERT INTO public.clients(id,company_name,workspace_hidden) VALUES
 ('f2591000-0000-4000-8000-000000000001','Azienda con cartelle',false);

SELECT pg_temp.as_actor('f2590000-0000-4000-8000-000000000002');
INSERT INTO public.portal_material_folders(id,client_id,source,path,created_by) VALUES
 ('f2592000-0000-4000-8000-000000000001','f2591000-0000-4000-8000-000000000001','team','Brand','f2590000-0000-4000-8000-000000000002');

-- ── Una cartella si crea ancora solo firmata ───────────────────────────────
SELECT pg_temp.no($q$INSERT INTO public.portal_material_folders(client_id,source,path,created_by) VALUES ('f2591000-0000-4000-8000-000000000001','team','Senza firma',NULL)$q$,'42501');

-- ── L'autore non si riscrive, e lo slegamento non fa passare altro ──────────
SELECT pg_temp.no($q$UPDATE public.portal_material_folders SET created_by='f2590000-0000-4000-8000-000000000003' WHERE id='f2592000-0000-4000-8000-000000000001'$q$,'P0001');
SELECT pg_temp.no($q$UPDATE public.portal_material_folders SET created_by=NULL, source='cliente' WHERE id='f2592000-0000-4000-8000-000000000001'$q$,'P0001');
SELECT pg_temp.no($q$UPDATE public.portal_material_folders SET created_by=NULL, client_id='f2591000-0000-4000-8000-000000000001', created_at=now() - interval '1 day' WHERE id='f2592000-0000-4000-8000-000000000001'$q$,'P0001');
-- Nemmeno un rinomina passa dalla porta dello slegamento: chi lo fa deve essere
-- dello staff, e senza attore non lo è.
SELECT pg_temp.as_actor(NULL);
SELECT pg_temp.no($q$UPDATE public.portal_material_folders SET created_by=NULL, path='Rinominata' WHERE id='f2592000-0000-4000-8000-000000000001'$q$,'42501');

-- ── Chi l'ha creata si elimina, e la cartella resta ─────────────────────────
-- Come fa `eliminaMembro`: il profilo si cancella con l'admin nell'header.
SELECT pg_temp.as_actor('f2590000-0000-4000-8000-000000000001');
DELETE FROM public.profiles WHERE id='f2590000-0000-4000-8000-000000000002';
SELECT pg_temp.ok((SELECT created_by IS NULL AND path='Brand' AND source='team'
  FROM public.portal_material_folders WHERE id='f2592000-0000-4000-8000-000000000001'),
  'la cartella resta dov''era, con l''autore slegato');

-- ── Una cartella senza autore si organizza come le altre ────────────────────
SELECT pg_temp.ok(public.portal_material_folder_move('f2591000-0000-4000-8000-000000000001','team','Brand','Marchio')=0,
  'la cartella senza autore si rinomina');
SELECT pg_temp.ok((SELECT path='Marchio' AND created_by IS NULL
  FROM public.portal_material_folders WHERE id='f2592000-0000-4000-8000-000000000001'),
  'rinominata, e resta senza autore invece di prendere quello di chi rinomina');
SELECT pg_temp.ok(public.portal_material_folder_delete('f2591000-0000-4000-8000-000000000001','team','Marchio')=1,
  'e si elimina, se è vuota');

ROLLBACK;
