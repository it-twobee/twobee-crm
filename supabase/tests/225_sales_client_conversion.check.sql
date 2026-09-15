-- Solo staging, dopo 223/224/225. Tutte le fixture vengono annullate.
BEGIN;
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('f2250000-0000-4000-8000-000000000001','sales225@example.invalid','{"full_name":"Test conversione"}');
INSERT INTO profiles(id,email,full_name,role,app_role,is_active) VALUES
 ('f2250000-0000-4000-8000-000000000001','sales225@example.invalid','Test conversione','team','manager',true)
 ON CONFLICT(id) DO UPDATE SET role='team',app_role='manager',is_active=true;
INSERT INTO profile_permissions(profile_id,permission,granted)
 VALUES('f2250000-0000-4000-8000-000000000001','can_view_deals',true);
SET LOCAL ROLE service_role;
DO $$ DECLARE
  actor uuid := 'f2250000-0000-4000-8000-000000000001';
  deal uuid; client uuid; linked uuid; retry uuid; request uuid; legacy uuid; label text;
  before_count bigint; before_activities bigint; win jsonb; initial jsonb;
BEGIN
  initial := jsonb_build_object('title','Conversione test','company_name','Conversione test',
    'assigned_to',actor,'contact_name','Referente','contact_phone','021225',
    'next_action','Contattare','next_action_on','2026-09-16','source','Meta Ads');
  win := '{"revision":0,"outcome":"vinta","content":"Accettata","proposal_ref":"Proposta v1"}';
  deal := public.sales_command(actor,gen_random_uuid(),'create',NULL,initial);
  SELECT client_id INTO client FROM deals WHERE id=deal;
  IF (SELECT client_label FROM clients WHERE id=client)<>'lead' THEN RAISE EXCEPTION 'Creazione non lead'; END IF;
  SELECT count(*) INTO before_count FROM clients;
  request := gen_random_uuid();
  PERFORM public.sales_command(actor,request,'outcome',deal,win);
  SELECT count(*) INTO before_activities FROM deal_activities WHERE deal_id=deal;
  retry := public.sales_command(actor,request,'outcome',deal,win);
  IF retry<>deal OR (SELECT count(*) FROM clients)<>before_count OR
    (SELECT count(*) FROM deal_activities WHERE deal_id=deal)<>before_activities THEN RAISE EXCEPTION 'Retry duplica dati'; END IF;
  IF NOT EXISTS(SELECT 1 FROM deals WHERE id=deal AND client_id=client AND stage='chiuso_vinto'
    AND proposal_ref='Proposta v1' AND delivery_completed_at IS NULL) THEN RAISE EXCEPTION 'Vittoria o collegamento persi'; END IF;
  IF (SELECT client_label FROM clients WHERE id=client)<>'stabile' THEN RAISE EXCEPTION 'Vittoria non converte lead'; END IF;
  IF NOT EXISTS(SELECT 1 FROM activity_log WHERE entity_type='clients' AND entity_id=client AND action='update' AND user_id=actor)
    THEN RAISE EXCEPTION 'Conversione senza attore'; END IF;
  IF (SELECT mrr FROM clients WHERE id=client)<>0 OR EXISTS(SELECT 1 FROM revenue_streams WHERE client_id=client)
    OR EXISTS(SELECT 1 FROM projects WHERE client_id=client) OR EXISTS(SELECT 1 FROM invoices WHERE client_id=client)
    THEN RAISE EXCEPTION 'La vittoria crea economics o progetti'; END IF;

  -- Le altre label sono decisioni separate: non vengono sovrascritte.
  FOREACH label IN ARRAY ARRAY['stabile','in_bilico','pending','perso','partner'] LOOP
    UPDATE clients SET client_label=label WHERE id=client;
    linked := public.sales_command(actor,gen_random_uuid(),'create',NULL,initial || jsonb_build_object('client_id',client));
    PERFORM public.sales_command(actor,gen_random_uuid(),'outcome',linked,win);
    IF (SELECT client_label FROM clients WHERE id=client)<>label THEN RAISE EXCEPTION 'Label esistente sovrascritta: %',label; END IF;
  END LOOP;
  linked := public.sales_command(actor,gen_random_uuid(),'create',NULL,initial || '{"company_name":"Lead perso test"}');
  PERFORM public.sales_command(actor,gen_random_uuid(),'outcome',linked,'{"revision":0,"outcome":"persa","content":"Non interessato"}');
  IF (SELECT c.client_label FROM clients c JOIN deals d ON d.client_id=c.id WHERE d.id=linked)<>'lead'
    THEN RAISE EXCEPTION 'Perdita converte il lead'; END IF;

  INSERT INTO deals(title,company_name,assigned_to,created_by,contact_name,contact_phone)
    VALUES('Legacy','Legacy conversione test',actor,actor,'Referente legacy','021226') RETURNING id INTO legacy;
  SELECT count(*) INTO before_count FROM clients;
  -- Anche se la creazione parte, un errore successivo deve annullare tutto.
  BEGIN
    PERFORM public.sales_command(actor,gen_random_uuid(),'outcome',legacy,win || '{"content":""}');
    RAISE EXCEPTION 'Accettata vittoria senza evidenza' USING ERRCODE='XX000';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%cosa è successo%' THEN RAISE; END IF;
  END;
  IF (SELECT count(*) FROM clients)<>before_count OR (SELECT client_id FROM deals WHERE id=legacy) IS NOT NULL
    THEN RAISE EXCEPTION 'Rollback incompleto'; END IF;
  request := gen_random_uuid();
  PERFORM public.sales_command(actor,request,'outcome',legacy,win);
  PERFORM public.sales_command(actor,request,'outcome',legacy,win);
  SELECT client_id INTO client FROM deals WHERE id=legacy;
  IF (SELECT count(*) FROM clients)<>before_count+1 OR (SELECT client_label FROM clients WHERE id=client)<>'stabile'
    THEN RAISE EXCEPTION 'Legacy non acquisito o duplicato'; END IF;
  IF (SELECT count(*) FROM client_contacts WHERE client_id=client AND phone='021226')<>1
    OR (SELECT count(*) FROM chat_channels WHERE client_id=client)<>2 THEN RAISE EXCEPTION 'Bundle incompleto'; END IF;

  INSERT INTO deals(title,company_name,assigned_to,created_by)
    VALUES('Omonimo',' Legacy conversione test ',actor,actor) RETURNING id INTO legacy;
  BEGIN
    PERFORM public.sales_command(actor,gen_random_uuid(),'outcome',legacy,win);
    RAISE EXCEPTION 'Duplicato consentito' USING ERRCODE='XX000';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%Nome già presente%' THEN RAISE; END IF;
  END;
  PERFORM public.sales_command(actor,gen_random_uuid(),'outcome',legacy,win || jsonb_build_object('client_id',client));
  IF (SELECT client_id FROM deals WHERE id=legacy)<>client THEN RAISE EXCEPTION 'Collegamento esplicito ignorato'; END IF;
  IF (SELECT count(*) FROM clients)<>before_count+1 THEN RAISE EXCEPTION 'Collegamento crea duplicato'; END IF;
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','f2250000-0000-4000-8000-000000000001',true);
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM clients_workspace WHERE company_name='Legacy conversione test' AND client_label='stabile')
    THEN RAISE EXCEPTION 'Cliente acquisito invisibile al manager'; END IF;
  BEGIN
    PERFORM public.sales_command('f2250000-0000-4000-8000-000000000001',gen_random_uuid(),'create',NULL,'{}');
    RAISE EXCEPTION 'RPC esposto al browser' USING ERRCODE='XX000';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
