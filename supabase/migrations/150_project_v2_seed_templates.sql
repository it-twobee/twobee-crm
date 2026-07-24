-- 150 - Project V2: seed template MVP (Lead Generation + E-commerce)
--
-- Solo dati. Struttura: workstream (recurring) -> recurring_task diretti.
-- Le milestone di sistema ("Operativita continua"/"Governance") vengono create
-- dal trigger alla generazione del workstream: qui i task ricorrenti pendono
-- direttamente dal nodo workstream e il wizard li aggancia alla milestone giusta.
-- Idempotente: salta se il template con lo stesso nome esiste gia.

-- ============================================================================
-- Lead Generation
-- ============================================================================
DO $$
DECLARE tid UUID; wsid UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM public.project_templates
             WHERE service_type = 'lead_generation' AND name = 'Growth Lead Generation - Standard') THEN
    RAISE NOTICE 'Template Lead Generation gia presente, skip';
    RETURN;
  END IF;

  INSERT INTO public.project_templates (service_type, name, description)
  VALUES ('lead_generation', 'Growth Lead Generation - Standard',
          'Advertising, tracking, automation, lead management e governance continuativi')
  RETURNING id INTO tid;

  -- Workstream: Advertising
  INSERT INTO public.project_template_nodes (template_id, node_type, name, workstream_type, sort_order)
  VALUES (tid, 'workstream', 'Advertising', 'recurring', 10) RETURNING id INTO wsid;
  INSERT INTO public.project_template_nodes
    (template_id, parent_id, node_type, name, frequency, suggested_owner_role, priority, visibility, estimated_hours, sort_order) VALUES
    (tid, wsid, 'recurring_task', 'Check Ads',               'weekly',   'Media Buyer', 'alta',  'internal', 1,   10),
    (tid, wsid, 'recurring_task', 'Check Budget',            'weekly',   'Media Buyer', 'alta',  'internal', 0.5, 20),
    (tid, wsid, 'recurring_task', 'Check Creativita',        'biweekly', 'Creative',    'media', 'internal', 1,   30),
    (tid, wsid, 'recurring_task', 'Ottimizzazione campagne', 'weekly',   'Media Buyer', 'alta',  'internal', 2,   40);

  -- Workstream: Tracking e dati
  INSERT INTO public.project_template_nodes (template_id, node_type, name, workstream_type, sort_order)
  VALUES (tid, 'workstream', 'Tracking e dati', 'recurring', 20) RETURNING id INTO wsid;
  INSERT INTO public.project_template_nodes
    (template_id, parent_id, node_type, name, frequency, suggested_owner_role, priority, visibility, sort_order) VALUES
    (tid, wsid, 'recurring_task', 'Check Tracking',          'weekly',  'Data Analyst', 'alta',  'internal', 10),
    (tid, wsid, 'recurring_task', 'Verifica conversioni',    'weekly',  'Data Analyst', 'media', 'internal', 20),
    (tid, wsid, 'recurring_task', 'Controllo qualita dati',  'monthly', 'Data Analyst', 'media', 'internal', 30);

  -- Workstream: Marketing Automation
  INSERT INTO public.project_template_nodes (template_id, node_type, name, workstream_type, sort_order)
  VALUES (tid, 'workstream', 'Marketing Automation', 'recurring', 30) RETURNING id INTO wsid;
  INSERT INTO public.project_template_nodes
    (template_id, parent_id, node_type, name, frequency, suggested_owner_role, priority, visibility, sort_order) VALUES
    (tid, wsid, 'recurring_task', 'Check Automation', 'weekly',   'Automation Specialist', 'media', 'internal', 10),
    (tid, wsid, 'recurring_task', 'Check flussi',     'biweekly', 'Automation Specialist', 'media', 'internal', 20),
    (tid, wsid, 'recurring_task', 'Verifica errori',  'weekly',   'Automation Specialist', 'alta',  'internal', 30);

  -- Workstream: Lead Management
  INSERT INTO public.project_template_nodes (template_id, node_type, name, workstream_type, sort_order)
  VALUES (tid, 'workstream', 'Lead Management', 'recurring', 40) RETURNING id INTO wsid;
  INSERT INTO public.project_template_nodes
    (template_id, parent_id, node_type, name, frequency, suggested_owner_role, priority, visibility, sort_order) VALUES
    (tid, wsid, 'recurring_task', 'Check Lead',            'weekly',  'Growth Specialist', 'alta',  'internal', 10),
    (tid, wsid, 'recurring_task', 'Analisi qualita lead',  'monthly', 'Growth Specialist', 'media', 'internal', 20),
    (tid, wsid, 'recurring_task', 'Supporto vendita',      'weekly',  'Growth Specialist', 'media', 'internal', 30);

  -- Workstream: Governance
  INSERT INTO public.project_template_nodes (template_id, node_type, name, workstream_type, sort_order)
  VALUES (tid, 'workstream', 'Governance', 'recurring', 50) RETURNING id INTO wsid;
  INSERT INTO public.project_template_nodes
    (template_id, parent_id, node_type, name, frequency, suggested_owner_role, priority, visibility, estimated_hours, sort_order) VALUES
    (tid, wsid, 'recurring_task', 'Reportistica',      'monthly', 'Growth Specialist', 'alta', 'client_visible', 2, 10),
    (tid, wsid, 'recurring_task', 'Meeting periodico', 'monthly', 'Project Manager',   'alta', 'client_visible', 1, 20);
END $$;

