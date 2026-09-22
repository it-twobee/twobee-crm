-- Solo database di staging. NON eseguire sul progetto Supabase di produzione.
-- Prerequisito: migration 244 e 249. Fixture riconoscibili, tutto annullato a fine suite.
BEGIN;

CREATE FUNCTION pg_temp.check_pub(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', label; END IF; END;
$$;
CREATE FUNCTION pg_temp.reject_pub(statement text, expected_state text DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
DECLARE rejected boolean := false; actual_state text;
BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS actual_state = RETURNED_SQLSTATE;
    IF expected_state IS NOT NULL AND actual_state <> expected_state THEN RAISE; END IF;
    rejected := true;
  END;
  PERFORM pg_temp.check_pub(rejected, 'operazione doveva essere rifiutata: ' || statement);
END;
$$;

INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('f2470000-0000-4000-8000-000000000001','pub-staff@example.invalid','{}'),
 ('f2470000-0000-4000-8000-000000000002','pub-a-tutto@example.invalid','{}'),
 ('f2470000-0000-4000-8000-000000000003','pub-a-limitato@example.invalid','{}'),
 ('f2470000-0000-4000-8000-000000000004','pub-b@example.invalid','{}');
UPDATE public.profiles SET role='client',app_role='client',is_active=true WHERE email LIKE 'pub-%@example.invalid';
UPDATE public.profiles SET role='admin',app_role='super_admin',full_name='Referente TwoBee' WHERE id='f2470000-0000-4000-8000-000000000001';
SELECT set_config('request.headers','{"x-actor-id":"f2470000-0000-4000-8000-000000000001"}',true);
SELECT set_config('request.jwt.claim.sub','',true);

INSERT INTO public.clients(id,company_name,notes) VALUES
 ('f2471000-0000-4000-8000-000000000001','Azienda pubblicazione A','SEGRETO A'),
 ('f2471000-0000-4000-8000-000000000002','Azienda pubblicazione B','SEGRETO B');
INSERT INTO public.projects(id,client_id,name,area,portal_title,portal_published_at,portal_published_by) VALUES
 ('f2472000-0000-4000-8000-000000000001','f2471000-0000-4000-8000-000000000001','INTERNO A','digital','Sito nuovo',now(),'f2470000-0000-4000-8000-000000000001'),
 ('f2472000-0000-4000-8000-000000000002','f2471000-0000-4000-8000-000000000002','INTERNO B','digital','Sito B',now(),'f2470000-0000-4000-8000-000000000001');

INSERT INTO public.portal_memberships(id,client_id,profile_id,portal_role,project_scope,created_by) VALUES
 ('f2475000-0000-4000-8000-000000000001','f2471000-0000-4000-8000-000000000001','f2470000-0000-4000-8000-000000000002','referente','all','f2470000-0000-4000-8000-000000000001'),
 ('f2475000-0000-4000-8000-000000000002','f2471000-0000-4000-8000-000000000001','f2470000-0000-4000-8000-000000000003','referente','selected','f2470000-0000-4000-8000-000000000001'),
 ('f2475000-0000-4000-8000-000000000003','f2471000-0000-4000-8000-000000000002','f2470000-0000-4000-8000-000000000004','referente','all','f2470000-0000-4000-8000-000000000001');
INSERT INTO public.portal_project_access VALUES
 ('f2475000-0000-4000-8000-000000000002','f2471000-0000-4000-8000-000000000001','f2472000-0000-4000-8000-000000000001');

-- ── Task al cliente: si inserisce una volta sola, la si pubblica esplicitamente
INSERT INTO public.tasks(id,client_id,task_type,title,description,status,due_date,visibility,created_by) VALUES
 ('f2473000-0000-4000-8000-000000000001','f2471000-0000-4000-8000-000000000001','cliente','Inviaci il logo','Serve per chiudere la home','da_fare','2026-10-15','client_visible','f2470000-0000-4000-8000-000000000001'),
 ('f2473000-0000-4000-8000-000000000002','f2471000-0000-4000-8000-000000000002','cliente','Task di B','Motivo di B','da_fare',NULL,'client_visible','f2470000-0000-4000-8000-000000000001'),
 ('f2473000-0000-4000-8000-000000000003','f2471000-0000-4000-8000-000000000001','ad_hoc','Roba nostra','Interna','da_fare',NULL,'internal','f2470000-0000-4000-8000-000000000001');

SELECT pg_temp.reject_pub($q$INSERT INTO public.portal_activities(client_id,title,reason,kind,contact_name,owner_id,source_task_id,published_at,published_by) VALUES ('f2471000-0000-4000-8000-000000000001','Roba nostra','Interna','materiale','Referente','f2470000-0000-4000-8000-000000000001','f2473000-0000-4000-8000-000000000003',now(),'f2470000-0000-4000-8000-000000000001')$q$,'P0001');
SELECT pg_temp.reject_pub($q$INSERT INTO public.portal_activities(client_id,title,reason,kind,contact_name,owner_id,source_task_id,published_at,published_by) VALUES ('f2471000-0000-4000-8000-000000000001','Task di B','Motivo di B','materiale','Referente','f2470000-0000-4000-8000-000000000001','f2473000-0000-4000-8000-000000000002',now(),'f2470000-0000-4000-8000-000000000001')$q$,'P0001');
SELECT pg_temp.reject_pub($q$INSERT INTO public.portal_activities(client_id,title,reason,kind,contact_name,published_at,published_by) VALUES ('f2471000-0000-4000-8000-000000000001','Senza progetto','Motivo','approvazione','Referente',now(),'f2470000-0000-4000-8000-000000000001')$q$,'23514');

INSERT INTO public.portal_activities(id,client_id,title,reason,kind,due_date,contact_name,owner_id,source_task_id,published_at,published_by) VALUES
 ('f2474000-0000-4000-8000-000000000001','f2471000-0000-4000-8000-000000000001','Inviaci il logo','Serve per chiudere la home','materiale','2026-10-15','Referente TwoBee','f2470000-0000-4000-8000-000000000001','f2473000-0000-4000-8000-000000000001',now(),'f2470000-0000-4000-8000-000000000001');
SELECT pg_temp.reject_pub($q$INSERT INTO public.portal_activities(client_id,title,reason,kind,contact_name,source_task_id,published_at,published_by) VALUES ('f2471000-0000-4000-8000-000000000001','Doppione','Motivo','materiale','Referente','f2473000-0000-4000-8000-000000000001',now(),'f2470000-0000-4000-8000-000000000001')$q$,'23505');
SELECT pg_temp.reject_pub($q$UPDATE public.portal_activities SET source_task_id=NULL WHERE id='f2474000-0000-4000-8000-000000000001'$q$,'P0001');

-- Sincronizzazione dei soli campi condivisi.
UPDATE public.tasks SET title='Inviaci il logo in vettoriale', description='Serve per chiudere la home entro il rilascio', due_date='2026-10-20' WHERE id='f2473000-0000-4000-8000-000000000001';
SELECT pg_temp.check_pub((SELECT title='Inviaci il logo in vettoriale' AND reason LIKE '%entro il rilascio' AND due_date='2026-10-20' FROM public.portal_activities WHERE id='f2474000-0000-4000-8000-000000000001'),'la task aggiorna i campi condivisi');
UPDATE public.tasks SET description='' WHERE id='f2473000-0000-4000-8000-000000000001';
SELECT pg_temp.check_pub((SELECT length(btrim(reason))>0 FROM public.portal_activities WHERE id='f2474000-0000-4000-8000-000000000001'),'una descrizione svuotata non cancella il perché già pubblicato');
SELECT pg_temp.check_pub((SELECT count(*)>0 FROM public.portal_events WHERE entity_id='f2474000-0000-4000-8000-000000000001' AND action='sync'),'la propagazione resta in cronologia con un autore');

-- Una scrittura interna senza attore non deve rompersi per colpa del portale.
SELECT set_config('request.headers','',true);
UPDATE public.tasks SET title='Inviaci il logo (aggiornato)' WHERE id='f2473000-0000-4000-8000-000000000001';
SELECT pg_temp.check_pub((SELECT title='Inviaci il logo (aggiornato)' FROM public.portal_activities WHERE id='f2474000-0000-4000-8000-000000000001'),'la sincronizzazione dichiara il proprio autore');
SELECT set_config('request.headers','{"x-actor-id":"f2470000-0000-4000-8000-000000000001"}',true);

-- ── Consegne: il file è quello del progetto, la versione è immutabile ────────
INSERT INTO public.files(id,object_key,folder,entity_type,entity_id,name,mime,uploaded_by) VALUES
 ('f2476000-0000-4000-8000-000000000001','deliverables/f247-v1.pdf','deliverables','project','f2472000-0000-4000-8000-000000000001','Consegna v1.pdf','application/pdf','f2470000-0000-4000-8000-000000000001'),
 ('f2476000-0000-4000-8000-000000000002','deliverables/f247-v2.pdf','deliverables','project','f2472000-0000-4000-8000-000000000001','Consegna v2.pdf','application/pdf','f2470000-0000-4000-8000-000000000001'),
 ('f2476000-0000-4000-8000-000000000003','deliverables/f247-altro.pdf','deliverables','project','f2472000-0000-4000-8000-000000000002','Di un altro progetto.pdf','application/pdf','f2470000-0000-4000-8000-000000000001'),
 ('f2476000-0000-4000-8000-000000000004','misc/f247-interno.pdf','misc','project','f2472000-0000-4000-8000-000000000001','Allegato interno.pdf','application/pdf','f2470000-0000-4000-8000-000000000001');

INSERT INTO public.portal_deliverables(id,client_id,project_id,title,created_by) VALUES
 ('f2477000-0000-4000-8000-000000000001','f2471000-0000-4000-8000-000000000001','f2472000-0000-4000-8000-000000000001','Progetto grafico','f2470000-0000-4000-8000-000000000001');
SELECT pg_temp.reject_pub($q$INSERT INTO public.portal_deliverables(client_id,project_id,title,created_by) VALUES ('f2471000-0000-4000-8000-000000000001','f2472000-0000-4000-8000-000000000002','Azienda sbagliata','f2470000-0000-4000-8000-000000000001')$q$,'23503');

SELECT pg_temp.reject_pub($q$INSERT INTO public.portal_deliverable_versions(client_id,project_id,deliverable_id,file_id,version,title,storage_key,author_id,author_name) VALUES ('f2471000-0000-4000-8000-000000000001','f2472000-0000-4000-8000-000000000001','f2477000-0000-4000-8000-000000000001','f2476000-0000-4000-8000-000000000003',1,'File di un altro progetto','deliverables/f247-altro.pdf','f2470000-0000-4000-8000-000000000001','Referente TwoBee')$q$,'P0001');
SELECT pg_temp.reject_pub($q$INSERT INTO public.portal_deliverable_versions(client_id,project_id,deliverable_id,file_id,version,title,storage_key,author_id,author_name) VALUES ('f2471000-0000-4000-8000-000000000001','f2472000-0000-4000-8000-000000000001','f2477000-0000-4000-8000-000000000001','f2476000-0000-4000-8000-000000000004',1,'Allegato interno','misc/f247-interno.pdf','f2470000-0000-4000-8000-000000000001','Referente TwoBee')$q$,'P0001');
SELECT pg_temp.reject_pub($q$INSERT INTO public.portal_deliverable_versions(client_id,project_id,deliverable_id,version,title,storage_key,author_id,author_name) VALUES ('f2471000-0000-4000-8000-000000000001','f2472000-0000-4000-8000-000000000001','f2477000-0000-4000-8000-000000000001',1,'Senza file','deliverables/f247-v1.pdf','f2470000-0000-4000-8000-000000000001','Referente TwoBee')$q$,'P0001');
-- Un link Drive resta un collegamento esterno: non diventa una versione con un file.
INSERT INTO public.documents(id,client_id,project_id,name,file_url) VALUES
 ('f247a000-0000-4000-8000-000000000001','f2471000-0000-4000-8000-000000000001','f2472000-0000-4000-8000-000000000001','Link Drive','https://example.invalid/never-fetch');
SELECT pg_temp.reject_pub($q$INSERT INTO public.portal_deliverable_versions(client_id,project_id,document_id,file_id,version,title,storage_key,author_id,author_name) VALUES ('f2471000-0000-4000-8000-000000000001','f2472000-0000-4000-8000-000000000001','f247a000-0000-4000-8000-000000000001','f2476000-0000-4000-8000-000000000001',9,'Documento con file','deliverables/f247-v1.pdf','f2470000-0000-4000-8000-000000000001','Referente TwoBee')$q$,'23514');

INSERT INTO public.portal_deliverable_versions(id,client_id,project_id,deliverable_id,file_id,version,title,storage_key,author_id,author_name,approval_required,published_at,published_by) VALUES
 ('f2478000-0000-4000-8000-000000000001','f2471000-0000-4000-8000-000000000001','f2472000-0000-4000-8000-000000000001','f2477000-0000-4000-8000-000000000001','f2476000-0000-4000-8000-000000000001',1,'Progetto grafico','deliverables/f247-v1.pdf','f2470000-0000-4000-8000-000000000001','Referente TwoBee',true,now(),'f2470000-0000-4000-8000-000000000001');
SELECT pg_temp.check_pub((SELECT count(*)=1 FROM public.portal_activities WHERE version_id='f2478000-0000-4000-8000-000000000001'),'pubblicare una versione crea una sola verifica');
SELECT pg_temp.reject_pub($q$UPDATE public.portal_deliverable_versions SET title='Rinominata' WHERE id='f2478000-0000-4000-8000-000000000001'$q$,'P0001');
SELECT pg_temp.reject_pub($q$DELETE FROM public.portal_deliverable_versions WHERE id='f2478000-0000-4000-8000-000000000001'$q$,'P0001');
SELECT pg_temp.reject_pub($q$INSERT INTO public.portal_deliverable_versions(client_id,project_id,deliverable_id,file_id,version,title,storage_key,author_id,author_name) VALUES ('f2471000-0000-4000-8000-000000000001','f2472000-0000-4000-8000-000000000001','f2477000-0000-4000-8000-000000000001','f2476000-0000-4000-8000-000000000002',1,'Stessa versione','deliverables/f247-v2.pdf','f2470000-0000-4000-8000-000000000001','Referente TwoBee')$q$,'23505');

-- ── Lettura del cliente ─────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','f2470000-0000-4000-8000-000000000002',true);
SELECT pg_temp.check_pub((SELECT count(*)=2 FROM public.portal_activities),'A con scope totale vede attività di progetto e aziendale');
SELECT pg_temp.check_pub((SELECT count(*)=1 FROM public.portal_activities WHERE project_id IS NULL),'l’attività senza progetto arriva a chi ha tutta l’azienda');
SELECT pg_temp.check_pub((SELECT count(*)=1 FROM public.portal_deliverables),'la consegna con una versione pubblicata è leggibile');
SELECT pg_temp.check_pub((SELECT count(*)=1 FROM public.portal_deliverable_versions),'la versione pubblicata è leggibile');
SELECT pg_temp.reject_pub('SELECT storage_key FROM public.portal_deliverable_versions','42501');
SELECT pg_temp.reject_pub('SELECT file_id FROM public.portal_deliverable_versions','42501');
SELECT pg_temp.check_pub((SELECT count(*)=0 FROM public.tasks),'la task interna resta interna');
SELECT pg_temp.check_pub((SELECT count(*)=0 FROM public.files),'i metadati dei file non arrivano al cliente');

SELECT set_config('request.jwt.claim.sub','f2470000-0000-4000-8000-000000000003',true);
SELECT pg_temp.check_pub((SELECT count(*)=0 FROM public.portal_activities WHERE project_id IS NULL),'scope limitato non vede le attività aziendali');
SELECT pg_temp.check_pub((SELECT count(*)=1 FROM public.portal_activities WHERE project_id IS NOT NULL),'scope limitato vede il progetto autorizzato');

SELECT set_config('request.jwt.claim.sub','f2470000-0000-4000-8000-000000000004',true);
SELECT pg_temp.check_pub((SELECT count(*)=0 FROM public.portal_activities),'B non legge le attività di A');
SELECT pg_temp.check_pub((SELECT count(*)=0 FROM public.portal_deliverables),'B non legge le consegne di A');
SELECT pg_temp.check_pub((SELECT count(*)=0 FROM public.portal_deliverable_versions),'B non legge le versioni di A');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);

-- ── Risposta del cliente: solo chi ha l'azienda, e la task torna al team ─────
SELECT pg_temp.reject_pub($q$INSERT INTO public.portal_activity_responses(activity_id,client_id,author_id,body,idempotency_key) VALUES ('f2474000-0000-4000-8000-000000000001','f2471000-0000-4000-8000-000000000001','f2470000-0000-4000-8000-000000000003','Ecco il logo','f2479000-0000-4000-8000-000000000001')$q$,'42501');
INSERT INTO public.portal_activity_responses(activity_id,client_id,author_id,body,idempotency_key) VALUES
 ('f2474000-0000-4000-8000-000000000001','f2471000-0000-4000-8000-000000000001','f2470000-0000-4000-8000-000000000002','Ecco il logo','f2479000-0000-4000-8000-000000000002');
SELECT pg_temp.check_pub((SELECT status='in_verifica' FROM public.portal_activities WHERE id='f2474000-0000-4000-8000-000000000001'),'il materiale mette l’attività in verifica, non completata');
SELECT pg_temp.check_pub((SELECT status='in_review' FROM public.tasks WHERE id='f2473000-0000-4000-8000-000000000001'),'la task interna torna al team');

UPDATE public.tasks SET status='completato' WHERE id='f2473000-0000-4000-8000-000000000001';
SELECT pg_temp.check_pub((SELECT status='completata' FROM public.portal_activities WHERE id='f2474000-0000-4000-8000-000000000001'),'chiudere la task chiude l’attività');
UPDATE public.tasks SET status='da_fare' WHERE id='f2473000-0000-4000-8000-000000000001';
SELECT pg_temp.check_pub((SELECT status='da_fare' FROM public.portal_activities WHERE id='f2474000-0000-4000-8000-000000000001'),'riaprire la task riapre l’attività');
UPDATE public.tasks SET deleted_at=now() WHERE id='f2473000-0000-4000-8000-000000000001';
SELECT pg_temp.check_pub((SELECT published_at IS NULL AND published_by IS NULL FROM public.portal_activities WHERE id='f2474000-0000-4000-8000-000000000001'),'eliminare la task ritira l’attività senza cancellarla');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','f2470000-0000-4000-8000-000000000002',true);
SELECT pg_temp.check_pub((SELECT count(*)=0 FROM public.portal_activities WHERE project_id IS NULL),'l’attività ritirata sparisce dal portale');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);

