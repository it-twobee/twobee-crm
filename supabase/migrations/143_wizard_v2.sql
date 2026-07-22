-- 143 — create_project_from_wizard sulla gerarchia V2.
--
-- PERCHÉ SERVE
-- Il RENAME della 138/140 non riscrive il corpo delle funzioni plpgsql: la
-- funzione della 134 continuava a citare `project_phases` e `growth_routines`
-- e falliva con «relation "public.growth_routines" does not exist» alla prima
-- creazione di progetto. Postgres non risolve i nomi dentro le funzioni finché
-- non le esegue, quindi il rename è passato silenzioso e si è rotto in UI.
--
-- COSA CAMBIA
--  · project_phases      → project_workstreams
--  · growth_routines     → recurring_task_templates (+ client_id)
--  · niente sprint iniziale: le task di startup si agganciano alla PRIMA
--    area di lavoro creata, non a uno sprint
--  · tasks: workstream_id + task_type, via is_milestone
--
-- Il payload NON cambia (`phases`, `routines`, `startup_tasks`): ProjectWizard.tsx
-- resta compatibile. La chiave `phases` verrà rinominata quando si riscrive il
-- wizard a 10 step.

CREATE OR REPLACE FUNCTION public.create_project_from_wizard(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role TEXT;
  v_uid UUID := auth.uid();
  v_client UUID;
  v_service TEXT;
  v_cat RECORD;
  v_project UUID;
  v_ws UUID;
  v_first_ws UUID;
  v_item JSONB;
  v_i INT := 0;
  n_ws INT := 0; n_routines INT := 0; n_tasks INT := 0;
  v_stream UUID;
BEGIN
  v_role := public.get_my_role();
  IF v_role IS DISTINCT FROM 'admin' AND v_role IS DISTINCT FROM 'team' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  v_client  := (payload->>'client_id')::UUID;
  v_service := payload->>'service_key';

  IF v_client IS NULL THEN RAISE EXCEPTION 'client_id obbligatorio'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clients WHERE id = v_client) THEN
    RAISE EXCEPTION 'cliente inesistente';
  END IF;

  SELECT * INTO v_cat FROM public.service_catalog WHERE key = v_service AND is_active;
  IF v_cat IS NULL THEN RAISE EXCEPTION 'servizio "%" non nel catalogo', v_service; END IF;

  -- ─── Progetto ─────────────────────────────────────────────────────────────
  INSERT INTO public.projects (
    client_id, name, description, status, lifecycle_status,
    service_key, service_line, delivery_model, growth_vertical,
    project_type, project_kind, sprint_current, manager_id,
    startup_target_days, desired_end_date, is_internal_project
  ) VALUES (
    v_client,
    COALESCE(NULLIF(payload->>'name',''), v_cat.name),
    NULLIF(payload->>'description',''),
    'attivo',
    CASE WHEN v_cat.delivery_engine = 'growth_program' THEN 'startup' ELSE 'active' END,
    v_service, v_cat.service_line, v_cat.delivery_engine,
    COALESCE(NULLIF(payload->>'growth_vertical','')::TEXT, v_cat.growth_vertical),
    COALESCE(NULLIF(payload->>'project_type',''), 'custom'),
    NULL, 1,
    NULLIF(payload->>'manager_id','')::UUID,
    COALESCE((payload->>'startup_target_days')::INT, 21),
    NULLIF(payload->>'desired_end_date','')::DATE,
    COALESCE((payload->>'is_internal_project')::BOOLEAN, false)
  ) RETURNING id INTO v_project;

  -- ─── Aree di lavoro ───────────────────────────────────────────────────────
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'phases','[]'::jsonb))
  LOOP
    INSERT INTO public.project_workstreams (project_id, key, name, position, status)
    VALUES (v_project, v_item->>'key', v_item->>'name', v_i, 'da_avviare')
    RETURNING id INTO v_ws;
    IF v_first_ws IS NULL THEN v_first_ws := v_ws; END IF;
    v_i := v_i + 1; n_ws := n_ws + 1;
  END LOOP;

  -- Ogni progetto deve avere almeno un'area di lavoro: le task devono poterci
  -- stare dentro. Se il catalogo non ne propone, ne creiamo una generica.
  IF v_first_ws IS NULL THEN
    INSERT INTO public.project_workstreams (project_id, key, name, position, status)
    VALUES (v_project, 'generale', 'Generale', 0, 'in_corso')
    RETURNING id INTO v_first_ws;
    n_ws := 1;
  END IF;

  -- ─── Ricorrenze ───────────────────────────────────────────────────────────
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'routines','[]'::jsonb))
  LOOP
    INSERT INTO public.recurring_task_templates
      (project_id, client_id, workstream_id, title, description, frequency,
       default_estimated_hours, template_key, position, starts_on, is_active)
    VALUES (
      v_project, v_client, v_first_ws,
      v_item->>'title', v_item->>'description',
      COALESCE(v_item->>'frequency','mensile'),
      COALESCE((v_item->>'hours')::NUMERIC, 1),
      v_item->>'key', n_routines,
      COALESCE(NULLIF(payload->>'start_date','')::DATE, CURRENT_DATE),
      true
    );
    n_routines := n_routines + 1;
  END LOOP;

  -- ─── Task di startup ──────────────────────────────────────────────────────
  v_i := 0;
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'startup_tasks','[]'::jsonb))
  LOOP
    INSERT INTO public.tasks
      (project_id, client_id, scope_type, work_type, title, description,
       status, priority, estimated_hours, position, workstream_id, task_type)
    VALUES (
      v_project, v_client, 'project', 'startup',
      v_item->>'title', v_item->>'description',
      'da_fare', COALESCE(v_item->>'priority','media'),
      COALESCE((v_item->>'hours')::NUMERIC, 1),
      v_i, v_first_ws, 'action'
    );
    v_i := v_i + 1; n_tasks := n_tasks + 1;
  END LOOP;

  -- ─── Accordo economico: SOLO admin ────────────────────────────────────────
  IF payload ? 'agreement' AND payload->'agreement' <> 'null'::jsonb THEN
    IF v_role <> 'admin' THEN
      RAISE EXCEPTION 'solo un admin può definire l''accordo economico';
    END IF;
    INSERT INTO public.revenue_streams
      (client_id, project_id, label, service_line, revenue_model, amount,
       billing_frequency, start_date, end_date, status, source)
    VALUES (
      v_client, v_project,
      COALESCE(payload->'agreement'->>'label', v_cat.name),
      v_cat.service_line,
      COALESCE(payload->'agreement'->>'revenue_model', v_cat.default_revenue_model),
      COALESCE((payload->'agreement'->>'amount')::NUMERIC, 0),
      COALESCE(payload->'agreement'->>'billing_frequency', v_cat.default_billing_frequency, 'una_tantum'),
      COALESCE(NULLIF(payload->>'start_date','')::DATE, CURRENT_DATE),
      NULLIF(payload->'agreement'->>'end_date','')::DATE,
      'attivo', 'wizard'
    ) RETURNING id INTO v_stream;
  END IF;

  -- `sprint_id` resta nella risposta a NULL: il wizard lo ignora, ma toglierlo
  -- romperebbe eventuali chiamanti che lo leggono.
  RETURN jsonb_build_object(
    'project_id', v_project,
    'sprint_id', NULL,
    'stream_id', v_stream,
    'workstream_id', v_first_ws,
    'phases', n_ws,
    'routines', n_routines,
    'startup_tasks', n_tasks,
    'economic_status', (SELECT economic_status FROM public.projects WHERE id = v_project)
  );
END $$;

-- ─── Verifica: nessun oggetto cita più le tabelle rinominate ────────────────
SELECT p.proname
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND (p.prosrc LIKE '%growth_routines%' OR p.prosrc LIKE '%project_phases%');
