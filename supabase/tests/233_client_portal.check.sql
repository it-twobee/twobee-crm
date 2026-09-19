-- Solo database di staging. NON eseguire sul progetto Supabase di produzione.
-- Prerequisito: migration 233. Fixture riconoscibili, tutto annullato a fine suite.
BEGIN;

CREATE FUNCTION pg_temp.check_portal(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', label; END IF; END;
$$;
CREATE FUNCTION pg_temp.reject_portal(statement text, expected_state text DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
DECLARE rejected boolean := false; actual_state text;
BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS actual_state = RETURNED_SQLSTATE;
    IF expected_state IS NOT NULL AND actual_state <> expected_state THEN RAISE; END IF;
    rejected := true;
  END;
  PERFORM pg_temp.check_portal(rejected, 'operazione doveva essere rifiutata: ' || statement);
END;
$$;

INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('f2330000-0000-4000-8000-000000000001','portal-staff@example.invalid','{}'),
 ('f2330000-0000-4000-8000-000000000002','portal-a@example.invalid','{}'),
 ('f2330000-0000-4000-8000-000000000003','portal-b@example.invalid','{}'),
 ('f2330000-0000-4000-8000-000000000004','portal-reader@example.invalid','{}'),
 ('f2330000-0000-4000-8000-000000000005','portal-collaborator@example.invalid','{}'),
 ('f2330000-0000-4000-8000-000000000006','portal-limited@example.invalid','{}'),
 ('f2330000-0000-4000-8000-000000000007','portal-manager@example.invalid','{}');
UPDATE public.profiles SET role='client',app_role='client',is_active=true WHERE email LIKE 'portal-%@example.invalid';
UPDATE public.profiles SET role='admin',app_role='super_admin' WHERE id='f2330000-0000-4000-8000-000000000001';
UPDATE public.profiles SET role='team',app_role='manager' WHERE id='f2330000-0000-4000-8000-000000000007';
SELECT set_config('request.headers','{"x-actor-id":"f2330000-0000-4000-8000-000000000001"}',true);
SELECT set_config('request.jwt.claim.sub','',true);

INSERT INTO public.clients(id,company_name,package,mrr,contract_start,contract_end,payment_status,notes) VALUES
 ('f2331000-0000-4000-8000-000000000001','Azienda portale A','Worker Bee Start',100,'2026-01-01','2026-12-31','pagato','SEGRETO INTERNO A'),
 ('f2331000-0000-4000-8000-000000000002','Azienda portale B','Worker Bee Start',200,'2026-01-01','2026-12-31','pagato','SEGRETO INTERNO B');
INSERT INTO public.projects(id,client_id,name,area,service_type,manager_id,visibility,portal_title,portal_published_at,portal_published_by) VALUES
 ('f2332000-0000-4000-8000-000000000001','f2331000-0000-4000-8000-000000000001','INTERNO A','digital','website','f2330000-0000-4000-8000-000000000001','client_visible','Progetto pubblico A',now(),'f2330000-0000-4000-8000-000000000001'),
 ('f2332000-0000-4000-8000-000000000002','f2331000-0000-4000-8000-000000000002','INTERNO B','digital','website','f2330000-0000-4000-8000-000000000001','client_visible','Progetto pubblico B',now(),'f2330000-0000-4000-8000-000000000001'),
 ('f2332000-0000-4000-8000-000000000003','f2331000-0000-4000-8000-000000000001','RISERVATO A','digital','website',NULL,'client_visible','Progetto pubblico A2',now(),'f2330000-0000-4000-8000-000000000001'),
 ('f2332000-0000-4000-8000-000000000004','f2331000-0000-4000-8000-000000000001','DA TEMPLATE','digital','website',NULL,'client_visible',NULL,NULL,NULL);

INSERT INTO public.portal_memberships(id,client_id,profile_id,portal_role,project_scope,created_by) VALUES
 ('f2335000-0000-4000-8000-000000000001','f2331000-0000-4000-8000-000000000001','f2330000-0000-4000-8000-000000000002','referente','all','f2330000-0000-4000-8000-000000000001'),
 ('f2335000-0000-4000-8000-000000000002','f2331000-0000-4000-8000-000000000002','f2330000-0000-4000-8000-000000000003','referente','all','f2330000-0000-4000-8000-000000000001'),
 ('f2335000-0000-4000-8000-000000000003','f2331000-0000-4000-8000-000000000001','f2330000-0000-4000-8000-000000000004','lettore','all','f2330000-0000-4000-8000-000000000001'),
 ('f2335000-0000-4000-8000-000000000004','f2331000-0000-4000-8000-000000000001','f2330000-0000-4000-8000-000000000005','collaboratore','all','f2330000-0000-4000-8000-000000000001'),
 ('f2335000-0000-4000-8000-000000000005','f2331000-0000-4000-8000-000000000001','f2330000-0000-4000-8000-000000000006','referente','selected','f2330000-0000-4000-8000-000000000001');
INSERT INTO public.portal_project_access VALUES ('f2335000-0000-4000-8000-000000000005','f2331000-0000-4000-8000-000000000001','f2332000-0000-4000-8000-000000000001');
SELECT pg_temp.reject_portal($q$INSERT INTO public.portal_project_access VALUES ('f2335000-0000-4000-8000-000000000005','f2331000-0000-4000-8000-000000000001','f2332000-0000-4000-8000-000000000002')$q$, '23503');

INSERT INTO public.documents(id,client_id,project_id,name,file_url) VALUES
 ('f2333000-0000-4000-8000-000000000001','f2331000-0000-4000-8000-000000000001','f2332000-0000-4000-8000-000000000001','Documento A','https://example.invalid/never-fetch');
INSERT INTO public.portal_deliverable_versions(id,client_id,project_id,document_id,version,title,storage_key,author_id,author_name,approval_required,published_at,published_by) VALUES
 ('f2334000-0000-4000-8000-000000000001','f2331000-0000-4000-8000-000000000001','f2332000-0000-4000-8000-000000000001','f2333000-0000-4000-8000-000000000001',1,'Consegna A','staging/private/a-v1','f2330000-0000-4000-8000-000000000001','Referente TwoBee',true,now(),'f2330000-0000-4000-8000-000000000001');
SELECT pg_temp.check_portal((SELECT count(*)=1 FROM public.portal_activities WHERE version_id='f2334000-0000-4000-8000-000000000001'), 'pubblicare una versione crea una sola attività');

INSERT INTO public.portal_requests(id,client_id,project_id,author_id,kind,title,body,idempotency_key) VALUES
 ('f2336000-0000-4000-8000-000000000001','f2331000-0000-4000-8000-000000000001','f2332000-0000-4000-8000-000000000001','f2330000-0000-4000-8000-000000000002','attivita','Richiesta A','Risultato desiderato','f2337000-0000-4000-8000-000000000001');
SELECT pg_temp.check_portal((SELECT status='in_valutazione' AND assigned_to='f2330000-0000-4000-8000-000000000001' FROM public.portal_requests WHERE id='f2336000-0000-4000-8000-000000000001'), 'nuova attività in valutazione e assegnata al PM');
INSERT INTO public.portal_request_notes(request_id,author_id,body) VALUES
 ('f2336000-0000-4000-8000-000000000001','f2330000-0000-4000-8000-000000000001','NOTA INTERNA MAI PUBBLICA');
INSERT INTO public.portal_request_messages(request_id,client_id,author_id,author_name,body,idempotency_key) VALUES
 ('f2336000-0000-4000-8000-000000000001','f2331000-0000-4000-8000-000000000001','f2330000-0000-4000-8000-000000000001','Referente','Risposta pubblica','f2337000-0000-4000-8000-000000000002');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','f2330000-0000-4000-8000-000000000002',true);
SELECT pg_temp.check_portal((SELECT count(*)=1 FROM public.portal_companies),'A vede una sola azienda');
SELECT pg_temp.check_portal((SELECT count(*)=2 FROM public.portal_projects),'A vede solo i due progetti pubblicati');
SELECT pg_temp.check_portal((SELECT count(*)=0 FROM public.portal_projects WHERE id='f2332000-0000-4000-8000-000000000002'),'URL progetto B non autorizza');
SELECT pg_temp.check_portal((SELECT count(*)=0 FROM public.clients),'nessun accesso diretto a note e margini');
SELECT pg_temp.check_portal((SELECT count(*)=0 FROM public.projects),'nessun accesso diretto alle descrizioni interne');
SELECT pg_temp.check_portal((SELECT count(*)=0 FROM public.documents),'nessun URL file grezzo');
SELECT pg_temp.check_portal((SELECT count(*)=0 FROM public.portal_request_notes),'note interne separate');
SELECT pg_temp.check_portal((SELECT count(*)=0 FROM public.portal_events),'cronologia interna non pubblica');
SELECT pg_temp.check_portal((SELECT count(*)=1 FROM public.portal_request_messages),'risposta pubblica leggibile');
SELECT pg_temp.reject_portal('SELECT storage_key FROM public.portal_deliverable_versions','42501');
SELECT pg_temp.reject_portal('UPDATE public.portal_memberships SET portal_role=''referente''','42501');
SELECT pg_temp.reject_portal('DELETE FROM public.portal_requests','42501');
SELECT pg_temp.reject_portal($q$INSERT INTO public.portal_approvals(version_id,client_id,project_id,actor_id,outcome) VALUES ('f2334000-0000-4000-8000-000000000001','f2331000-0000-4000-8000-000000000001','f2332000-0000-4000-8000-000000000001',auth.uid(),'approvata')$q$,'42501');

SELECT set_config('request.jwt.claim.sub','f2330000-0000-4000-8000-000000000003',true);
SELECT pg_temp.check_portal((SELECT count(*)=1 FROM public.portal_projects),'B vede solo B');
SELECT pg_temp.check_portal((SELECT count(*)=0 FROM public.portal_requests),'B non legge richieste A');
SELECT pg_temp.check_portal((SELECT count(*)=0 FROM public.portal_request_messages),'B non legge risposte A');
SELECT pg_temp.check_portal((SELECT count(*)=0 FROM public.portal_deliverable_versions),'B non legge versioni A');
SELECT set_config('request.jwt.claim.sub','f2330000-0000-4000-8000-000000000006',true);
SELECT pg_temp.check_portal((SELECT count(*)=1 FROM public.portal_projects),'scope selettivo, stesso cliente non basta');
SELECT pg_temp.check_portal(NOT public.portal_can_access('f2331000-0000-4000-8000-000000000001',NULL),'scope limitato non legge richieste generali');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);

-- Le guard server non sostituiscono i vincoli: anche il service role deve passare.
SELECT pg_temp.reject_portal($q$INSERT INTO public.portal_approvals(version_id,client_id,project_id,actor_id,outcome) VALUES ('f2334000-0000-4000-8000-000000000001','f2331000-0000-4000-8000-000000000001','f2332000-0000-4000-8000-000000000001','f2330000-0000-4000-8000-000000000004','approvata')$q$,'42501');
SELECT pg_temp.reject_portal($q$INSERT INTO public.portal_approvals(version_id,client_id,project_id,actor_id,outcome) VALUES ('f2334000-0000-4000-8000-000000000001','f2331000-0000-4000-8000-000000000001','f2332000-0000-4000-8000-000000000001','f2330000-0000-4000-8000-000000000005','approvata')$q$,'42501');
SELECT pg_temp.reject_portal($q$INSERT INTO public.portal_approvals(version_id,client_id,project_id,actor_id,outcome) VALUES ('f2334000-0000-4000-8000-000000000001','f2331000-0000-4000-8000-000000000001','f2332000-0000-4000-8000-000000000001','f2330000-0000-4000-8000-000000000002','modifiche_richieste')$q$,'23514');
INSERT INTO public.portal_approvals(version_id,client_id,project_id,actor_id,outcome) VALUES
 ('f2334000-0000-4000-8000-000000000001','f2331000-0000-4000-8000-000000000001','f2332000-0000-4000-8000-000000000001','f2330000-0000-4000-8000-000000000002','approvata');
SELECT pg_temp.reject_portal($q$UPDATE public.portal_deliverable_versions SET storage_key='sostituito' WHERE id='f2334000-0000-4000-8000-000000000001'$q$,'P0001');
SELECT pg_temp.reject_portal('UPDATE public.portal_approvals SET outcome=''modifiche_richieste''','P0001');

INSERT INTO public.portal_deliverable_versions(id,client_id,project_id,document_id,version,title,storage_key,author_id,author_name,approval_required,published_at,published_by) VALUES
 ('f2334000-0000-4000-8000-000000000002','f2331000-0000-4000-8000-000000000001','f2332000-0000-4000-8000-000000000001','f2333000-0000-4000-8000-000000000001',2,'Consegna A aggiornata','staging/private/a-v2','f2330000-0000-4000-8000-000000000001','Referente TwoBee',true,now(),'f2330000-0000-4000-8000-000000000001');
SELECT pg_temp.check_portal((SELECT count(*)=0 FROM public.portal_approvals WHERE version_id='f2334000-0000-4000-8000-000000000002'),'nuova versione non eredita approvazione');
SELECT pg_temp.check_portal((SELECT count(*)=1 FROM public.portal_activities WHERE version_id='f2334000-0000-4000-8000-000000000002' AND status='da_fare'),'nuova verifica per nuova versione');
SELECT pg_temp.reject_portal($q$INSERT INTO public.portal_approvals(version_id,client_id,project_id,actor_id,outcome) VALUES ('f2334000-0000-4000-8000-000000000001','f2331000-0000-4000-8000-000000000001','f2332000-0000-4000-8000-000000000001','f2330000-0000-4000-8000-000000000006','approvata')$q$,'P0001');

INSERT INTO public.portal_activities(id,client_id,project_id,title,reason,kind,contact_name,published_at,published_by) VALUES
 ('f2338000-0000-4000-8000-000000000001','f2331000-0000-4000-8000-000000000001','f2332000-0000-4000-8000-000000000001','Rispondi alla domanda','Serve a definire il prossimo passo','risposta','Referente',now(),'f2330000-0000-4000-8000-000000000001');
INSERT INTO public.portal_activity_responses(activity_id,client_id,project_id,author_id,body,idempotency_key) VALUES
 ('f2338000-0000-4000-8000-000000000001','f2331000-0000-4000-8000-000000000001','f2332000-0000-4000-8000-000000000001','f2330000-0000-4000-8000-000000000005','Ecco la risposta','f2337000-0000-4000-8000-000000000003');
SELECT pg_temp.check_portal((SELECT status='in_verifica' FROM public.portal_activities WHERE id='f2338000-0000-4000-8000-000000000001'),'risposta in verifica, non completata');
SELECT pg_temp.reject_portal($q$INSERT INTO public.portal_requests(client_id,project_id,author_id,kind,title,body,idempotency_key) VALUES ('f2331000-0000-4000-8000-000000000001','f2332000-0000-4000-8000-000000000001','f2330000-0000-4000-8000-000000000002','attivita','Duplicata','Test','f2337000-0000-4000-8000-000000000001')$q$,'23505');
SELECT pg_temp.reject_portal($q$UPDATE public.portal_requests SET status='chiusa' WHERE id='f2336000-0000-4000-8000-000000000001'$q$,'P0001');
SELECT pg_temp.reject_portal($q$UPDATE public.portal_requests SET status='non_accolta' WHERE id='f2336000-0000-4000-8000-000000000001'$q$,'23514');
SELECT pg_temp.reject_portal($q$UPDATE public.projects SET portal_target_date='2027-01-01' WHERE id='f2332000-0000-4000-8000-000000000001'$q$,'P0001');

UPDATE public.portal_memberships SET revoked_at=now() WHERE id='f2335000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','f2330000-0000-4000-8000-000000000002',true);
SELECT pg_temp.check_portal((SELECT count(*)=0 FROM public.portal_companies),'revoca azienda immediata');
SELECT pg_temp.check_portal((SELECT count(*)=0 FROM public.portal_projects),'revoca progetti immediata');
SELECT pg_temp.check_portal((SELECT count(*)=0 FROM public.portal_request_messages),'revoca risposte immediata');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT pg_temp.reject_portal($q$INSERT INTO public.portal_approvals(version_id,client_id,project_id,actor_id,outcome) VALUES ('f2334000-0000-4000-8000-000000000002','f2331000-0000-4000-8000-000000000001','f2332000-0000-4000-8000-000000000001','f2330000-0000-4000-8000-000000000002','approvata')$q$,'42501');

