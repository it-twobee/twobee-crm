-- Solo database di staging. NON eseguire sul progetto Supabase di produzione.
-- Prerequisito: migration 244, 246, 249, 250, 251 e 254. Tutto annullato a fine suite.
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
 ('f2530000-0000-4000-8000-000000000001','cartelle-admin@example.invalid','{}'),
 ('f2530000-0000-4000-8000-000000000002','cartelle-junior@example.invalid','{}'),
 ('f2530000-0000-4000-8000-000000000003','cartelle-freelance@example.invalid','{}'),
 ('f2530000-0000-4000-8000-000000000004','cartelle-referente@example.invalid','{}');
UPDATE public.profiles SET role='admin',app_role='super_admin',is_active=true WHERE id='f2530000-0000-4000-8000-000000000001';
UPDATE public.profiles SET role='team',app_role='junior',is_active=true WHERE id='f2530000-0000-4000-8000-000000000002';
UPDATE public.profiles SET role='team',app_role='freelance',is_active=true WHERE id='f2530000-0000-4000-8000-000000000003';
UPDATE public.profiles SET role='client',app_role='client',is_active=true WHERE id='f2530000-0000-4000-8000-000000000004';
SELECT pg_temp.as_actor('f2530000-0000-4000-8000-000000000001');
SELECT set_config('request.jwt.claim.sub','',true);

INSERT INTO public.clients(id,company_name,workspace_hidden) VALUES
 ('f2531000-0000-4000-8000-000000000001','Azienda cartelle',false),
 ('f2531000-0000-4000-8000-000000000002','Azienda riservata',true);
INSERT INTO public.portal_memberships(id,client_id,profile_id,portal_role,project_scope,created_by) VALUES
 ('f2535000-0000-4000-8000-000000000001','f2531000-0000-4000-8000-000000000001','f2530000-0000-4000-8000-000000000004','referente','all','f2530000-0000-4000-8000-000000000001');

INSERT INTO public.files(id,object_key,folder,entity_type,entity_id,name,mime,size,uploaded_by) VALUES
 ('f2536000-0000-4000-8000-000000000001','materiali/a/1','materiali','client','f2531000-0000-4000-8000-000000000001','logo.png','image/png',10,'f2530000-0000-4000-8000-000000000002'),
 ('f2536000-0000-4000-8000-000000000002','materiali/a/2','materiali','client','f2531000-0000-4000-8000-000000000001','manuale.pdf','application/pdf',20,'f2530000-0000-4000-8000-000000000002'),
 ('f2536000-0000-4000-8000-000000000003','materiali/a/3','materiali','client','f2531000-0000-4000-8000-000000000001','foto.jpg','image/jpeg',30,'f2530000-0000-4000-8000-000000000004'),
 ('f2536000-0000-4000-8000-000000000004','materiali/a/4','materiali','client','f2531000-0000-4000-8000-000000000001','nota.pdf','application/pdf',40,'f2530000-0000-4000-8000-000000000002'),
 ('f2536000-0000-4000-8000-000000000005','materiali/h/5','materiali','client','f2531000-0000-4000-8000-000000000002','gav.pdf','application/pdf',50,'f2530000-0000-4000-8000-000000000001');
INSERT INTO public.portal_materials(id,client_id,file_id,storage_key,name,mime,size,kind,source,path,uploaded_by,uploaded_by_name,idempotency_key) VALUES
 ('f2538000-0000-4000-8000-000000000001','f2531000-0000-4000-8000-000000000001','f2536000-0000-4000-8000-000000000001','materiali/a/1','logo.png','image/png',10,'immagine','team','Brand/Loghi','f2530000-0000-4000-8000-000000000002','Junior',gen_random_uuid()),
 ('f2538000-0000-4000-8000-000000000002','f2531000-0000-4000-8000-000000000001','f2536000-0000-4000-8000-000000000002','materiali/a/2','manuale.pdf','application/pdf',20,'documento','team','Brand','f2530000-0000-4000-8000-000000000002','Junior',gen_random_uuid()),
 ('f2538000-0000-4000-8000-000000000004','f2531000-0000-4000-8000-000000000001','f2536000-0000-4000-8000-000000000004','materiali/a/4','nota.pdf','application/pdf',40,'documento','team',NULL,'f2530000-0000-4000-8000-000000000002','Junior',gen_random_uuid()),
 ('f2538000-0000-4000-8000-000000000005','f2531000-0000-4000-8000-000000000002','f2536000-0000-4000-8000-000000000005','materiali/h/5','gav.pdf','application/pdf',50,'documento','team',NULL,'f2530000-0000-4000-8000-000000000001','Admin',gen_random_uuid());
