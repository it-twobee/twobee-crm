-- Solo database di staging. NON eseguire sul progetto Supabase di produzione.
-- Prerequisito: migration 244, 249 e 250. Tutto annullato a fine suite.
BEGIN;

CREATE FUNCTION pg_temp.check_mat(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', label; END IF; END;
$$;
CREATE FUNCTION pg_temp.reject_mat(statement text, expected_state text DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
DECLARE rejected boolean := false; actual_state text;
BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS actual_state = RETURNED_SQLSTATE;
    IF expected_state IS NOT NULL AND actual_state <> expected_state THEN RAISE; END IF;
    rejected := true;
  END;
  PERFORM pg_temp.check_mat(rejected, 'operazione doveva essere rifiutata: ' || statement);
END;
$$;

INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('f2500000-0000-4000-8000-000000000001','mat-staff@example.invalid','{}'),
 ('f2500000-0000-4000-8000-000000000002','mat-referente@example.invalid','{}'),
 ('f2500000-0000-4000-8000-000000000003','mat-limitato@example.invalid','{}'),
 ('f2500000-0000-4000-8000-000000000004','mat-lettore@example.invalid','{}'),
 ('f2500000-0000-4000-8000-000000000005','mat-altra-azienda@example.invalid','{}');
UPDATE public.profiles SET role='client',app_role='client',is_active=true WHERE email LIKE 'mat-%@example.invalid';
UPDATE public.profiles SET role='admin',app_role='super_admin' WHERE id='f2500000-0000-4000-8000-000000000001';
SELECT set_config('request.headers','{"x-actor-id":"f2500000-0000-4000-8000-000000000001"}',true);
SELECT set_config('request.jwt.claim.sub','',true);

INSERT INTO public.clients(id,company_name) VALUES
 ('f2501000-0000-4000-8000-000000000001','Azienda materiali A'),
 ('f2501000-0000-4000-8000-000000000002','Azienda materiali B');
INSERT INTO public.projects(id,client_id,name,area,portal_title,portal_published_at,portal_published_by) VALUES
 ('f2502000-0000-4000-8000-000000000001','f2501000-0000-4000-8000-000000000001','INTERNO A','digital','Sito',now(),'f2500000-0000-4000-8000-000000000001'),
 ('f2502000-0000-4000-8000-000000000002','f2501000-0000-4000-8000-000000000001','INTERNO A2','digital','Altro',now(),'f2500000-0000-4000-8000-000000000001');

INSERT INTO public.portal_memberships(id,client_id,profile_id,portal_role,project_scope,created_by) VALUES
 ('f2505000-0000-4000-8000-000000000001','f2501000-0000-4000-8000-000000000001','f2500000-0000-4000-8000-000000000002','referente','all','f2500000-0000-4000-8000-000000000001'),
 ('f2505000-0000-4000-8000-000000000002','f2501000-0000-4000-8000-000000000001','f2500000-0000-4000-8000-000000000003','collaboratore','selected','f2500000-0000-4000-8000-000000000001'),
 ('f2505000-0000-4000-8000-000000000003','f2501000-0000-4000-8000-000000000001','f2500000-0000-4000-8000-000000000004','lettore','all','f2500000-0000-4000-8000-000000000001'),
 ('f2505000-0000-4000-8000-000000000004','f2501000-0000-4000-8000-000000000002','f2500000-0000-4000-8000-000000000005','referente','all','f2500000-0000-4000-8000-000000000001');
INSERT INTO public.portal_project_access VALUES
 ('f2505000-0000-4000-8000-000000000002','f2501000-0000-4000-8000-000000000001','f2502000-0000-4000-8000-000000000001');

INSERT INTO public.files(id,object_key,folder,entity_type,entity_id,name,mime,size,uploaded_by) VALUES
 ('f2506000-0000-4000-8000-000000000001','materiali/a/logo.png','materiali','client','f2501000-0000-4000-8000-000000000001','logo.png','image/png',1024,'f2500000-0000-4000-8000-000000000002'),
 ('f2506000-0000-4000-8000-000000000002','materiali/a/spot.mp4','materiali','client','f2501000-0000-4000-8000-000000000001','spot.mp4','video/mp4',2048,'f2500000-0000-4000-8000-000000000003'),
 ('f2506000-0000-4000-8000-000000000003','materiali/b/altro.png','materiali','client','f2501000-0000-4000-8000-000000000002','altro.png','image/png',512,'f2500000-0000-4000-8000-000000000005'),
 ('f2506000-0000-4000-8000-000000000004','misc/interno.png','misc','client','f2501000-0000-4000-8000-000000000001','interno.png','image/png',256,'f2500000-0000-4000-8000-000000000001'),
 ('f2506000-0000-4000-8000-000000000005','materiali/a/terzo.png','materiali','client','f2501000-0000-4000-8000-000000000001','terzo.png','image/png',128,'f2500000-0000-4000-8000-000000000002');

-- Carica chi partecipa, non chi consulta.
SELECT pg_temp.reject_mat($q$INSERT INTO public.portal_materials(client_id,file_id,storage_key,name,mime,size,kind,uploaded_by,uploaded_by_name,idempotency_key) VALUES ('f2501000-0000-4000-8000-000000000001','f2506000-0000-4000-8000-000000000001','materiali/a/logo.png','logo.png','image/png',1024,'immagine','f2500000-0000-4000-8000-000000000004','Lettore','f2507000-0000-4000-8000-000000000001')$q$,'42501');
-- Il file deve stare nello spazio di quell'azienda.
SELECT pg_temp.reject_mat($q$INSERT INTO public.portal_materials(client_id,file_id,storage_key,name,mime,size,kind,uploaded_by,uploaded_by_name,idempotency_key) VALUES ('f2501000-0000-4000-8000-000000000001','f2506000-0000-4000-8000-000000000003','materiali/b/altro.png','altro.png','image/png',512,'immagine','f2500000-0000-4000-8000-000000000002','Referente','f2507000-0000-4000-8000-000000000002')$q$,'P0001');
SELECT pg_temp.reject_mat($q$INSERT INTO public.portal_materials(client_id,file_id,storage_key,name,mime,size,kind,uploaded_by,uploaded_by_name,idempotency_key) VALUES ('f2501000-0000-4000-8000-000000000001','f2506000-0000-4000-8000-000000000004','misc/interno.png','interno.png','image/png',256,'immagine','f2500000-0000-4000-8000-000000000002','Referente','f2507000-0000-4000-8000-000000000003')$q$,'P0001');
-- Un progetto che non è fra i suoi non diventa un'etichetta valida.
SELECT pg_temp.reject_mat($q$INSERT INTO public.portal_materials(client_id,project_id,file_id,storage_key,name,mime,size,kind,uploaded_by,uploaded_by_name,idempotency_key) VALUES ('f2501000-0000-4000-8000-000000000001','f2502000-0000-4000-8000-000000000002','f2506000-0000-4000-8000-000000000002','materiali/a/spot.mp4','spot.mp4','video/mp4',2048,'video','f2500000-0000-4000-8000-000000000003','Limitato','f2507000-0000-4000-8000-000000000004')$q$,'42501');
-- Oltre il giga non si passa, nemmeno dal service role.
SELECT pg_temp.reject_mat($q$INSERT INTO public.portal_materials(client_id,file_id,storage_key,name,mime,size,kind,uploaded_by,uploaded_by_name,idempotency_key) VALUES ('f2501000-0000-4000-8000-000000000001','f2506000-0000-4000-8000-000000000005','materiali/a/terzo.png','terzo.png','image/png',1073741825,'immagine','f2500000-0000-4000-8000-000000000002','Referente','f2507000-0000-4000-8000-000000000005')$q$,'23514');

INSERT INTO public.portal_materials(id,client_id,file_id,storage_key,name,mime,size,kind,uploaded_by,uploaded_by_name,idempotency_key) VALUES
 ('f2508000-0000-4000-8000-000000000001','f2501000-0000-4000-8000-000000000001','f2506000-0000-4000-8000-000000000001','materiali/a/logo.png','logo.png','image/png',1024,'immagine','f2500000-0000-4000-8000-000000000002','Referente','f2507000-0000-4000-8000-000000000010');
INSERT INTO public.portal_materials(id,client_id,project_id,file_id,storage_key,name,mime,size,kind,uploaded_by,uploaded_by_name,idempotency_key) VALUES
 ('f2508000-0000-4000-8000-000000000002','f2501000-0000-4000-8000-000000000001','f2502000-0000-4000-8000-000000000001','f2506000-0000-4000-8000-000000000002','materiali/a/spot.mp4','spot.mp4','video/mp4',2048,'video','f2500000-0000-4000-8000-000000000003','Limitato','f2507000-0000-4000-8000-000000000011');
-- Un reinvio non lascia due copie.
SELECT pg_temp.reject_mat($q$INSERT INTO public.portal_materials(client_id,file_id,storage_key,name,mime,size,kind,uploaded_by,uploaded_by_name,idempotency_key) VALUES ('f2501000-0000-4000-8000-000000000001','f2506000-0000-4000-8000-000000000005','materiali/a/terzo.png','terzo.png','image/png',128,'immagine','f2500000-0000-4000-8000-000000000002','Referente','f2507000-0000-4000-8000-000000000010')$q$,'23505');
SELECT pg_temp.reject_mat($q$UPDATE public.portal_materials SET name='rinominato.png' WHERE id='f2508000-0000-4000-8000-000000000001'$q$,'P0001');
SELECT pg_temp.reject_mat($q$UPDATE public.portal_materials SET project_id='f2502000-0000-4000-8000-000000000002' WHERE id='f2508000-0000-4000-8000-000000000001'$q$,'P0001');

-- ── Lettura del cliente ─────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','f2500000-0000-4000-8000-000000000002',true);
SELECT pg_temp.check_mat((SELECT count(*)=2 FROM public.portal_materials),'il referente con tutta l’azienda vede entrambi');
SELECT pg_temp.check_mat((SELECT count(*)=1 FROM public.portal_materials WHERE uploaded_by<>auth.uid()),'lo spazio è dell’azienda, non della persona');
SELECT pg_temp.reject_mat('SELECT storage_key FROM public.portal_materials','42501');
SELECT pg_temp.reject_mat('SELECT file_id FROM public.portal_materials','42501');
SELECT pg_temp.reject_mat($q$UPDATE public.portal_materials SET deleted_at=now() WHERE id='f2508000-0000-4000-8000-000000000001'$q$,'42501');

SELECT set_config('request.jwt.claim.sub','f2500000-0000-4000-8000-000000000003',true);
SELECT pg_temp.check_mat((SELECT count(*)=1 FROM public.portal_materials),'lo scope limitato vede solo il progetto autorizzato');
SELECT pg_temp.check_mat((SELECT count(*)=0 FROM public.portal_materials WHERE project_id IS NULL),'i file senza progetto restano a chi ha tutta l’azienda');
SELECT set_config('request.jwt.claim.sub','f2500000-0000-4000-8000-000000000004',true);
SELECT pg_temp.check_mat((SELECT count(*)=2 FROM public.portal_materials),'il lettore consulta, anche se non carica');
SELECT set_config('request.jwt.claim.sub','f2500000-0000-4000-8000-000000000005',true);
SELECT pg_temp.check_mat((SELECT count(*)=0 FROM public.portal_materials),'l’altra azienda non vede niente');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);

-- ── Un materiale che risponde a un'attività la manda in verifica ────────────
INSERT INTO public.tasks(id,client_id,task_type,title,description,status,visibility,created_by) VALUES
 ('f2503000-0000-4000-8000-000000000001','f2501000-0000-4000-8000-000000000001','cliente','Inviaci il logo','Serve per la home','da_fare','client_visible','f2500000-0000-4000-8000-000000000001');
INSERT INTO public.portal_activities(id,client_id,title,reason,kind,contact_name,owner_id,source_task_id,published_at,published_by) VALUES
 ('f2504000-0000-4000-8000-000000000001','f2501000-0000-4000-8000-000000000001','Inviaci il logo','Serve per la home','materiale','Referente TwoBee','f2500000-0000-4000-8000-000000000001','f2503000-0000-4000-8000-000000000001',now(),'f2500000-0000-4000-8000-000000000001');
INSERT INTO public.portal_materials(id,client_id,file_id,storage_key,name,mime,size,kind,uploaded_by,uploaded_by_name,activity_id,idempotency_key) VALUES
 ('f2508000-0000-4000-8000-000000000003','f2501000-0000-4000-8000-000000000001','f2506000-0000-4000-8000-000000000005','materiali/a/terzo.png','terzo.png','image/png',128,'immagine','f2500000-0000-4000-8000-000000000002','Referente','f2504000-0000-4000-8000-000000000001','f2507000-0000-4000-8000-000000000012');
SELECT pg_temp.check_mat((SELECT status='in_verifica' FROM public.portal_activities WHERE id='f2504000-0000-4000-8000-000000000001'),'il materiale mette l’attività in verifica');
SELECT pg_temp.check_mat((SELECT status='in_review' FROM public.tasks WHERE id='f2503000-0000-4000-8000-000000000001'),'e riporta la task al team');

-- ── Rimozione: una volta sola, e il file si stacca ──────────────────────────
UPDATE public.portal_materials SET deleted_at=now(),deleted_by='f2500000-0000-4000-8000-000000000002' WHERE id='f2508000-0000-4000-8000-000000000001';
SELECT pg_temp.reject_mat($q$UPDATE public.portal_materials SET deleted_at=NULL,deleted_by=NULL WHERE id='f2508000-0000-4000-8000-000000000001'$q$,'P0001');
DELETE FROM public.files WHERE id='f2506000-0000-4000-8000-000000000001';
SELECT pg_temp.check_mat((SELECT file_id IS NULL AND storage_key='materiali/a/logo.png' FROM public.portal_materials WHERE id='f2508000-0000-4000-8000-000000000001'),'il metadato si stacca, la traccia resta');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','f2500000-0000-4000-8000-000000000002',true);
SELECT pg_temp.check_mat((SELECT count(*)=0 FROM public.portal_materials WHERE id='f2508000-0000-4000-8000-000000000001'),'un file rimosso non si vede più');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);

-- ── Lo spazio file è dell'azienda, anche per lo storage ────────────────────
SELECT pg_temp.check_mat(NOT public.storage_context_access('materiali','project','f2502000-0000-4000-8000-000000000001'),'i materiali non stanno sotto un progetto');

ROLLBACK;
