-- Fixture esclusivamente su staging/runner isolato; tutto viene annullato.
BEGIN;
CREATE FUNCTION pg_temp.check_storage(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF; END;
$$;
CREATE FUNCTION pg_temp.reject_storage(statement text,expected text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE code text;
BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS code=RETURNED_SQLSTATE;
    IF code<>expected THEN RAISE; END IF; RETURN;
  END;
  RAISE EXCEPTION 'Operazione doveva essere rifiutata: %',statement;
END;
$$;
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('f2460000-0000-4000-8000-000000000001','storage-manager@example.invalid','{}'),
 ('f2460000-0000-4000-8000-000000000002','storage-junior@example.invalid','{}'),
 ('f2460000-0000-4000-8000-000000000003','storage-admin@example.invalid','{}'),
 ('f2460000-0000-4000-8000-000000000004','storage-client-a@example.invalid','{}'),
 ('f2460000-0000-4000-8000-000000000005','storage-guest-b@example.invalid','{}'),
 ('f2460000-0000-4000-8000-000000000006','storage-disabled@example.invalid','{}'),
 ('f2460000-0000-4000-8000-000000000007','storage-viewer@example.invalid','{}');
UPDATE public.profiles SET role='team',app_role='manager' WHERE email LIKE 'storage-%@example.invalid';
UPDATE public.profiles SET app_role='junior' WHERE id='f2460000-0000-4000-8000-000000000002';
UPDATE public.profiles SET role='admin',app_role='founder' WHERE id='f2460000-0000-4000-8000-000000000003';
UPDATE public.profiles SET role='client',app_role='client' WHERE id='f2460000-0000-4000-8000-000000000004';
UPDATE public.profiles SET role='guest',app_role='guest' WHERE id='f2460000-0000-4000-8000-000000000005';
UPDATE public.profiles SET is_active=false WHERE id='f2460000-0000-4000-8000-000000000006';
UPDATE public.profiles SET app_role='viewer' WHERE id='f2460000-0000-4000-8000-000000000007';
INSERT INTO public.clients(id,company_name,workspace_hidden) VALUES
 ('f2461000-0000-4000-8000-000000000001','Storage A',false),
 ('f2461000-0000-4000-8000-000000000002','Storage B',false),
 ('f2461000-0000-4000-8000-000000000003','Storage nascosto',true);
INSERT INTO public.feedback(id,author_id) VALUES
 ('f2466000-0000-4000-8000-000000000001','f2460000-0000-4000-8000-000000000001'),
 ('f2466000-0000-4000-8000-000000000002','f2460000-0000-4000-8000-000000000002');
INSERT INTO public.file_folders(id,folder,entity_type,entity_id,name,created_by) VALUES
 ('f2462000-0000-4000-8000-000000000001','clients','client','f2461000-0000-4000-8000-000000000001','A','f2460000-0000-4000-8000-000000000001'),
 ('f2462000-0000-4000-8000-000000000002','clients','client','f2461000-0000-4000-8000-000000000002','B','f2460000-0000-4000-8000-000000000005'),
 ('f2462000-0000-4000-8000-000000000003','personal',NULL,NULL,'Riservata','f2460000-0000-4000-8000-000000000002');
INSERT INTO public.files(id,folder,entity_type,entity_id,name,object_key,uploaded_by) VALUES
 ('f2463000-0000-4000-8000-000000000001','clients','client','f2461000-0000-4000-8000-000000000001','Cliente A','clients/a.pdf','f2460000-0000-4000-8000-000000000001'),
 ('f2463000-0000-4000-8000-000000000002','clients','client','f2461000-0000-4000-8000-000000000002','Cliente B','clients/b.pdf','f2460000-0000-4000-8000-000000000004'),
 ('f2463000-0000-4000-8000-000000000003','clients','client','f2461000-0000-4000-8000-000000000003','Riservato','clients/hidden.pdf','f2460000-0000-4000-8000-000000000001'),
 ('f2463000-0000-4000-8000-000000000004','personal',NULL,NULL,'Personale','personal/private.pdf','f2460000-0000-4000-8000-000000000002'),
 ('f2463000-0000-4000-8000-000000000005','feedback','feedback','f2466000-0000-4000-8000-000000000001','Screenshot','feedback/image.png','f2460000-0000-4000-8000-000000000001'),
 ('f2463000-0000-4000-8000-000000000006','misc',NULL,NULL,'Generico','misc/general.pdf','f2460000-0000-4000-8000-000000000001');
INSERT INTO public.file_shares(file_id,token,created_by) VALUES
 ('f2463000-0000-4000-8000-000000000002',repeat('L',32),'f2460000-0000-4000-8000-000000000004');

-- 249: la cartella delle consegne al cliente esiste solo dentro un progetto.
INSERT INTO public.projects(id,client_id,name,area) VALUES
 ('f2467000-0000-4000-8000-000000000001','f2461000-0000-4000-8000-000000000001','Progetto consegne','digital');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','f2460000-0000-4000-8000-000000000004',true);
SELECT pg_temp.check_storage((SELECT count(*)=0 FROM public.files),'cliente A non legge neppure file legacy di cui era owner');
SELECT pg_temp.check_storage((SELECT count(*)=0 FROM public.file_folders),'cliente A non legge cartelle');
SELECT pg_temp.check_storage((SELECT count(*)=0 FROM public.file_shares),'cliente A non recupera vecchi token');
SELECT pg_temp.reject_storage($q$INSERT INTO public.files(folder,name,object_key,uploaded_by) VALUES('misc','alias','personal/private.pdf',auth.uid())$q$,'42501');
SELECT pg_temp.reject_storage($q$INSERT INTO public.file_shares(file_id,token,created_by) VALUES('f2463000-0000-4000-8000-000000000001','fake',auth.uid())$q$,'42501');
SELECT set_config('request.jwt.claim.sub','f2460000-0000-4000-8000-000000000005',true);
SELECT pg_temp.check_storage((SELECT count(*)=0 FROM public.files),'ospite B non legge file A né B');
SELECT pg_temp.check_storage((SELECT count(*)=0 FROM public.file_folders),'ospite B non legge cartelle proprie legacy');
SELECT set_config('request.jwt.claim.sub','f2460000-0000-4000-8000-000000000006',true);
SELECT pg_temp.check_storage((SELECT count(*)=0 FROM public.files),'manager disattivato non legge');
SELECT pg_temp.check_storage(NOT public.storage_context_access('clients','client','f2461000-0000-4000-8000-000000000001',true),'manager disattivato non scrive');
SELECT set_config('request.jwt.claim.sub','f2460000-0000-4000-8000-000000000001',true);
SELECT pg_temp.check_storage((SELECT count(*)=4 FROM public.files),'manager legge A, B, feedback e generico');
SELECT pg_temp.check_storage((SELECT count(*)=0 FROM public.files WHERE id IN ('f2463000-0000-4000-8000-000000000003','f2463000-0000-4000-8000-000000000004')),'nascosti e personali esclusi anche se owner');
SELECT pg_temp.check_storage((SELECT count(*)=0 FROM public.file_folders WHERE folder='personal'),'nomi delle cartelle personali protetti');
SELECT pg_temp.check_storage(public.storage_context_access('feedback','feedback','f2466000-0000-4000-8000-000000000001',true),'upload feedback proprio');
SELECT pg_temp.check_storage(NOT public.storage_context_access('feedback','feedback','f2466000-0000-4000-8000-000000000002',true),'upload feedback altrui negato');
SELECT pg_temp.check_storage(public.storage_context_access('feedback','feedback','f2466000-0000-4000-8000-000000000002',false),'feedback altrui resta leggibile');
SELECT pg_temp.check_storage(public.storage_context_access('deliverables','project','f2467000-0000-4000-8000-000000000001',true),'consegne: si caricano nel progetto');
SELECT pg_temp.check_storage(NOT public.storage_context_access('deliverables','client','f2461000-0000-4000-8000-000000000001',true),'consegne: il contesto azienda non basta');
SELECT pg_temp.check_storage(NOT public.storage_context_access('deliverables',NULL,NULL,false),'consegne: senza contesto non si legge');
SELECT pg_temp.reject_storage($q$INSERT INTO public.files(folder,name,object_key,uploaded_by) VALUES('misc','alias','personal/private.pdf',auth.uid())$q$,'42501');
SELECT pg_temp.reject_storage('UPDATE public.file_folders SET entity_id=NULL','42501');
SELECT set_config('request.headers','{"x-actor-id":"f2460000-0000-4000-8000-000000000001"}',true);
SELECT pg_temp.reject_storage($q$SELECT public.storage_replace_share('f2463000-0000-4000-8000-000000000006',repeat('F',32),NULL)$q$,'42501');
SELECT set_config('request.jwt.claim.sub','f2460000-0000-4000-8000-000000000007',true);
SELECT pg_temp.check_storage(public.storage_context_access('misc',NULL,NULL,false),'viewer legge');
SELECT pg_temp.check_storage(NOT public.storage_context_access('misc',NULL,NULL,true),'viewer non scrive');
SELECT set_config('request.jwt.claim.sub','f2460000-0000-4000-8000-000000000003',true);
SELECT pg_temp.check_storage((SELECT count(*)=6 FROM public.files),'admin conserva accesso ai file');
SELECT pg_temp.reject_storage('DELETE FROM public.files','42501');
RESET ROLE;

SELECT pg_temp.reject_storage($q$INSERT INTO public.files(folder,entity_type,entity_id,folder_id,name,object_key) VALUES('clients','client','f2461000-0000-4000-8000-000000000002','f2462000-0000-4000-8000-000000000001','Contesto alterato','clients/wrong.pdf')$q$,'23514');
SELECT pg_temp.reject_storage($q$UPDATE public.file_folders SET parent_id='f2462000-0000-4000-8000-000000000001' WHERE id='f2462000-0000-4000-8000-000000000002'$q$,'23514');
INSERT INTO public.file_folders(id,parent_id,folder,entity_type,entity_id,name,created_by) VALUES
 ('f2462000-0000-4000-8000-000000000004','f2462000-0000-4000-8000-000000000001','clients','client','f2461000-0000-4000-8000-000000000001','Figlia A','f2460000-0000-4000-8000-000000000001');
SELECT pg_temp.reject_storage($q$UPDATE public.file_folders SET parent_id='f2462000-0000-4000-8000-000000000004' WHERE id='f2462000-0000-4000-8000-000000000001'$q$,'23514');
SELECT pg_temp.reject_storage($q$UPDATE public.file_folders SET entity_id='f2461000-0000-4000-8000-000000000002' WHERE id='f2462000-0000-4000-8000-000000000001'$q$,'23514');
INSERT INTO public.file_folders(id,parent_id,folder,entity_type,entity_id,name,created_by) VALUES
 ('f2462000-0000-4000-8000-000000000005','f2462000-0000-4000-8000-000000000001','clients','client','f2461000-0000-4000-8000-000000000001','Figlia altrui','f2460000-0000-4000-8000-000000000002');
SELECT pg_temp.reject_storage($q$DELETE FROM public.file_folders WHERE id='f2462000-0000-4000-8000-000000000001'$q$,'42501');
SELECT pg_temp.check_storage((SELECT count(*)=2 FROM public.file_folders WHERE parent_id='f2462000-0000-4000-8000-000000000001'),'CASCADE rifiutato non elimina parzialmente i figli');

SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE service_role;
SELECT public.storage_replace_share('f2463000-0000-4000-8000-000000000006',repeat('A',32),now()+interval '1 day');
SELECT public.storage_replace_share('f2463000-0000-4000-8000-000000000006',repeat('B',32),now()+interval '1 day');
SELECT pg_temp.check_storage((SELECT count(*)=1 FROM public.file_shares WHERE file_id='f2463000-0000-4000-8000-000000000006' AND NOT revoked),'rinnovo lascia un solo token attivo');
SELECT pg_temp.reject_storage($q$SELECT public.storage_replace_share('f2463000-0000-4000-8000-000000000006',repeat('B',32),NULL)$q$,'23505');
SELECT pg_temp.check_storage((SELECT NOT revoked FROM public.file_shares WHERE token=repeat('B',32)),'errore inserimento non revoca parzialmente il link attivo');
SELECT pg_temp.reject_storage($q$SELECT public.storage_replace_share('f2463000-0000-4000-8000-000000000001',repeat('C',32),NULL)$q$,'42501');
SELECT public.storage_replace_share('f2463000-0000-4000-8000-000000000006',NULL,NULL);
SELECT pg_temp.check_storage((SELECT count(*)=0 FROM public.file_shares WHERE file_id='f2463000-0000-4000-8000-000000000006' AND NOT revoked),'revoca effettiva');
SELECT set_config('request.headers','{"x-actor-id":"f2460000-0000-4000-8000-000000000006"}',true);
SELECT pg_temp.reject_storage($q$SELECT public.storage_replace_share('f2463000-0000-4000-8000-000000000006',repeat('D',32),NULL)$q$,'42501');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.reject_storage('SELECT * FROM public.files','42501');
SELECT pg_temp.reject_storage('SELECT * FROM public.file_folders','42501');
SELECT pg_temp.reject_storage('SELECT * FROM public.file_shares','42501');
RESET ROLE;
ROLLBACK;