INSERT INTO public.portal_materials(id,client_id,file_id,storage_key,name,mime,size,kind,source,path,uploaded_by,uploaded_by_name,idempotency_key) VALUES
 ('f2538000-0000-4000-8000-000000000003','f2531000-0000-4000-8000-000000000001','f2536000-0000-4000-8000-000000000003','materiali/a/3','foto.jpg','image/jpeg',30,'immagine','cliente','Brand','f2530000-0000-4000-8000-000000000004','Referente',gen_random_uuid());

-- ── Le cartelle vuote: chi le crea, e dove ─────────────────────────────────
SELECT pg_temp.as_actor('f2530000-0000-4000-8000-000000000002');
INSERT INTO public.portal_material_folders(client_id,source,path,created_by) VALUES
 ('f2531000-0000-4000-8000-000000000001','team','Vuota','f2530000-0000-4000-8000-000000000002');
SELECT pg_temp.ok((SELECT count(*)=1 FROM public.portal_events WHERE entity_table='portal_material_folders'),'la cartella entra in cronologia');
SELECT pg_temp.no($q$INSERT INTO public.portal_material_folders(client_id,source,path,created_by) VALUES ('f2531000-0000-4000-8000-000000000001','team','Altra','f2530000-0000-4000-8000-000000000001')$q$,'42501');
SELECT pg_temp.no($q$INSERT INTO public.portal_material_folders(client_id,source,path,created_by) VALUES ('f2531000-0000-4000-8000-000000000001','team','Vuota','f2530000-0000-4000-8000-000000000002')$q$,'23505');
SELECT pg_temp.no($q$INSERT INTO public.portal_material_folders(client_id,source,path,created_by) VALUES ('f2531000-0000-4000-8000-000000000001','team','../fuori','f2530000-0000-4000-8000-000000000002')$q$,'23514');
SELECT pg_temp.no($q$INSERT INTO public.portal_material_folders(client_id,source,path,created_by) VALUES ('f2531000-0000-4000-8000-000000000002','team','Riservata','f2530000-0000-4000-8000-000000000002')$q$,'42501');
SELECT pg_temp.as_actor('f2530000-0000-4000-8000-000000000003');
SELECT pg_temp.no($q$INSERT INTO public.portal_material_folders(client_id,source,path,created_by) VALUES ('f2531000-0000-4000-8000-000000000001','team','Freelance','f2530000-0000-4000-8000-000000000003')$q$,'42501');
SELECT pg_temp.as_actor(NULL);
SELECT pg_temp.no($q$INSERT INTO public.portal_material_folders(client_id,source,path,created_by) VALUES ('f2531000-0000-4000-8000-000000000001','team','Anonima','f2530000-0000-4000-8000-000000000002')$q$,'42501');
SELECT pg_temp.as_actor('f2530000-0000-4000-8000-000000000001');
INSERT INTO public.portal_material_folders(client_id,source,path,created_by) VALUES
 ('f2531000-0000-4000-8000-000000000002','team','Riservata','f2530000-0000-4000-8000-000000000001');

-- Il cliente non legge le cartelle: gli bastano quelle dei suoi file.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','f2530000-0000-4000-8000-000000000004',true);
SELECT pg_temp.ok((SELECT count(*)=0 FROM public.portal_material_folders),'il cliente non vede le cartelle vuote');
SELECT set_config('request.jwt.claim.sub','f2530000-0000-4000-8000-000000000002',true);
SELECT pg_temp.ok((SELECT count(*)>=1 FROM public.portal_material_folders),'lo staff sì');
SELECT pg_temp.no($q$INSERT INTO public.portal_material_folders(client_id,source,path,created_by) VALUES ('f2531000-0000-4000-8000-000000000001','team','Dal browser','f2530000-0000-4000-8000-000000000002')$q$,'42501');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);