-- ============================================================================
-- E-commerce
-- ============================================================================
DO $$
DECLARE tid UUID; wsid UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM public.project_templates
             WHERE service_type = 'ecommerce' AND name = 'Growth E-commerce - Standard') THEN
    RAISE NOTICE 'Template E-commerce gia presente, skip';
    RETURN;
  END IF;

  INSERT INTO public.project_templates (service_type, name, description)
  VALUES ('ecommerce', 'Growth E-commerce - Standard',
          'Advertising, UI/UX e CRO, automation/retention, IT e governance continuativi')
  RETURNING id INTO tid;

  -- Workstream: Advertising
  INSERT INTO public.project_template_nodes (template_id, node_type, name, workstream_type, sort_order)
  VALUES (tid, 'workstream', 'Advertising', 'recurring', 10) RETURNING id INTO wsid;
  INSERT INTO public.project_template_nodes
    (template_id, parent_id, node_type, name, frequency, suggested_owner_role, priority, visibility, estimated_hours, sort_order) VALUES
    (tid, wsid, 'recurring_task', 'Check Ads',               'weekly',   'Media Buyer', 'alta',  'internal', 1,   10),
    (tid, wsid, 'recurring_task', 'Check Budget',            'weekly',   'Media Buyer', 'alta',  'internal', 0.5, 20),
    (tid, wsid, 'recurring_task', 'Check Creativita',        'biweekly', 'Creative',    'media', 'internal', 1,   30),
    (tid, wsid, 'recurring_task', 'Ottimizzazione campagne', 'weekly',   'Media Buyer', 'alta',  'internal', 2,   40);

  -- Workstream: UI/UX e CRO
  INSERT INTO public.project_template_nodes (template_id, node_type, name, workstream_type, sort_order)
  VALUES (tid, 'workstream', 'UI/UX e CRO', 'recurring', 20) RETURNING id INTO wsid;
  INSERT INTO public.project_template_nodes
    (template_id, parent_id, node_type, name, frequency, suggested_owner_role, priority, visibility, sort_order) VALUES
    (tid, wsid, 'recurring_task', 'Check UI/UX',        'biweekly', 'UX Designer',      'media', 'internal', 10),
    (tid, wsid, 'recurring_task', 'Check CRO',          'weekly',   'CRO Specialist',   'alta',  'internal', 20),
    (tid, wsid, 'recurring_task', 'Analisi funnel',     'monthly',  'CRO Specialist',   'media', 'internal', 30),
    (tid, wsid, 'recurring_task', 'Analisi checkout',   'monthly',  'CRO Specialist',   'alta',  'internal', 40);

  -- Workstream: Automation e Retention
  INSERT INTO public.project_template_nodes (template_id, node_type, name, workstream_type, sort_order)
  VALUES (tid, 'workstream', 'Automation e Retention', 'recurring', 30) RETURNING id INTO wsid;
  INSERT INTO public.project_template_nodes
    (template_id, parent_id, node_type, name, frequency, suggested_owner_role, priority, visibility, sort_order) VALUES
    (tid, wsid, 'recurring_task', 'Check Automation',      'weekly',   'Automation Specialist', 'media', 'internal', 10),
    (tid, wsid, 'recurring_task', 'Check flussi',          'biweekly', 'Automation Specialist', 'media', 'internal', 20),
    (tid, wsid, 'recurring_task', 'Verifica deliverability','monthly', 'Automation Specialist', 'media', 'internal', 30),
    (tid, wsid, 'recurring_task', 'Analisi retention',     'monthly',  'Growth Specialist',     'alta',  'internal', 40);

  -- Workstream: IT e qualita tecnica
  INSERT INTO public.project_template_nodes (template_id, node_type, name, workstream_type, sort_order)
  VALUES (tid, 'workstream', 'IT e qualita tecnica', 'recurring', 40) RETURNING id INTO wsid;
  INSERT INTO public.project_template_nodes
    (template_id, parent_id, node_type, name, frequency, suggested_owner_role, priority, visibility, sort_order) VALUES
    (tid, wsid, 'recurring_task', 'Check IT/bug',           'weekly',  'Developer', 'alta',  'internal', 10),
    (tid, wsid, 'recurring_task', 'Verifica errori',        'weekly',  'Developer', 'alta',  'internal', 20),
    (tid, wsid, 'recurring_task', 'Controllo integrazioni', 'monthly', 'Developer', 'media', 'internal', 30),
    (tid, wsid, 'recurring_task', 'Controllo tracking',     'monthly', 'Developer', 'media', 'internal', 40);

  -- Workstream: Governance
  INSERT INTO public.project_template_nodes (template_id, node_type, name, workstream_type, sort_order)
  VALUES (tid, 'workstream', 'Governance', 'recurring', 50) RETURNING id INTO wsid;
  INSERT INTO public.project_template_nodes
    (template_id, parent_id, node_type, name, frequency, suggested_owner_role, priority, visibility, estimated_hours, sort_order) VALUES
    (tid, wsid, 'recurring_task', 'Reportistica',      'monthly', 'Growth Specialist', 'alta', 'client_visible', 2, 10),
    (tid, wsid, 'recurring_task', 'Meeting periodico', 'monthly', 'Project Manager',   'alta', 'client_visible', 1, 20);
END $$;

-- verifica: 2 template + i loro nodi
SELECT t.name, count(n.id) AS nodi
FROM public.project_templates t
LEFT JOIN public.project_template_nodes n ON n.template_id = t.id
GROUP BY t.name ORDER BY t.name;