-- ── Nuova versione: non eredita l'approvazione e supera la precedente ────────
INSERT INTO public.portal_deliverable_versions(id,client_id,project_id,deliverable_id,file_id,version,title,storage_key,author_id,author_name,approval_required,published_at,published_by) VALUES
 ('f2478000-0000-4000-8000-000000000002','f2471000-0000-4000-8000-000000000001','f2472000-0000-4000-8000-000000000001','f2477000-0000-4000-8000-000000000001','f2476000-0000-4000-8000-000000000002',2,'Progetto grafico rivisto','deliverables/f247-v2.pdf','f2470000-0000-4000-8000-000000000001','Referente TwoBee',true,now(),'f2470000-0000-4000-8000-000000000001');
SELECT pg_temp.check_pub((SELECT count(*)=0 FROM public.portal_approvals),'nessuna approvazione ereditata');
SELECT pg_temp.reject_pub($q$INSERT INTO public.portal_approvals(version_id,client_id,project_id,actor_id,outcome) VALUES ('f2478000-0000-4000-8000-000000000001','f2471000-0000-4000-8000-000000000001','f2472000-0000-4000-8000-000000000001','f2470000-0000-4000-8000-000000000002','approvata')$q$,'P0001');
INSERT INTO public.portal_approvals(version_id,client_id,project_id,actor_id,outcome) VALUES
 ('f2478000-0000-4000-8000-000000000002','f2471000-0000-4000-8000-000000000001','f2472000-0000-4000-8000-000000000001','f2470000-0000-4000-8000-000000000002','approvata');
