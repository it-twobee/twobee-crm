-- Solo database di staging: eseguire dopo 223_sales_workspace.sql con psql -v ON_ERROR_STOP=1.
-- Tutti i dati di prova sono annullati dal ROLLBACK finale.
BEGIN;
INSERT INTO public.service_catalog(id,area,service_type,label,price_unit) VALUES
 ('f0000000-0000-4000-8000-000000000099','digital','sito_web','Servizio test commerciale','una_tantum');
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('f0000000-0000-4000-8000-000000000001','sales-admin@example.invalid','{"full_name":"Sales test admin"}'),
 ('f0000000-0000-4000-8000-000000000002','sales-a@example.invalid','{"full_name":"Sales test A"}'),
 ('f0000000-0000-4000-8000-000000000003','sales-b@example.invalid','{"full_name":"Sales test B"}');
INSERT INTO public.profiles(id,email,full_name,role,app_role,is_active) VALUES
 ('f0000000-0000-4000-8000-000000000001','sales-admin@example.invalid','Sales test admin','admin','admin',true),
 ('f0000000-0000-4000-8000-000000000002','sales-a@example.invalid','Sales test A','team','senior',true),
 ('f0000000-0000-4000-8000-000000000003','sales-b@example.invalid','Sales test B','team','senior',true)
ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role,app_role=EXCLUDED.app_role,is_active=true;
INSERT INTO public.profile_permissions(profile_id,permission,granted) VALUES
 ('f0000000-0000-4000-8000-000000000002','can_view_deals',true),
 ('f0000000-0000-4000-8000-000000000003','can_view_deals',true)
ON CONFLICT(profile_id,permission) DO UPDATE SET granted=true;

SET LOCAL ROLE service_role;
DO $$ DECLARE
  actor uuid := 'f0000000-0000-4000-8000-000000000002';
  req uuid := 'f0000000-0000-4000-8000-000000000011';
  v_id uuid; repeated uuid; v_client uuid; d public.deals; payload jsonb;
BEGIN
  payload := jsonb_build_object('title','Prova commerciale','company_name','Azienda prova commerciale',
    'assigned_to',actor,'contact_name','Referente','contact_phone','0212345',
    'next_action','Primo contatto','next_action_on','2026-09-16','monthly_value',1000);
  v_id := public.sales_command(actor,req,'create',NULL,payload);
  repeated := public.sales_command(actor,req,'create',NULL,payload);
  IF v_id<>repeated THEN RAISE EXCEPTION 'Creazione non idempotente'; END IF;
  SELECT * INTO d FROM public.deals WHERE id=v_id;
  v_client := d.client_id;
  IF (SELECT count(*) FROM public.deal_activities WHERE deal_id=v_id)<>1 THEN RAISE EXCEPTION 'Attività duplicate'; END IF;
  IF (SELECT count(*) FROM public.chat_channels WHERE client_id=v_client)<>2 THEN RAISE EXCEPTION 'Canali duplicati'; END IF;
  IF (SELECT client_label FROM public.clients WHERE id=v_client)<>'lead' THEN RAISE EXCEPTION 'Anagrafica non lead'; END IF;
  IF (SELECT mrr FROM public.clients WHERE id=v_client)<>0 THEN RAISE EXCEPTION 'MRR dalla vendita'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.client_contacts WHERE client_id=v_client AND phone='0212345') THEN RAISE EXCEPTION 'Referente perso'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.activity_log WHERE entity_type='deals' AND entity_id=v_id AND user_id=actor)
    THEN RAISE EXCEPTION 'Cronologia commerciale senza attore'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.activity_log WHERE entity_type='clients' AND entity_id=v_client AND user_id=actor)
    THEN RAISE EXCEPTION 'Anagrafica senza attore'; END IF;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.sales_options(actor)->'clients') c
    WHERE c->>'id'=v_client::text) THEN RAISE EXCEPTION 'Opzioni prive della nuova azienda'; END IF;
  BEGIN
    PERFORM public.sales_command('f0000000-0000-4000-8000-000000000003',gen_random_uuid(),'outcome',v_id,
      '{"revision":0,"outcome":"persa","content":"Non autorizzato"}');
    RAISE EXCEPTION 'Owner B ha modificato A' USING ERRCODE='XX000';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%non accessibile%' THEN RAISE; END IF;
  END;
  PERFORM public.sales_command(actor,gen_random_uuid(),'outcome',v_id,
    '{"revision":0,"outcome":"proposta","content":"Inviata manualmente","proposal_ref":"Proposta v1"}');
  BEGIN
    PERFORM public.sales_command(actor,gen_random_uuid(),'outcome',v_id,
      '{"revision":0,"outcome":"persa","content":"Salvataggio obsoleto"}');
    RAISE EXCEPTION 'Revision obsoleta accettata' USING ERRCODE='XX000';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%scheda è cambiata%' THEN RAISE; END IF;
  END;
  PERFORM public.sales_command(actor,gen_random_uuid(),'outcome',v_id,
    '{"revision":1,"outcome":"vinta","content":"Accettata per email"}');
  IF (SELECT mrr FROM public.clients WHERE id=v_client)<>0 THEN RAISE EXCEPTION 'Vittoria altera MRR'; END IF;
  IF EXISTS(SELECT 1 FROM public.projects WHERE client_id=v_client) THEN RAISE EXCEPTION 'Vittoria crea progetti automaticamente'; END IF;
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000003',true);
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.deals WHERE created_by='f0000000-0000-4000-8000-000000000002') THEN RAISE EXCEPTION 'RLS: B vede A'; END IF;
  IF EXISTS(SELECT 1 FROM public.deal_activities WHERE created_by='f0000000-0000-4000-8000-000000000002') THEN RAISE EXCEPTION 'RLS: storico esposto'; END IF;
  IF EXISTS(SELECT 1 FROM public.activity_log WHERE entity_type='deals' AND user_id='f0000000-0000-4000-8000-000000000002') THEN RAISE EXCEPTION 'RLS: snapshot esposto'; END IF;
  BEGIN
    PERFORM public.sales_command('f0000000-0000-4000-8000-000000000001',gen_random_uuid(),'create',NULL,'{}');
    RAISE EXCEPTION 'RPC accessibile dal browser' USING ERRCODE='XX000';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.deals SET stage='chiuso_vinto';
    RAISE EXCEPTION 'UPDATE diretto consentito' USING ERRCODE='XX000';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000002',true);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.deals WHERE created_by='f0000000-0000-4000-8000-000000000002')<>1
    THEN RAISE EXCEPTION 'RLS: owner non legge la propria opportunità'; END IF;
