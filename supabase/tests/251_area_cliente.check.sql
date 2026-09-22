-- Solo database di staging. NON eseguire sul progetto Supabase di produzione.
-- Prerequisito: migration 244, 249, 250 e 251. Tutto annullato a fine suite.
BEGIN;

CREATE FUNCTION pg_temp.check_area(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', label; END IF; END;
$$;
CREATE FUNCTION pg_temp.reject_area(statement text, expected_state text DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
DECLARE rejected boolean := false; actual_state text;
BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS actual_state = RETURNED_SQLSTATE;
    IF expected_state IS NOT NULL AND actual_state <> expected_state THEN RAISE; END IF;
    rejected := true;
  END;
  PERFORM pg_temp.check_area(rejected, 'operazione doveva essere rifiutata: ' || statement);
END;
$$;

INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('f2510000-0000-4000-8000-000000000001','area-admin@example.invalid','{}'),
 ('f2510000-0000-4000-8000-000000000002','area-referente@example.invalid','{}'),
 ('f2510000-0000-4000-8000-000000000003','area-limitato@example.invalid','{}'),
 ('f2510000-0000-4000-8000-000000000004','area-lettore@example.invalid','{}'),
 ('f2510000-0000-4000-8000-000000000005','area-junior@example.invalid','{}'),
 ('f2510000-0000-4000-8000-000000000006','area-inattivo@example.invalid','{}');
UPDATE public.profiles SET role='client',app_role='client',is_active=true WHERE email LIKE 'area-%@example.invalid';
UPDATE public.profiles SET role='admin',app_role='super_admin' WHERE id='f2510000-0000-4000-8000-000000000001';
UPDATE public.profiles SET role='team',app_role='junior' WHERE id='f2510000-0000-4000-8000-000000000005';
UPDATE public.profiles SET role='team',app_role='manager',is_active=false WHERE id='f2510000-0000-4000-8000-000000000006';
SELECT set_config('request.headers','{"x-actor-id":"f2510000-0000-4000-8000-000000000001"}',true);
SELECT set_config('request.jwt.claim.sub','',true);

INSERT INTO public.clients(id,company_name) VALUES
 ('f2511000-0000-4000-8000-000000000001','Azienda area A'),
 ('f2511000-0000-4000-8000-000000000002','Azienda area B');
INSERT INTO public.projects(id,client_id,name,area,portal_title,portal_published_at,portal_published_by) VALUES
 ('f2512000-0000-4000-8000-000000000001','f2511000-0000-4000-8000-000000000001','INTERNO','digital','Sito',now(),'f2510000-0000-4000-8000-000000000001'),
 ('f2512000-0000-4000-8000-000000000002','f2511000-0000-4000-8000-000000000002','ALTRO','digital','Altro',now(),'f2510000-0000-4000-8000-000000000001');
INSERT INTO public.portal_memberships(id,client_id,profile_id,portal_role,project_scope,created_by) VALUES
 ('f2515000-0000-4000-8000-000000000001','f2511000-0000-4000-8000-000000000001','f2510000-0000-4000-8000-000000000002','referente','all','f2510000-0000-4000-8000-000000000001'),
 ('f2515000-0000-4000-8000-000000000002','f2511000-0000-4000-8000-000000000001','f2510000-0000-4000-8000-000000000003','collaboratore','selected','f2510000-0000-4000-8000-000000000001'),
 ('f2515000-0000-4000-8000-000000000003','f2511000-0000-4000-8000-000000000001','f2510000-0000-4000-8000-000000000004','lettore','all','f2510000-0000-4000-8000-000000000001');
INSERT INTO public.portal_project_access VALUES
 ('f2515000-0000-4000-8000-000000000002','f2511000-0000-4000-8000-000000000001','f2512000-0000-4000-8000-000000000001');

INSERT INTO public.files(id,object_key,folder,entity_type,entity_id,name,mime,size,uploaded_by) VALUES
 ('f2516000-0000-4000-8000-000000000001','materiali/a/logo.svg.png','materiali','client','f2511000-0000-4000-8000-000000000001','logo.png','image/png',10,'f2510000-0000-4000-8000-000000000002'),
 ('f2516000-0000-4000-8000-000000000002','materiali/a/design-system.pdf','materiali','client','f2511000-0000-4000-8000-000000000001','design-system.pdf','application/pdf',20,'f2510000-0000-4000-8000-000000000001'),
 ('f2516000-0000-4000-8000-000000000003','materiali/a/manuale.pdf','materiali','client','f2511000-0000-4000-8000-000000000001','manuale.pdf','application/pdf',30,'f2510000-0000-4000-8000-000000000005'),
 ('f2516000-0000-4000-8000-000000000004','materiali/a/bozza.pdf','materiali','client','f2511000-0000-4000-8000-000000000001','bozza.pdf','application/pdf',40,'f2510000-0000-4000-8000-000000000001');

-- Il cliente carica nella sua cartella, con il percorso della cartella caricata.
INSERT INTO public.portal_materials(id,client_id,file_id,storage_key,name,mime,size,kind,path,uploaded_by,uploaded_by_name,idempotency_key) VALUES
 ('f2518000-0000-4000-8000-000000000001','f2511000-0000-4000-8000-000000000001','f2516000-0000-4000-8000-000000000001','materiali/a/logo.svg.png','logo.png','image/png',10,'immagine','brand/logo','f2510000-0000-4000-8000-000000000002','Referente','f2517000-0000-4000-8000-000000000001');
SELECT pg_temp.check_area((SELECT source='cliente' FROM public.portal_materials WHERE id='f2518000-0000-4000-8000-000000000001'),'le righe esistenti sono del cliente');

-- Un file del team lo carica il team.
SELECT pg_temp.reject_area($q$INSERT INTO public.portal_materials(client_id,file_id,storage_key,name,mime,size,kind,source,uploaded_by,uploaded_by_name,idempotency_key) VALUES ('f2511000-0000-4000-8000-000000000001','f2516000-0000-4000-8000-000000000002','materiali/a/design-system.pdf','design-system.pdf','application/pdf',20,'documento','team','f2510000-0000-4000-8000-000000000002','Referente','f2517000-0000-4000-8000-000000000002')$q$,'42501');
SELECT pg_temp.reject_area($q$INSERT INTO public.portal_materials(client_id,file_id,storage_key,name,mime,size,kind,source,uploaded_by,uploaded_by_name,idempotency_key) VALUES ('f2511000-0000-4000-8000-000000000001','f2516000-0000-4000-8000-000000000002','materiali/a/design-system.pdf','design-system.pdf','application/pdf',20,'documento','team','f2510000-0000-4000-8000-000000000006','Inattivo','f2517000-0000-4000-8000-000000000003')$q$,'42501');
-- E un file nostro non risponde a un'attività del cliente, nemmeno a una vera.
INSERT INTO public.portal_activities(id,client_id,title,reason,kind,contact_name,published_at,published_by) VALUES
 ('f2519000-0000-4000-8000-000000000001','f2511000-0000-4000-8000-000000000001','Mandaci il logo','Serve per chiudere la home','materiale','Referente TwoBee',now(),'f2510000-0000-4000-8000-000000000001');
SELECT pg_temp.reject_area($q$INSERT INTO public.portal_materials(client_id,file_id,storage_key,name,mime,size,kind,source,activity_id,uploaded_by,uploaded_by_name,idempotency_key) VALUES ('f2511000-0000-4000-8000-000000000001','f2516000-0000-4000-8000-000000000002','materiali/a/design-system.pdf','design-system.pdf','application/pdf',20,'documento','team','f2519000-0000-4000-8000-000000000001','f2510000-0000-4000-8000-000000000001','Admin','f2517000-0000-4000-8000-000000000004')$q$,'23514');
-- Né porta l'etichetta di un progetto di un'altra azienda.
SELECT pg_temp.reject_area($q$INSERT INTO public.portal_materials(client_id,project_id,file_id,storage_key,name,mime,size,kind,source,uploaded_by,uploaded_by_name,idempotency_key) VALUES ('f2511000-0000-4000-8000-000000000001','f2512000-0000-4000-8000-000000000002','f2516000-0000-4000-8000-000000000002','materiali/a/design-system.pdf','design-system.pdf','application/pdf',20,'documento','team','f2510000-0000-4000-8000-000000000001','Admin','f2517000-0000-4000-8000-000000000005')$q$,'P0001');

INSERT INTO public.portal_materials(id,client_id,project_id,file_id,storage_key,name,mime,size,kind,source,path,uploaded_by,uploaded_by_name,idempotency_key) VALUES
 ('f2518000-0000-4000-8000-000000000002','f2511000-0000-4000-8000-000000000001','f2512000-0000-4000-8000-000000000001','f2516000-0000-4000-8000-000000000002','materiali/a/design-system.pdf','design-system.pdf','application/pdf',20,'documento','team','progettazione/design system','f2510000-0000-4000-8000-000000000001','Admin','f2517000-0000-4000-8000-000000000010');
INSERT INTO public.portal_materials(id,client_id,file_id,storage_key,name,mime,size,kind,source,uploaded_by,uploaded_by_name,idempotency_key) VALUES
 ('f2518000-0000-4000-8000-000000000003','f2511000-0000-4000-8000-000000000001','f2516000-0000-4000-8000-000000000003','materiali/a/manuale.pdf','manuale.pdf','application/pdf',30,'documento','team','f2510000-0000-4000-8000-000000000005','Junior','f2517000-0000-4000-8000-000000000011');

-- Percorsi che non si accettano: risalite, barre appese, profondità infinita.
SELECT pg_temp.reject_area($q$UPDATE public.portal_materials SET path='../fuori' WHERE id='f2518000-0000-4000-8000-000000000001'$q$,'P0001');
DO $$ DECLARE bad text; BEGIN
  FOREACH bad IN ARRAY ARRAY['/assoluto','finale/','doppia//barra','..','brand/../fuori','brand/./qui',
    'a/b/c/d/e/f/g/h/i/j/k'] LOOP
    BEGIN
      INSERT INTO public.portal_materials(client_id,file_id,storage_key,name,mime,size,kind,path,uploaded_by,uploaded_by_name,idempotency_key)
      VALUES ('f2511000-0000-4000-8000-000000000001','f2516000-0000-4000-8000-000000000004','materiali/a/bozza.pdf','bozza.pdf','application/pdf',40,'documento',bad,'f2510000-0000-4000-8000-000000000002','Referente',gen_random_uuid());
      RAISE EXCEPTION 'FAIL: percorso accettato: %', bad;
    EXCEPTION WHEN check_violation THEN NULL; END;
  END LOOP;
END $$;

-- ── Il confine ──────────────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','f2510000-0000-4000-8000-000000000002',true);
SELECT pg_temp.check_area((SELECT count(*)=1 FROM public.portal_materials),'il referente vede solo i propri caricamenti');
SELECT pg_temp.check_area((SELECT count(*)=0 FROM public.portal_materials WHERE name='design-system.pdf'),'il design system non arriva al cliente');
SELECT pg_temp.check_area((SELECT path='brand/logo' FROM public.portal_materials WHERE id='f2518000-0000-4000-8000-000000000001'),'il percorso della cartella si legge');
SELECT set_config('request.jwt.claim.sub','f2510000-0000-4000-8000-000000000003',true);
SELECT pg_temp.check_area((SELECT count(*)=0 FROM public.portal_materials),'nemmeno con lo scope limitato');
SELECT set_config('request.jwt.claim.sub','f2510000-0000-4000-8000-000000000004',true);
SELECT pg_temp.check_area((SELECT count(*)=1 FROM public.portal_materials),'il lettore vede i file del cliente');
SELECT pg_temp.check_area((SELECT count(*)=0 FROM public.portal_materials WHERE name='manuale.pdf'),'ma non i nostri');
SELECT pg_temp.check_area((SELECT bool_and(source='cliente') FROM public.portal_materials),'al cliente la colonna racconta solo sé stesso');
SELECT set_config('request.jwt.claim.sub','f2510000-0000-4000-8000-000000000005',true);
SELECT pg_temp.check_area((SELECT count(*)=3 FROM public.portal_materials),'il team vede tutto: i suoi e quelli del cliente');
SELECT pg_temp.check_area((SELECT count(*)=2 FROM public.portal_materials WHERE source='team'),'e sa distinguere i propri');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);

-- ── Archiviare è nostro e vale per noi ─────────────────────────────────────
UPDATE public.portal_materials SET archived_at=now(),archived_by='f2510000-0000-4000-8000-000000000005' WHERE id='f2518000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','f2510000-0000-4000-8000-000000000002',true);
SELECT pg_temp.check_area((SELECT count(*)=1 FROM public.portal_materials WHERE id='f2518000-0000-4000-8000-000000000001'),'archiviare non toglie il file al cliente che l’ha caricato');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
UPDATE public.portal_materials SET archived_at=NULL,archived_by=NULL WHERE id='f2518000-0000-4000-8000-000000000001';
SELECT pg_temp.check_area((SELECT archived_at IS NULL FROM public.portal_materials WHERE id='f2518000-0000-4000-8000-000000000001'),'e si rimette in vista');

-- ── Immutabilità ───────────────────────────────────────────────────────────
SELECT pg_temp.reject_area($q$UPDATE public.portal_materials SET source='cliente' WHERE id='f2518000-0000-4000-8000-000000000002'$q$,'P0001');
SELECT pg_temp.reject_area($q$UPDATE public.portal_materials SET path='altrove' WHERE id='f2518000-0000-4000-8000-000000000002'$q$,'P0001');
UPDATE public.portal_materials SET deleted_at=now(),deleted_by='f2510000-0000-4000-8000-000000000001' WHERE id='f2518000-0000-4000-8000-000000000003';
SELECT pg_temp.reject_area($q$UPDATE public.portal_materials SET archived_at=now(),archived_by='f2510000-0000-4000-8000-000000000001' WHERE id='f2518000-0000-4000-8000-000000000003'$q$,'P0001');

ROLLBACK;
