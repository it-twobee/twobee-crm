-- La vittoria converte il lead: la delivery non governa lo stato del cliente.
BEGIN;
SET LOCAL lock_timeout = '5s';

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
      IF v_outcome='vinta' THEN
        d.proposal_ref := COALESCE(NULLIF(btrim(p_input->>'proposal_ref'),''),NULLIF(btrim(d.proposal_ref),''));
        IF d.proposal_ref IS NULL THEN RAISE EXCEPTION 'Indica la proposta accettata'; END IF;
        -- Le vecchie opportunità possono non avere un'anagrafica collegata.
        -- Non unire aziende per nome: una corrispondenza richiede scelta esplicita.
        IF d.client_id IS NULL THEN
          v_client := NULLIF(p_input->>'client_id','')::uuid;
          IF v_client IS NOT NULL THEN
            IF NOT public.sales_client_allowed(p_actor,v_client) THEN RAISE EXCEPTION 'Azienda non accessibile'; END IF;
            d.client_id := v_client;
            SELECT id INTO d.contact_id FROM client_contacts WHERE client_id=v_client ORDER BY is_primary DESC,id LIMIT 1;
          ELSE
            PERFORM pg_advisory_xact_lock(hashtextextended(lower(btrim(d.company_name)),225));
            IF EXISTS(SELECT 1 FROM clients cl WHERE lower(btrim(cl.company_name))=lower(btrim(d.company_name))
              OR lower(btrim(cl.display_name))=lower(btrim(d.company_name))) THEN
              RAISE EXCEPTION 'Nome già presente in anagrafica: seleziona il cliente esistente o chiedi al responsabile di verificare';
            END IF;
            c := public.create_client_bundle(jsonb_build_object(
              'display_name',d.company_name,'client_type','growth','client_label','lead',
              'is_internal',false,'active_channels','[]'::jsonb,'mrr',0,'contract_start',CURRENT_DATE,
              'contract_end',NULL,'payment_status','in_attesa','contacts',
              CASE WHEN COALESCE(NULLIF(btrim(d.contact_email),''),NULLIF(btrim(d.contact_phone),'')) IS NOT NULL
                THEN jsonb_build_array(jsonb_build_object('full_name',COALESCE(NULLIF(btrim(d.contact_name),''),d.company_name),
                  'email',d.contact_email,'phone',d.contact_phone,'is_primary',true))
                ELSE '[]'::jsonb END),p_actor);
            d.client_id := (c->>'id')::uuid;
            SELECT id INTO d.contact_id FROM client_contacts WHERE client_id=d.client_id ORDER BY is_primary DESC,id LIMIT 1;
          END IF;
        END IF;
        -- Si promuove la stessa riga, nella transazione della vittoria.
        -- Le label di clienti già acquisiti e tutti i dati economici restano intatti.
        UPDATE clients SET client_label='stabile' WHERE id=d.client_id AND client_label='lead';
      END IF;
      IF COALESCE(v_content,'')='' THEN RAISE EXCEPTION 'Indica cosa è successo'; END IF;
      UPDATE deals SET
        client_id=d.client_id,contact_id=d.contact_id,
        stage=CASE v_outcome WHEN 'vinta' THEN 'chiuso_vinto' WHEN 'persa' THEN 'chiuso_perso'
          WHEN 'proposta' THEN 'proposta' WHEN 'incontro' THEN CASE WHEN stage='lead' THEN 'contatto' ELSE stage END ELSE stage END,
        closed_at=CASE WHEN v_outcome IN ('vinta','persa') THEN now() ELSE closed_at END,
        loss_reason=CASE WHEN v_outcome='persa' THEN v_content ELSE loss_reason END,
        proposal_ref=CASE WHEN v_outcome='vinta' THEN d.proposal_ref WHEN v_outcome='proposta' THEN btrim(p_input->>'proposal_ref') ELSE proposal_ref END,
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
