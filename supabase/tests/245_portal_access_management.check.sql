-- Solo staging o runner isolato. Non eseguire fixture in produzione.
BEGIN;
CREATE FUNCTION pg_temp.check_access(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF; END;
$$;
CREATE FUNCTION pg_temp.reject_access(statement text,expected text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE code text;
BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS code=RETURNED_SQLSTATE;
    IF code<>expected THEN RAISE; END IF;
    RETURN;
  END;
  RAISE EXCEPTION 'Operazione accettata indebitamente: %',statement;
END;
$$;
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('f2450000-0000-4000-8000-000000000001','access-manager@example.invalid','{}'),
 ('f2450000-0000-4000-8000-000000000002','access-client@example.invalid','{}'),
 ('f2450000-0000-4000-8000-000000000003','access-other@example.invalid','{}'),
 ('f2450000-0000-4000-8000-000000000004','access-junior@example.invalid','{}');
UPDATE public.profiles SET role='client',app_role='client' WHERE email LIKE 'access-%@example.invalid';
UPDATE public.profiles SET role='team',app_role='manager' WHERE id='f2450000-0000-4000-8000-000000000001';
UPDATE public.profiles SET role='team',app_role='junior' WHERE id='f2450000-0000-4000-8000-000000000004';
INSERT INTO public.clients(id,company_name,workspace_hidden,client_label) VALUES
 ('f2451000-0000-4000-8000-000000000001','Azienda accessi A',false,'stabile'),
 ('f2451000-0000-4000-8000-000000000002','Azienda accessi B',false,'stabile'),
 ('f2451000-0000-4000-8000-000000000003','Azienda nascosta',true,'stabile'),
 ('f2451000-0000-4000-8000-000000000004','Lead',false,'lead');
INSERT INTO public.projects(id,client_id,name,area) VALUES
 ('f2452000-0000-4000-8000-000000000001','f2451000-0000-4000-8000-000000000001','A1','digital'),
 ('f2452000-0000-4000-8000-000000000002','f2451000-0000-4000-8000-000000000002','B1','digital');
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.headers','{"x-actor-id":"f2450000-0000-4000-8000-000000000001"}',true);
SET LOCAL ROLE service_role;
SELECT public.portal_save_access('f2451000-0000-4000-8000-000000000001','f2450000-0000-4000-8000-000000000002','referente','all','{}');
SELECT public.portal_save_access('f2451000-0000-4000-8000-000000000002','f2450000-0000-4000-8000-000000000003','lettore','all','{}');
SELECT pg_temp.check_access((SELECT count(*)=2 FROM public.portal_memberships),'una membership per azienda/persona');
SELECT pg_temp.reject_access($q$SELECT public.portal_save_access('f2451000-0000-4000-8000-000000000001','f2450000-0000-4000-8000-000000000002','referente','all','{}')$q$,'40001');
SELECT pg_temp.reject_access($q$SELECT public.portal_save_access('f2451000-0000-4000-8000-000000000001','f2450000-0000-4000-8000-000000000002','admin','all','{}',1)$q$,'22023');
SELECT pg_temp.reject_access($q$SELECT public.portal_save_access('f2451000-0000-4000-8000-000000000001','f2450000-0000-4000-8000-000000000004','lettore','all','{}')$q$,'42501');
SELECT pg_temp.reject_access($q$SELECT public.portal_save_access('f2451000-0000-4000-8000-000000000001','f2450000-0000-4000-8000-000000000002','lettore','selected','{f2452000-0000-4000-8000-000000000002}',1)$q$,'42501');
SELECT pg_temp.check_access((SELECT revision=1 AND project_scope='all' FROM public.portal_memberships WHERE client_id='f2451000-0000-4000-8000-000000000001'),'scope estraneo non lascia scritture parziali');
SELECT pg_temp.reject_access($q$SELECT public.portal_save_access('f2451000-0000-4000-8000-000000000003','f2450000-0000-4000-8000-000000000002','lettore','all','{}')$q$,'42501');
SELECT pg_temp.reject_access($q$SELECT public.portal_save_access('f2451000-0000-4000-8000-000000000004','f2450000-0000-4000-8000-000000000002','lettore','all','{}')$q$,'P0001');
SELECT public.portal_save_access('f2451000-0000-4000-8000-000000000001','f2450000-0000-4000-8000-000000000002','lettore','selected','{f2452000-0000-4000-8000-000000000001}',1);
SELECT pg_temp.check_access((SELECT count(*)=1 FROM public.portal_project_access),'scope salvato');
SELECT public.portal_revoke_access('f2451000-0000-4000-8000-000000000001','f2450000-0000-4000-8000-000000000002',2);
SELECT pg_temp.reject_access($q$SELECT public.portal_save_access('f2451000-0000-4000-8000-000000000001','f2450000-0000-4000-8000-000000000002','referente','all','{}',2)$q$,'40001');
SELECT pg_temp.check_access((SELECT revoked_at IS NOT NULL AND revision=3 FROM public.portal_memberships WHERE client_id='f2451000-0000-4000-8000-000000000001'),'modifica obsoleta non annulla la revoca');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','f2450000-0000-4000-8000-000000000002',true);
SELECT pg_temp.check_access((SELECT count(*)=0 FROM public.portal_companies),'revoca effettiva in lettura');
SELECT pg_temp.reject_access($q$SELECT public.portal_save_access('f2451000-0000-4000-8000-000000000001','f2450000-0000-4000-8000-000000000002','referente','all','{}',3)$q$,'42501');
SELECT set_config('request.jwt.claim.sub','f2450000-0000-4000-8000-000000000003',true);
SELECT pg_temp.check_access((SELECT count(*)=1 FROM public.portal_companies),'revoca A non tocca B');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE service_role;
SELECT public.portal_save_access('f2451000-0000-4000-8000-000000000001','f2450000-0000-4000-8000-000000000002','collaboratore','all','{}',3);
SELECT pg_temp.check_access((SELECT count(*)=0 FROM public.portal_project_access),'tutti i progetti elimina scope residuo');
SELECT set_config('request.headers','{"x-actor-id":"f2450000-0000-4000-8000-000000000004"}',true);
SELECT pg_temp.reject_access($q$SELECT public.portal_revoke_access('f2451000-0000-4000-8000-000000000001','f2450000-0000-4000-8000-000000000002',4)$q$,'42501');
RESET ROLE;
UPDATE public.profiles SET is_active=false WHERE id='f2450000-0000-4000-8000-000000000001';
SELECT set_config('request.headers','{"x-actor-id":"f2450000-0000-4000-8000-000000000001"}',true);
SET LOCAL ROLE service_role;
SELECT pg_temp.reject_access($q$SELECT public.portal_access_manager('f2451000-0000-4000-8000-000000000001')$q$,'42501');
SELECT pg_temp.check_access((SELECT count(*)>0 FROM public.portal_events WHERE actor_id='f2450000-0000-4000-8000-000000000001'),'audit attribuito al manager');
RESET ROLE;
ROLLBACK;