-- ── Spostare file ───────────────────────────────────────────────────────────
SELECT pg_temp.as_actor('f2530000-0000-4000-8000-000000000002');
SELECT pg_temp.ok(public.portal_material_move(ARRAY['f2538000-0000-4000-8000-000000000002']::uuid[],'Vuota')=1,'si sposta un file');
SELECT pg_temp.ok((SELECT path='Vuota' FROM public.portal_materials WHERE id='f2538000-0000-4000-8000-000000000002'),'e il percorso è quello nuovo');
SELECT pg_temp.ok((SELECT count(*)=1 FROM public.portal_material_folders WHERE source='team' AND path='Brand'),'la cartella di partenza resta, anche se si svuotasse');
SELECT pg_temp.ok(public.portal_material_move(ARRAY['f2538000-0000-4000-8000-000000000004']::uuid[],'')=0,'nella radice già: niente da fare');
SELECT pg_temp.no($q$SELECT public.portal_material_move(ARRAY['f2538000-0000-4000-8000-000000000002','f2538000-0000-4000-8000-000000000003']::uuid[],'Vuota')$q$,'22023');
SELECT pg_temp.no($q$SELECT public.portal_material_move(ARRAY['f2538000-0000-4000-8000-000000000002','f2538000-0000-4000-8000-000000000005']::uuid[],'Vuota')$q$,'22023');
SELECT pg_temp.no($q$SELECT public.portal_material_move(ARRAY['f2538000-0000-4000-8000-000000000005']::uuid[],'Vuota')$q$,'42501');
SELECT pg_temp.no($q$SELECT public.portal_material_move(ARRAY['f2538000-0000-4000-8000-000000000002']::uuid[],'a/b/c/d/e/f/g/h/i/j/k')$q$,'23514');
SELECT pg_temp.as_actor(NULL);
SELECT pg_temp.no($q$SELECT public.portal_material_move(ARRAY['f2538000-0000-4000-8000-000000000004']::uuid[],'Vuota')$q$,'42501');
SELECT pg_temp.as_actor('f2530000-0000-4000-8000-000000000002');
-- Si mette ordine anche nei file del cliente, ma dentro il suo spazio.
SELECT pg_temp.ok(public.portal_material_move(ARRAY['f2538000-0000-4000-8000-000000000003']::uuid[],'Foto/Evento')=1,'anche i file del cliente si mettono in ordine');
SELECT pg_temp.no($q$UPDATE public.portal_materials SET source='team' WHERE id='f2538000-0000-4000-8000-000000000003'$q$,'P0001');

-- ── Rinominare e spostare cartelle ─────────────────────────────────────────
SELECT pg_temp.ok(public.portal_material_folder_move('f2531000-0000-4000-8000-000000000001','team','Brand','Marchio')=1,'rinomina: un file dentro');
SELECT pg_temp.ok((SELECT path='Marchio/Loghi' FROM public.portal_materials WHERE id='f2538000-0000-4000-8000-000000000001'),'il prefisso si riscrive');
SELECT pg_temp.ok((SELECT count(*)=1 FROM public.portal_material_folders WHERE source='team' AND path='Marchio'),'la cartella esplicita segue');
SELECT pg_temp.ok((SELECT count(*)=0 FROM public.portal_material_folders WHERE source='team' AND path='Brand'),'e non resta il vecchio nome');
SELECT pg_temp.ok((SELECT path='Foto/Evento' FROM public.portal_materials WHERE id='f2538000-0000-4000-8000-000000000003'),'l’altro spazio non si tocca');
SELECT pg_temp.no($q$SELECT public.portal_material_folder_move('f2531000-0000-4000-8000-000000000001','team','Marchio','Marchio/Dentro')$q$,'22023');
SELECT pg_temp.no($q$SELECT public.portal_material_folder_move('f2531000-0000-4000-8000-000000000002','team','Riservata','Altro')$q$,'42501');
-- Un percorso con `%` e `_` non è un pattern.
INSERT INTO public.portal_material_folders(client_id,source,path,created_by) VALUES
 ('f2531000-0000-4000-8000-000000000001','team','50%_sconto','f2530000-0000-4000-8000-000000000002'),
 ('f2531000-0000-4000-8000-000000000001','team','50xysconto','f2530000-0000-4000-8000-000000000002');
SELECT public.portal_material_folder_move('f2531000-0000-4000-8000-000000000001','team','50%_sconto','Saldi');
SELECT pg_temp.ok((SELECT count(*)=1 FROM public.portal_material_folders WHERE path='50xysconto'),'LIKE avrebbe preso anche questa');
-- Destinazione che esiste già: si uniscono, senza doppioni.
INSERT INTO public.portal_material_folders(client_id,source,path,created_by) VALUES
 ('f2531000-0000-4000-8000-000000000001','team','Archivio/Loghi','f2530000-0000-4000-8000-000000000002');
SELECT public.portal_material_folder_move('f2531000-0000-4000-8000-000000000001','team','Marchio/Loghi','Archivio/Loghi');
SELECT pg_temp.ok((SELECT count(*)=1 FROM public.portal_material_folders WHERE source='team' AND path='Archivio/Loghi'),'le cartelle si uniscono');
SELECT pg_temp.ok((SELECT path='Archivio/Loghi' FROM public.portal_materials WHERE id='f2538000-0000-4000-8000-000000000001'),'e il file ci arriva');
-- Salire di un livello scambia i percorsi fra righe della stessa operazione.
INSERT INTO public.portal_material_folders(client_id,source,path,created_by) VALUES
 ('f2531000-0000-4000-8000-000000000001','team','a','f2530000-0000-4000-8000-000000000002'),
 ('f2531000-0000-4000-8000-000000000001','team','a/b','f2530000-0000-4000-8000-000000000002'),
 ('f2531000-0000-4000-8000-000000000001','team','a/b/b','f2530000-0000-4000-8000-000000000002');