END $$;
RESET ROLE;

SET LOCAL ROLE service_role;
DO $$ DECLARE
  d public.deals; sid uuid; request uuid := gen_random_uuid(); result uuid; again uuid; lost uuid; payload jsonb;
BEGIN
  SELECT * INTO d FROM public.deals WHERE request_id='f0000000-0000-4000-8000-000000000011';
  sid := 'f0000000-0000-4000-8000-000000000099';
  IF sid IS NULL THEN RAISE EXCEPTION 'Serve un servizio attivo nel catalogo di staging'; END IF;
  payload := jsonb_build_object('revision',d.revision,'delivery_owner_id','f0000000-0000-4000-8000-000000000001',
    'contact_id',d.contact_id,'proposal_ref','Proposta v1','service_id',sid,'delivery',jsonb_build_object(
      'goals','Nuovo sito','services','Sito web','included','Tre pagine','excluded','Ads','promises','Materiali del cliente','materials','Logo','missing',''));
  result := public.sales_command('f0000000-0000-4000-8000-000000000001',request,'delivery_complete',d.id,payload);
  again := public.sales_command('f0000000-0000-4000-8000-000000000001',request,'delivery_complete',d.id,payload);
  IF result<>again OR (SELECT count(*) FROM public.projects WHERE client_id=d.client_id)<>1 THEN RAISE EXCEPTION 'Delivery duplicata'; END IF;
  IF (SELECT count(*) FROM public.sales_handoffs WHERE deal_id=d.id)<>1 THEN RAISE EXCEPTION 'Riepilogo delivery mancante'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.projects WHERE id=result AND status='draft' AND visibility='internal')
    THEN RAISE EXCEPTION 'Progetto non in bozza interna'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.project_members WHERE project_id=result
    AND profile_id='f0000000-0000-4000-8000-000000000001' AND role_in_project='manager')
    THEN RAISE EXCEPTION 'Responsabile progetto mancante'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.milestones WHERE project_id=result AND milestone_type='system')
    THEN RAISE EXCEPTION 'Milestone di sistema mancante'; END IF;
  IF (SELECT client_label FROM public.clients WHERE id=d.client_id)<>'stabile' THEN RAISE EXCEPTION 'Lead non convertito'; END IF;
  IF EXISTS(SELECT 1 FROM public.revenue_streams WHERE client_id=d.client_id) THEN RAISE EXCEPTION 'Contratto automatico'; END IF;
  lost := public.sales_command('f0000000-0000-4000-8000-000000000002',gen_random_uuid(),'create',NULL,
    jsonb_build_object('title','Seconda opportunità','client_id',d.client_id,'contact_id',d.contact_id,
      'assigned_to','f0000000-0000-4000-8000-000000000002','next_action','Contattare','next_action_on','2026-09-16'));
  PERFORM public.sales_command('f0000000-0000-4000-8000-000000000002',gen_random_uuid(),'outcome',lost,
    '{"revision":0,"outcome":"persa","content":"Budget non disponibile"}');
  IF (SELECT client_label FROM public.clients WHERE id=d.client_id)<>'stabile' THEN RAISE EXCEPTION 'Perdita opportunità cambia label cliente'; END IF;
  UPDATE public.profile_permissions SET granted=false WHERE profile_id='f0000000-0000-4000-8000-000000000002' AND permission='can_view_deals';
  IF public.sales_access('f0000000-0000-4000-8000-000000000002') IS NOT NULL THEN RAISE EXCEPTION 'Revoca inefficace'; END IF;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000002',true);
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.deals) OR EXISTS(SELECT 1 FROM public.deal_activities) THEN
    RAISE EXCEPTION 'RLS: lettura consentita dopo revoca';
  END IF;
END $$;
RESET ROLE;
SET LOCAL ROLE service_role;
UPDATE public.profiles SET app_role='manager'
  WHERE id='f0000000-0000-4000-8000-000000000003';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000003',true);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.deals) <> 2 THEN
    RAISE EXCEPTION 'Manager abilitato non vede tutte le opportunità';
  END IF;
END $$;
SET LOCAL ROLE service_role;
UPDATE public.profiles SET is_active=false
  WHERE id='f0000000-0000-4000-8000-000000000003';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.deals) THEN RAISE EXCEPTION 'Profilo disattivato legge le opportunità'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