SELECT pg_temp.check_pub((SELECT status='completata' FROM public.portal_activities WHERE version_id='f2478000-0000-4000-8000-000000000002'),'l’approvazione chiude la verifica');

-- ── Ritiro di una singola versione: l'unica modifica ammessa dopo la pubblicazione
SELECT pg_temp.reject_pub($q$UPDATE public.portal_deliverable_versions SET title='Rinominata',retired_at=now(),retired_by='f2470000-0000-4000-8000-000000000001' WHERE id='f2478000-0000-4000-8000-000000000002'$q$,'P0001');
SELECT pg_temp.reject_pub($q$UPDATE public.portal_deliverable_versions SET retired_at=now() WHERE id='f2478000-0000-4000-8000-000000000002'$q$,'23514');
UPDATE public.portal_deliverable_versions SET retired_at=now(),retired_by='f2470000-0000-4000-8000-000000000001' WHERE id='f2478000-0000-4000-8000-000000000002';
SELECT pg_temp.reject_pub($q$UPDATE public.portal_deliverable_versions SET retired_at=NULL,retired_by=NULL WHERE id='f2478000-0000-4000-8000-000000000002'$q$,'P0001');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','f2470000-0000-4000-8000-000000000002',true);
SELECT pg_temp.check_pub((SELECT count(*)=1 FROM public.portal_deliverable_versions),'la versione ritirata sparisce, la precedente resta');
SELECT pg_temp.check_pub((SELECT count(*)=0 FROM public.portal_activities WHERE version_id='f2478000-0000-4000-8000-000000000002'),'sparisce anche la verifica della versione ritirata');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);

-- ── Ritiro del progetto: sparisce tutto quello che ci sta sotto ──────────────
UPDATE public.projects SET portal_published_at=NULL,portal_published_by=NULL WHERE id='f2472000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','f2470000-0000-4000-8000-000000000002',true);
SELECT pg_temp.check_pub((SELECT count(*)=0 FROM public.portal_projects),'il progetto ritirato sparisce');
SELECT pg_temp.check_pub((SELECT count(*)=0 FROM public.portal_deliverables),'le consegne del progetto ritirato spariscono');
SELECT pg_temp.check_pub((SELECT count(*)=0 FROM public.portal_deliverable_versions),'le versioni del progetto ritirato spariscono');
SELECT pg_temp.check_pub((SELECT count(*)=0 FROM public.portal_activities),'le attività del progetto ritirato spariscono');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);

-- Le regole della cartella `deliverables` stanno in 246_storage_isolation.check.sql,
-- dove vive il contratto dello storage.

ROLLBACK;