SELECT public.portal_material_folder_move('f2531000-0000-4000-8000-000000000001','team','a/b','a');
SELECT pg_temp.ok((SELECT count(*)=1 FROM public.portal_material_folders WHERE source='team' AND path='a')
  AND (SELECT count(*)=1 FROM public.portal_material_folders WHERE source='team' AND path='a/b')
  AND (SELECT count(*)=0 FROM public.portal_material_folders WHERE source='team' AND path='a/b/b'),'nessun doppione a fine operazione');
-- Troppo in profondità: si rifiuta tutto, non metà.
INSERT INTO public.portal_material_folders(client_id,source,path,created_by) VALUES
 ('f2531000-0000-4000-8000-000000000001','team','p/q/r','f2530000-0000-4000-8000-000000000002');
SELECT pg_temp.no($q$SELECT public.portal_material_folder_move('f2531000-0000-4000-8000-000000000001','team','p','1/2/3/4/5/6/7/8/9')$q$,'23514');
SELECT pg_temp.ok((SELECT count(*)=1 FROM public.portal_material_folders WHERE path='p/q/r'),'niente di mezzo spostato');

-- ── Archiviare ed eliminare cartelle ───────────────────────────────────────
SELECT pg_temp.ok(public.portal_material_folder_archive('f2531000-0000-4000-8000-000000000001','team','Archivio',true)=1,'archiviare una cartella archivia quello che c’è dentro');
SELECT pg_temp.ok((SELECT archived_at IS NOT NULL AND archived_by='f2530000-0000-4000-8000-000000000002' FROM public.portal_materials WHERE id='f2538000-0000-4000-8000-000000000001'),'con chi l’ha fatto');
SELECT pg_temp.no($q$SELECT public.portal_material_folder_delete('f2531000-0000-4000-8000-000000000001','team','Archivio')$q$,'22023');
SELECT pg_temp.ok(public.portal_material_folder_archive('f2531000-0000-4000-8000-000000000001','team','Archivio',false)=1,'e si rimette in vista');
SELECT pg_temp.ok(public.portal_material_folder_delete('f2531000-0000-4000-8000-000000000001','team','Saldi')=1,'una cartella vuota si elimina');
SELECT pg_temp.ok((SELECT count(*)=0 FROM public.portal_material_folders WHERE path='Saldi'),'e sparisce');

-- ── Rinominare un file ─────────────────────────────────────────────────────
SELECT public.portal_material_rename('f2538000-0000-4000-8000-000000000001','logo definitivo.png');
SELECT pg_temp.ok((SELECT name='logo definitivo.png' FROM public.portal_materials WHERE id='f2538000-0000-4000-8000-000000000001'),'il nome cambia');
SELECT pg_temp.ok((SELECT name='logo definitivo.png' FROM public.files WHERE id='f2536000-0000-4000-8000-000000000001'),'anche nel metadato dello storage');
SELECT pg_temp.no($q$SELECT public.portal_material_rename('f2538000-0000-4000-8000-000000000001','logo.html')$q$,'22023');
SELECT pg_temp.no($q$SELECT public.portal_material_rename('f2538000-0000-4000-8000-000000000001','su/giu.png')$q$,'22023');
SELECT pg_temp.no($q$SELECT public.portal_material_rename('f2538000-0000-4000-8000-000000000005','gav2.pdf')$q$,'42501');
UPDATE public.portal_materials SET deleted_at=now(),deleted_by='f2530000-0000-4000-8000-000000000002' WHERE id='f2538000-0000-4000-8000-000000000004';
SELECT pg_temp.no($q$UPDATE public.portal_materials SET path='altrove' WHERE id='f2538000-0000-4000-8000-000000000004'$q$,'P0001');
SELECT pg_temp.no($q$SELECT public.portal_material_rename('f2538000-0000-4000-8000-000000000004','nota2.pdf')$q$,'22023');

-- ── La quota si somma nel database ─────────────────────────────────────────
SELECT pg_temp.ok(public.portal_material_usage('f2531000-0000-4000-8000-000000000001')=60,'la quota conta i vivi, di tutti e due gli spazi');

-- Dal browser nessuna di queste si chiama.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','f2530000-0000-4000-8000-000000000002',true);
SELECT pg_temp.no($q$SELECT public.portal_material_move(ARRAY['f2538000-0000-4000-8000-000000000002']::uuid[],'')$q$,'42501');
SELECT pg_temp.no($q$SELECT public.portal_material_usage('f2531000-0000-4000-8000-000000000001')$q$,'42501');
RESET ROLE;

ROLLBACK;
