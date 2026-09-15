-- Commerciale v1. Applicare in staging e verificare 223_sales.check.sql prima del rilascio.
BEGIN;
SET LOCAL lock_timeout = '5s';

-- Il reset ha rimosso la 011: ripristinare solo le due strutture commerciali,
-- non le sue policy aperte né gli altri domini storici. RLS/grant sotto, nella
-- stessa transazione: le nuove tabelle non sono mai pubblicamente scrivibili.
CREATE TABLE IF NOT EXISTS public.deals (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  company_name text NOT NULL,
  contact_name text,
  contact_email text,
  contact_phone text,
  value numeric(12,2),
  stage text NOT NULL DEFAULT 'lead'
    CHECK (stage IN ('lead','contatto','proposta','trattativa','chiuso_vinto','chiuso_perso')),
  probability integer DEFAULT 50 CHECK (probability BETWEEN 0 AND 100),
  expected_close date,
  source text,
  notes text,
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.deal_activities (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('nota','chiamata','email','meeting','followup')),
  content text NOT NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES public.client_contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS need text,
  ADD COLUMN IF NOT EXISTS blocker text,
  ADD COLUMN IF NOT EXISTS next_action text,
  ADD COLUMN IF NOT EXISTS next_action_on date,
  ADD COLUMN IF NOT EXISTS resume_on date,
  ADD COLUMN IF NOT EXISTS monthly_value numeric(12,2) CHECK (monthly_value >= 0),
  ADD COLUMN IF NOT EXISTS setup_value numeric(12,2) CHECK (setup_value >= 0),
  ADD COLUMN IF NOT EXISTS one_off_value numeric(12,2) CHECK (one_off_value >= 0),
  ADD COLUMN IF NOT EXISTS proposal_ref text,
  ADD COLUMN IF NOT EXISTS loss_reason text,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_interaction_at timestamptz,
  ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS request_id uuid UNIQUE,
  ADD COLUMN IF NOT EXISTS delivery jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS delivery_owner_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS delivery_project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivery_completed_at timestamptz;
ALTER TABLE public.deals DROP CONSTRAINT IF EXISTS deals_stage_check;
ALTER TABLE public.deals ADD CONSTRAINT deals_stage_check CHECK
  (stage IN ('lead','contatto','qualificata','perimetro','proposta','trattativa','chiuso_vinto','chiuso_perso'));
ALTER TABLE public.deal_activities
  ADD COLUMN IF NOT EXISTS outcome text,
  ADD COLUMN IF NOT EXISTS next_action_on date;
CREATE INDEX IF NOT EXISTS deals_owner_next ON public.deals(assigned_to,next_action_on);
CREATE INDEX IF NOT EXISTS deal_activities_timeline ON public.deal_activities(deal_id,created_at);
DROP TRIGGER IF EXISTS trg_log_deals ON public.deals;
CREATE TRIGGER trg_log_deals AFTER INSERT OR UPDATE OR DELETE ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();

-- L'idempotenza appartiene alla transazione, anche se la risposta HTTP si perde.
CREATE TABLE IF NOT EXISTS public.sales_commands (
  id uuid PRIMARY KEY, actor_id uuid NOT NULL REFERENCES public.profiles(id),
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE, command text NOT NULL,
  result uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sales_commands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sales_commands FROM anon, authenticated;
GRANT ALL ON public.sales_commands TO service_role;

CREATE TABLE IF NOT EXISTS public.sales_handoffs (
  deal_id uuid PRIMARY KEY REFERENCES public.deals(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  summary jsonb NOT NULL, proposal_ref text NOT NULL,
  contact_id uuid REFERENCES public.client_contacts(id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sales_handoffs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sales_handoffs FROM anon,authenticated;
GRANT SELECT ON public.sales_handoffs TO authenticated;
GRANT ALL ON public.sales_handoffs TO service_role;
DROP POLICY IF EXISTS sales_handoffs_read ON public.sales_handoffs;
CREATE POLICY sales_handoffs_read ON public.sales_handoffs FOR SELECT TO authenticated USING (
  public.get_my_app_role() IN ('super_admin','founder','admin') OR (
    public.get_my_app_role() IN ('manager','senior','junior','stage','freelance','partner')
    AND project_id = ANY(public.get_my_v2_project_ids())
  )
);

CREATE OR REPLACE FUNCTION public.sales_access(p_actor uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN p.app_role IN ('super_admin','founder','admin') THEN 'admin'
    WHEN EXISTS (SELECT 1 FROM profile_permissions g WHERE g.profile_id=p.id AND g.permission='can_view_deals' AND g.granted)
      THEN CASE WHEN p.app_role='manager' THEN 'manager'
        WHEN p.app_role IN ('senior','junior','stage','freelance','partner') THEN 'owner' END
    END
  FROM profiles p WHERE p.id=p_actor AND p.is_active IS DISTINCT FROM false
$$;
REVOKE ALL ON FUNCTION public.sales_access(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_access(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.sales_can_read(p_owner uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(public.sales_access(auth.uid()) IN ('admin','manager')
    OR (public.sales_access(auth.uid())='owner' AND p_owner=auth.uid()),false)
$$;
REVOKE ALL ON FUNCTION public.sales_can_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_can_read(uuid) TO authenticated, service_role;

-- Le policy permissive si sommano: rimuovere anche eventuali copie sopravvissute al reset.
DO $$ DECLARE p record; BEGIN
  FOR p IN SELECT tablename,policyname FROM pg_policies WHERE schemaname='public'
    AND tablename IN ('deals','deal_activities') LOOP
    EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,p.tablename);
  END LOOP;
END $$;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_activities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.deals, public.deal_activities FROM anon, authenticated;
GRANT SELECT ON public.deals, public.deal_activities TO authenticated;
GRANT ALL ON public.deals, public.deal_activities TO service_role;
CREATE POLICY sales_deals_read ON public.deals FOR SELECT TO authenticated
  USING (public.sales_can_read(assigned_to));
CREATE POLICY sales_activities_read ON public.deal_activities FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.deals d WHERE d.id=deal_id));
DROP POLICY IF EXISTS sales_history_scope ON public.activity_log;
CREATE POLICY sales_history_scope ON public.activity_log AS RESTRICTIVE FOR SELECT TO authenticated
  USING (entity_type NOT IN ('deals','deal') OR EXISTS
    (SELECT 1 FROM public.deals d WHERE d.id=entity_id));

CREATE OR REPLACE FUNCTION public.sales_client_allowed(p_actor uuid,p_client uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM clients c JOIN profiles p ON p.id=p_actor WHERE c.id=p_client
    AND public.sales_access(p_actor) IS NOT NULL AND (
      public.sales_access(p_actor)='admin' OR (NOT COALESCE(c.workspace_hidden,false) AND (
        p.app_role NOT IN ('freelance','partner') OR c.created_by=p_actor OR EXISTS (
          SELECT 1 FROM project_members pm JOIN projects pr ON pr.id=pm.project_id
          WHERE pm.profile_id=p_actor AND pr.client_id=c.id AND pr.deleted_at IS NULL
        ) OR EXISTS (SELECT 1 FROM deals d WHERE d.client_id=c.id AND d.assigned_to=p_actor)
      ))))
$$;
REVOKE ALL ON FUNCTION public.sales_client_allowed(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sales_client_allowed(uuid,uuid) TO service_role;

-- Porta canonica per anagrafica + referenti + canali, riusata da createClientRecord.
CREATE OR REPLACE FUNCTION public.create_client_bundle(p_input jsonb,p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.clients; person jsonb; n text := btrim(p_input->>'display_name'); channel_name text;
BEGIN
  IF n IS NULL OR n='' THEN RAISE EXCEPTION 'Il nome è obbligatorio'; END IF;
  PERFORM set_config('app.current_user_id',p_actor::text,true);
  INSERT INTO clients(company_name,display_name,legal_name,client_type,client_label,is_internal,internal_kind,
    industry,market_area,active_channels,notes,mrr,ad_budget_monthly,contract_start,contract_end,payment_status,
    target_leads_monthly,target_roas,target_revenue_monthly,target_cpa,target_followers_monthly,target_ctr,target_conv_rate,goals_notes,created_by)
  VALUES(n,n,NULLIF(btrim(p_input->>'legal_name'),''),p_input->>'client_type',p_input->>'client_label',
    COALESCE((p_input->>'is_internal')::boolean,false),
    CASE WHEN (p_input->>'is_internal')::boolean THEN COALESCE(p_input->>'internal_kind','giro') END,
    NULLIF(p_input->>'industry',''),NULLIF(btrim(p_input->>'market_area'),''),
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_input->'active_channels','[]'))),
    NULLIF(btrim(p_input->>'notes'),''),(p_input->>'mrr')::numeric,(p_input->>'ad_budget_monthly')::numeric,
    (p_input->>'contract_start')::date,(p_input->>'contract_end')::date,p_input->>'payment_status',
    (p_input->>'target_leads_monthly')::numeric,(p_input->>'target_roas')::numeric,
    (p_input->>'target_revenue_monthly')::numeric,(p_input->>'target_cpa')::numeric,
    (p_input->>'target_followers_monthly')::numeric,(p_input->>'target_ctr')::numeric,
    (p_input->>'target_conv_rate')::numeric,NULLIF(btrim(p_input->>'goals_notes'),''),p_actor) RETURNING * INTO c;
  FOR person IN SELECT * FROM jsonb_array_elements(COALESCE(p_input->'contacts','[]')) LOOP
    IF COALESCE(btrim(person->>'full_name'),'')<>'' THEN
      INSERT INTO client_contacts(client_id,full_name,email,phone,role,is_primary)
        VALUES(c.id,btrim(person->>'full_name'),COALESCE(btrim(person->>'email'),''),
          NULLIF(btrim(person->>'phone'),''),NULLIF(btrim(person->>'role'),''),COALESCE((person->>'is_primary')::boolean,false));
    END IF;
  END LOOP;
  channel_name := COALESCE(NULLIF(trim(both '-' FROM regexp_replace(lower(n),'[^a-z0-9]+','-','g')),''),'cliente');
  INSERT INTO chat_channels(name,type,client_id) VALUES
    (left(channel_name,40),'cliente',c.id),('cc-'||left(channel_name,37),'customer_care',c.id);
  RETURN to_jsonb(c);
END $$;
REVOKE ALL ON FUNCTION public.create_client_bundle(jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_client_bundle(jsonb,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.sales_options(p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE a text := public.sales_access(p_actor); result jsonb;
BEGIN
  IF a IS NULL THEN RAISE EXCEPTION 'Accesso commerciale non abilitato'; END IF;
  SELECT jsonb_build_object(
    'clients',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',c.id,'name',COALESCE(c.display_name,c.company_name)) ORDER BY c.company_name)
      FROM clients c WHERE public.sales_client_allowed(p_actor,c.id)),'[]'::jsonb),
    'contacts',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',c.id,'client_id',c.client_id,'full_name',c.full_name,'email',c.email,'phone',c.phone))
      FROM client_contacts c WHERE public.sales_client_allowed(p_actor,c.client_id)),'[]'::jsonb),
    'people',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'full_name',p.full_name,'app_role',p.app_role,
      'enabled',public.sales_access(p.id) IS NOT NULL) ORDER BY p.full_name) FROM profiles p
      WHERE p.is_active IS DISTINCT FROM false AND p.app_role IN ('super_admin','founder','admin','manager','senior','junior','stage','freelance','partner')
      AND (a IN ('admin','manager') OR p.id=p_actor OR public.sales_access(p.id) IN ('admin','manager'))),'[]'::jsonb),
    'projects',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'client_id',p.client_id,'name',p.name)) FROM projects p
      WHERE p.deleted_at IS NULL AND public.sales_client_allowed(p_actor,p.client_id)
      AND (a IN ('admin','manager') OR EXISTS(SELECT 1 FROM project_members pm WHERE pm.project_id=p.id AND pm.profile_id=p_actor))),'[]'::jsonb),
    'services',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',s.id,'label',s.label,'area',s.area,'service_type',s.service_type,'service_subtype',s.service_subtype) ORDER BY s.sort_order)
      FROM service_catalog s WHERE s.is_active),'[]'::jsonb)
  ) INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.sales_options(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sales_options(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.sales_command(p_actor uuid,p_request uuid,p_command text,p_deal uuid,p_input jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a text := public.sales_access(p_actor); d public.deals; prior public.sales_commands;
  v_client uuid; v_contact uuid; v_owner uuid; v_project uuid; c jsonb; s public.service_catalog;
  v_outcome text; v_date date; v_content text; v_stage text; v_delivery jsonb;
BEGIN
  IF a IS NULL THEN RAISE EXCEPTION 'Accesso commerciale non abilitato'; END IF;
  IF p_request IS NULL THEN RAISE EXCEPTION 'Identificativo richiesta mancante'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text,0));
  SELECT * INTO prior FROM sales_commands WHERE id=p_request;
  IF FOUND THEN
    IF prior.actor_id<>p_actor OR prior.command<>p_command OR (p_deal IS NOT NULL AND prior.deal_id<>p_deal)
      THEN RAISE EXCEPTION 'Richiesta già utilizzata'; END IF;
    IF NOT EXISTS(SELECT 1 FROM deals x WHERE x.id=prior.deal_id AND (a IN ('admin','manager') OR x.assigned_to=p_actor))
      THEN RAISE EXCEPTION 'Permesso negato'; END IF;
    RETURN prior.result;
  END IF;
  PERFORM set_config('app.current_user_id',p_actor::text,true);

  IF p_command='create' THEN
    v_owner := (p_input->>'assigned_to')::uuid;
    IF public.sales_access(v_owner) IS NULL OR (a='owner' AND v_owner<>p_actor) THEN RAISE EXCEPTION 'Responsabile non abilitato'; END IF;
    v_client := NULLIF(p_input->>'client_id','')::uuid;
    v_contact := NULLIF(p_input->>'contact_id','')::uuid;
    IF v_client IS NULL THEN
      IF COALESCE(btrim(p_input->>'contact_email'),'')='' AND COALESCE(btrim(p_input->>'contact_phone'),'')=''
        THEN RAISE EXCEPTION 'Indica un recapito'; END IF;
      c := public.create_client_bundle(jsonb_build_object(
        'display_name',p_input->>'company_name','client_type','growth','client_label','lead',
        'is_internal',false,'active_channels','[]'::jsonb,'mrr',0,'contract_start',CURRENT_DATE,
        'contract_end',NULL,'payment_status','in_attesa','contacts',jsonb_build_array(jsonb_build_object(
          'full_name',COALESCE(NULLIF(btrim(p_input->>'contact_name'),''),p_input->>'company_name'),
          'email',p_input->>'contact_email','phone',p_input->>'contact_phone','is_primary',true))),p_actor);
      v_client := (c->>'id')::uuid;
      SELECT id INTO v_contact FROM client_contacts WHERE client_id=v_client ORDER BY is_primary DESC,id LIMIT 1;
    ELSE
      IF NOT public.sales_client_allowed(p_actor,v_client) THEN RAISE EXCEPTION 'Azienda non accessibile'; END IF;
      SELECT to_jsonb(cl) INTO c FROM clients cl WHERE cl.id=v_client;
    END IF;
    IF v_contact IS NOT NULL AND NOT EXISTS(SELECT 1 FROM client_contacts WHERE id=v_contact AND client_id=v_client)
      THEN RAISE EXCEPTION 'Il referente non appartiene all’azienda'; END IF;
    IF COALESCE(btrim(p_input->>'next_action'),'')='' OR NULLIF(p_input->>'next_action_on','') IS NULL
      THEN RAISE EXCEPTION 'Indica prossima azione e data'; END IF;
    INSERT INTO deals(title,company_name,client_id,contact_id,assigned_to,stage,source,need,blocker,
      next_action,next_action_on,monthly_value,setup_value,one_off_value,proposal_ref,created_by,request_id)
    VALUES (btrim(p_input->>'title'),COALESCE(c->>'display_name',c->>'company_name'),v_client,v_contact,v_owner,'lead',
      NULLIF(p_input->>'source',''),NULLIF(p_input->>'need',''),NULLIF(p_input->>'blocker',''),
      btrim(p_input->>'next_action'),(p_input->>'next_action_on')::date,
      (p_input->>'monthly_value')::numeric,(p_input->>'setup_value')::numeric,(p_input->>'one_off_value')::numeric,
      NULLIF(p_input->>'proposal_ref',''),p_actor,p_request) RETURNING * INTO d;
    v_content := 'Opportunità creata';
  ELSE
    SELECT * INTO d FROM deals WHERE id=p_deal FOR UPDATE;
    IF NOT FOUND OR NOT COALESCE(a IN ('admin','manager') OR d.assigned_to=p_actor,false) THEN RAISE EXCEPTION 'Opportunità non accessibile'; END IF;
    IF d.revision IS DISTINCT FROM (p_input->>'revision')::integer THEN RAISE EXCEPTION 'La scheda è cambiata. Ricarica prima di salvare'; END IF;
    IF p_command='update' THEN
      IF d.stage IN ('chiuso_vinto','chiuso_perso') THEN RAISE EXCEPTION 'La trattativa è chiusa'; END IF;
      v_owner := (p_input->>'assigned_to')::uuid;
      IF public.sales_access(v_owner) IS NULL OR (a='owner' AND v_owner<>p_actor) THEN RAISE EXCEPTION 'Responsabile non abilitato'; END IF;
      v_contact := NULLIF(p_input->>'contact_id','')::uuid;
      IF v_contact IS NOT NULL AND NOT EXISTS(SELECT 1 FROM client_contacts WHERE id=v_contact AND client_id=d.client_id)
        THEN RAISE EXCEPTION 'Referente non valido'; END IF;
      v_stage := p_input->>'stage';
      IF v_stage NOT IN ('lead','contatto','qualificata','perimetro','proposta','trattativa') THEN RAISE EXCEPTION 'Usa un esito per chiudere'; END IF;
      IF COALESCE(btrim(p_input->>'next_action'),'')='' OR NULLIF(p_input->>'next_action_on','') IS NULL THEN RAISE EXCEPTION 'Indica prossima azione e data'; END IF;
      UPDATE deals SET title=btrim(p_input->>'title'),contact_id=v_contact,assigned_to=v_owner,stage=v_stage,
        source=NULLIF(p_input->>'source',''),need=NULLIF(p_input->>'need',''),blocker=NULLIF(p_input->>'blocker',''),
        next_action=btrim(p_input->>'next_action'),next_action_on=(p_input->>'next_action_on')::date,
        monthly_value=(p_input->>'monthly_value')::numeric,setup_value=(p_input->>'setup_value')::numeric,
        one_off_value=(p_input->>'one_off_value')::numeric,proposal_ref=NULLIF(p_input->>'proposal_ref','') WHERE id=d.id;
      v_content := 'Scheda aggiornata · '||d.stage||' → '||v_stage;
    ELSIF p_command='contact' THEN
      IF d.client_id IS NULL THEN RAISE EXCEPTION 'Collega prima un’anagrafica'; END IF;
      IF d.delivery_completed_at IS NOT NULL THEN RAISE EXCEPTION 'Il passaggio alla delivery è già confermato'; END IF;
      IF COALESCE(btrim(p_input->>'full_name'),'')='' OR
        (COALESCE(btrim(p_input->>'email'),'')='' AND COALESCE(btrim(p_input->>'phone'),'')='') THEN RAISE EXCEPTION 'Indica nome e recapito'; END IF;
      PERFORM pg_advisory_xact_lock(hashtextextended(d.client_id::text,1));
      IF EXISTS(SELECT 1 FROM client_contacts WHERE client_id=d.client_id AND (
        (NULLIF(btrim(p_input->>'email'),'') IS NOT NULL AND lower(email)=lower(btrim(p_input->>'email')))
        OR (NULLIF(regexp_replace(p_input->>'phone','[^0-9]','','g'),'') IS NOT NULL
          AND regexp_replace(phone,'[^0-9]','','g')=regexp_replace(p_input->>'phone','[^0-9]','','g'))))
        THEN RAISE EXCEPTION 'Recapito già presente: scegli il referente esistente nella scheda'; END IF;
      INSERT INTO client_contacts(client_id,full_name,email,phone,role,is_primary)
        VALUES(d.client_id,btrim(p_input->>'full_name'),btrim(p_input->>'email'),NULLIF(btrim(p_input->>'phone'),''),NULLIF(btrim(p_input->>'role'),''),false)
        RETURNING id INTO v_contact;
      UPDATE deals SET contact_id=v_contact WHERE id=d.id;
      v_content := 'Referente aggiunto: '||btrim(p_input->>'full_name');
    ELSIF p_command='outcome' THEN
      v_outcome := p_input->>'outcome'; v_date := NULLIF(p_input->>'date','')::date;
      v_content := btrim(p_input->>'content');
      IF v_outcome IS NULL OR v_outcome NOT IN ('nota','non_risponde','ricontattare','incontro','proposta','pausa','riattiva','persa','vinta') THEN RAISE EXCEPTION 'Esito non valido'; END IF;
      IF d.stage IN ('chiuso_vinto','chiuso_perso') AND v_outcome<>'nota' THEN RAISE EXCEPTION 'La trattativa è già chiusa'; END IF;
      IF v_outcome IN ('ricontattare','incontro','pausa','riattiva') AND v_date IS NULL THEN RAISE EXCEPTION 'Indica una data'; END IF;
      IF v_outcome='incontro' AND d.contact_id IS NULL THEN RAISE EXCEPTION 'Scegli prima il referente nella scheda'; END IF;
      IF v_outcome='proposta' AND COALESCE(btrim(p_input->>'proposal_ref'),'')='' THEN RAISE EXCEPTION 'Indica la versione della proposta'; END IF;
      IF v_outcome='vinta' AND COALESCE(d.proposal_ref,'')='' THEN RAISE EXCEPTION 'Registra prima la proposta accettata'; END IF;
      IF COALESCE(v_content,'')='' THEN RAISE EXCEPTION 'Indica cosa è successo'; END IF;
      UPDATE deals SET
        stage=CASE v_outcome WHEN 'vinta' THEN 'chiuso_vinto' WHEN 'persa' THEN 'chiuso_perso'
          WHEN 'proposta' THEN 'proposta' WHEN 'incontro' THEN CASE WHEN stage='lead' THEN 'contatto' ELSE stage END ELSE stage END,
        closed_at=CASE WHEN v_outcome IN ('vinta','persa') THEN now() ELSE closed_at END,
        loss_reason=CASE WHEN v_outcome='persa' THEN v_content ELSE loss_reason END,
        proposal_ref=CASE WHEN v_outcome='proposta' THEN btrim(p_input->>'proposal_ref') ELSE proposal_ref END,
        resume_on=CASE WHEN v_outcome='pausa' THEN v_date WHEN v_outcome IN ('riattiva','vinta','persa') THEN NULL ELSE resume_on END,
        next_action=CASE WHEN v_outcome IN ('vinta','persa') THEN NULL WHEN v_date IS NOT NULL THEN
          COALESCE(NULLIF(btrim(p_input->>'next_action'),''),CASE WHEN v_outcome='incontro' THEN 'Incontro' ELSE 'Ricontattare' END) ELSE next_action END,
        next_action_on=CASE WHEN v_outcome IN ('vinta','persa') THEN NULL ELSE COALESCE(v_date,next_action_on) END,
        last_interaction_at=CASE WHEN v_outcome IN ('pausa','riattiva','nota') THEN last_interaction_at ELSE now() END,
        delivery_owner_id=CASE WHEN v_outcome='vinta' THEN assigned_to ELSE delivery_owner_id END
      WHERE id=d.id;
    ELSIF p_command IN ('delivery_save','delivery_complete') THEN
      IF d.stage<>'chiuso_vinto' THEN RAISE EXCEPTION 'La trattativa deve essere vinta'; END IF;
      IF d.delivery_completed_at IS NOT NULL THEN
        INSERT INTO sales_commands(id,actor_id,deal_id,command,result) VALUES(p_request,p_actor,d.id,p_command,d.delivery_project_id);
        RETURN d.delivery_project_id;
      END IF;
      v_delivery := p_input->'delivery'; v_owner := NULLIF(p_input->>'delivery_owner_id','')::uuid;
      IF v_owner IS NOT NULL AND public.sales_access(v_owner) IS NULL THEN RAISE EXCEPTION 'Responsabile non abilitato'; END IF;
      v_contact := NULLIF(p_input->>'contact_id','')::uuid;
      IF v_contact IS NOT NULL AND NOT EXISTS(SELECT 1 FROM client_contacts WHERE id=v_contact AND client_id=d.client_id)
        THEN RAISE EXCEPTION 'Referente non valido'; END IF;
      d.contact_id := v_contact; d.proposal_ref := NULLIF(btrim(p_input->>'proposal_ref'),'');
      UPDATE deals SET delivery=v_delivery,delivery_owner_id=v_owner,contact_id=v_contact,proposal_ref=d.proposal_ref WHERE id=d.id;
      v_content := 'Riepilogo delivery salvato';
      IF p_command='delivery_complete' THEN
        IF a NOT IN ('admin','manager') THEN RAISE EXCEPTION 'Il passaggio è riservato ad admin e responsabili commerciali'; END IF;
        IF public.sales_access(v_owner) NOT IN ('admin','manager') THEN RAISE EXCEPTION 'Scegli un responsabile abilitato a gestire il progetto'; END IF;
        IF d.client_id IS NULL OR d.contact_id IS NULL OR COALESCE(d.proposal_ref,'')='' OR v_owner IS NULL
          OR COALESCE(btrim(v_delivery->>'goals'),'')='' OR COALESCE(btrim(v_delivery->>'services'),'')=''
          OR COALESCE(btrim(v_delivery->>'included'),'')='' OR COALESCE(btrim(v_delivery->>'excluded'),'')=''
          OR COALESCE(btrim(v_delivery->>'promises'),'')='' OR COALESCE(btrim(v_delivery->>'materials'),'')=''
          OR COALESCE(btrim(v_delivery->>'missing'),'')<>'' THEN RAISE EXCEPTION 'Completa il riepilogo e risolvi le informazioni mancanti'; END IF;
        v_project := NULLIF(p_input->>'project_id','')::uuid;
        IF v_project IS NOT NULL THEN
          IF NOT EXISTS(SELECT 1 FROM projects WHERE id=v_project AND client_id=d.client_id AND deleted_at IS NULL)
            THEN RAISE EXCEPTION 'Il progetto non appartiene all’azienda'; END IF;
        ELSE
          SELECT * INTO s FROM service_catalog WHERE id=(p_input->>'service_id')::uuid AND is_active;
          IF NOT FOUND THEN RAISE EXCEPTION 'Scegli il servizio dal catalogo'; END IF;
          v_project := public.create_project_from_template(jsonb_build_object('project',jsonb_build_object(
            'client_id',d.client_id,'name',d.title,'description',v_delivery->>'goals','area',s.area,
            'service_type',s.service_type,'service_subtype',s.service_subtype,'status','draft',
            'manager_id',v_owner,'visibility','internal'), 'workstreams',jsonb_build_array(jsonb_build_object(
              'name',s.label,'description',v_delivery->>'included','owner_id',v_owner,'visibility','internal'))),p_actor);
        END IF;
        UPDATE deals SET delivery_project_id=v_project,delivery_completed_at=now() WHERE id=d.id;
        INSERT INTO sales_handoffs(deal_id,project_id,summary,proposal_ref,contact_id,created_by)
          VALUES(d.id,v_project,v_delivery,d.proposal_ref,d.contact_id,p_actor);
        UPDATE clients SET client_label='stabile' WHERE id=d.client_id AND client_label='lead';
        v_content := 'Passaggio alla delivery confermato';
      END IF;
    ELSE RAISE EXCEPTION 'Operazione non valida'; END IF;
    UPDATE deals SET revision=revision+1,updated_at=now() WHERE id=d.id;
  END IF;
  INSERT INTO deal_activities(deal_id,type,content,created_by,outcome,next_action_on)
    VALUES(d.id,CASE WHEN v_outcome='incontro' THEN 'meeting' WHEN v_date IS NOT NULL THEN 'followup' ELSE 'nota' END,
      v_content,p_actor,COALESCE(v_outcome,p_command),v_date);
  INSERT INTO sales_commands(id,actor_id,deal_id,command,result)
    VALUES(p_request,p_actor,d.id,p_command,COALESCE(v_project,d.id));
  RETURN COALESCE(v_project,d.id);
END $$;
REVOKE ALL ON FUNCTION public.sales_command(uuid,uuid,text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sales_command(uuid,uuid,text,uuid,jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