UPDATE public.projects SET portal_published_at=NULL,portal_published_by=NULL WHERE id='f2332000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','f2330000-0000-4000-8000-000000000006',true);
SELECT pg_temp.check_portal((SELECT count(*)=0 FROM public.portal_deliverable_versions),'ritiro progetto nasconde versioni');
SELECT pg_temp.check_portal((SELECT count(*)=0 FROM public.portal_activities),'ritiro progetto nasconde attività');
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','',true);
UPDATE public.clients SET workspace_hidden=true WHERE id='f2331000-0000-4000-8000-000000000002';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','f2330000-0000-4000-8000-000000000007',true);
SELECT pg_temp.check_portal((SELECT count(*)=1 FROM public.portal_companies WHERE id='f2331000-0000-4000-8000-000000000001'),'manager vede azienda workspace senza membership cliente');
SELECT pg_temp.check_portal((SELECT count(*)=0 FROM public.portal_companies WHERE id='f2331000-0000-4000-8000-000000000002'),'manager non vede azienda nascosta al workspace');
SELECT pg_temp.check_portal((SELECT count(*)=0 FROM public.portal_projects WHERE id='f2332000-0000-4000-8000-000000000002'),'manager non vede progetti azienda nascosta');
SELECT pg_temp.check_portal((SELECT count(*)=1 FROM public.portal_projects WHERE id='f2332000-0000-4000-8000-000000000003'),'manager vede progetto pubblicato autorizzato');
SELECT pg_temp.reject_portal('UPDATE public.portal_memberships SET portal_role=''referente''','42501');
SELECT set_config('request.jwt.claim.sub','f2330000-0000-4000-8000-000000000001',true);
SELECT pg_temp.check_portal((SELECT count(*)=1 FROM public.portal_companies WHERE id='f2331000-0000-4000-8000-000000000002'),'super admin conserva anteprima amministrativa');
RESET ROLE;
SELECT pg_temp.check_portal(NOT EXISTS (SELECT 1 FROM public.portal_events WHERE actor_id IS NULL),'cronologia attribuita');
SELECT pg_temp.check_portal((SELECT count(*)>0 FROM public.portal_events),'cronologia realmente scritta');
ROLLBACK;
