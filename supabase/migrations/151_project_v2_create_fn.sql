-- 151 - Project V2: creazione atomica progetto da payload wizard
--
-- Il wizard invia l'albero gia risolto (workstreams -> milestones -> tasks +
-- recurring). La funzione lo inserisce in transazione: o tutto o niente.
-- I task ricorrenti ereditano la milestone di sistema "Operativita continua"
-- creata dal trigger alla insert del workstream.
--
-- Payload atteso (jsonb):
-- {
--   "project": { client_id, name, description, area, service_type, service_subtype,
--                operating_model, revenue_model, status, manager_id, priority,
--                visibility, start_date, target_end_date },
--   "members": ["<profile_id>", ...],
--   "workstreams": [
--     { name, description, workstream_type, status, owner_id, priority, visibility, sort_order,
--       "milestones": [ { title, description, milestone_type, status, owner_id, due_date,
--                         approval_required, deliverable, visibility, sort_order,
--                         "tasks": [ { title, description, status, priority, assignee_id,
--                                      due_date, estimated_hours, visibility, sort_order } ] } ],
--       "recurring":  [ { title, description, frequency, interval, weekdays, day_of_month,
--                         start_date, end_date, generation_lead_days, owner_id, priority,
--                         estimated_hours, visibility } ] } ]
-- }

CREATE OR REPLACE FUNCTION public.create_project_from_template(p_payload jsonb, p_created_by uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  proj        jsonb := p_payload->'project';
  v_client_id uuid;
  v_project_id uuid;
  v_member    jsonb;
  v_ws        jsonb; v_ws_id uuid; v_sys_ms_id uuid;
  v_ms        jsonb; v_ms_id uuid;
  v_task      jsonb;
  v_rec       jsonb;
BEGIN
  v_client_id := (proj->>'client_id')::uuid;
  IF v_client_id IS NULL THEN RAISE EXCEPTION 'client_id mancante'; END IF;
  IF COALESCE(proj->>'name','') = '' THEN RAISE EXCEPTION 'name mancante'; END IF;

  INSERT INTO public.projects (
    client_id, name, description, area, service_type, service_subtype,
    operating_model, revenue_model, status, manager_id, priority, visibility,
    start_date, target_end_date, created_by
  ) VALUES (
    v_client_id, proj->>'name', NULLIF(proj->>'description',''), proj->>'area',
    proj->>'service_type', NULLIF(proj->>'service_subtype',''),
    NULLIF(proj->>'operating_model',''), NULLIF(proj->>'revenue_model',''),
    COALESCE(NULLIF(proj->>'status',''),'draft'),
    NULLIF(proj->>'manager_id','')::uuid,
    COALESCE(NULLIF(proj->>'priority',''),'media'),
    COALESCE(NULLIF(proj->>'visibility',''),'internal'),
    NULLIF(proj->>'start_date','')::date, NULLIF(proj->>'target_end_date','')::date,
    p_created_by
  ) RETURNING id INTO v_project_id;

  -- membri di progetto
  FOR v_member IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'members','[]'::jsonb)) LOOP
    INSERT INTO public.project_members (project_id, profile_id)
    VALUES (v_project_id, (v_member#>>'{}')::uuid)
    ON CONFLICT (project_id, profile_id) DO NOTHING;
  END LOOP;
  IF NULLIF(proj->>'manager_id','') IS NOT NULL THEN
    INSERT INTO public.project_members (project_id, profile_id, role_in_project)
    VALUES (v_project_id, (proj->>'manager_id')::uuid, 'manager')
    ON CONFLICT (project_id, profile_id) DO NOTHING;
  END IF;

  -- sottoprogetti
  FOR v_ws IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'workstreams','[]'::jsonb)) LOOP
    INSERT INTO public.project_workstreams (
      project_id, name, description, workstream_type, status, owner_id, priority, visibility, sort_order
    ) VALUES (
      v_project_id, v_ws->>'name', NULLIF(v_ws->>'description',''),
      COALESCE(NULLIF(v_ws->>'workstream_type',''),'project'),
      COALESCE(NULLIF(v_ws->>'status',''),'active'),
      NULLIF(v_ws->>'owner_id','')::uuid,
      COALESCE(NULLIF(v_ws->>'priority',''),'media'),
      COALESCE(NULLIF(v_ws->>'visibility',''),'internal'),
      COALESCE((v_ws->>'sort_order')::int,0)
    ) RETURNING id INTO v_ws_id;

    -- milestone di sistema creata dal trigger: recuperala per i ricorrenti
    SELECT id INTO v_sys_ms_id FROM public.milestones
    WHERE workstream_id = v_ws_id AND milestone_type = 'system'
    ORDER BY created_at LIMIT 1;

    -- milestone esplicite + loro task
    FOR v_ms IN SELECT * FROM jsonb_array_elements(COALESCE(v_ws->'milestones','[]'::jsonb)) LOOP
      INSERT INTO public.milestones (
        project_id, workstream_id, title, description, milestone_type, status,
        owner_id, due_date, approval_required, deliverable, visibility, sort_order
      ) VALUES (
        v_project_id, v_ws_id, v_ms->>'title', NULLIF(v_ms->>'description',''),
        COALESCE(NULLIF(v_ms->>'milestone_type',''),'delivery'),
        COALESCE(NULLIF(v_ms->>'status',''),'da_fare'),
        NULLIF(v_ms->>'owner_id','')::uuid, NULLIF(v_ms->>'due_date','')::date,
        COALESCE((v_ms->>'approval_required')::boolean,false),
        NULLIF(v_ms->>'deliverable',''),
        COALESCE(NULLIF(v_ms->>'visibility',''),'internal'),
        COALESCE((v_ms->>'sort_order')::int,0)
      ) RETURNING id INTO v_ms_id;

      FOR v_task IN SELECT * FROM jsonb_array_elements(COALESCE(v_ms->'tasks','[]'::jsonb)) LOOP
        INSERT INTO public.tasks (
          client_id, task_type, project_id, workstream_id, milestone_id,
          title, description, status, priority, assignee_id, due_date,
          estimated_hours, visibility, created_by
        ) VALUES (
          v_client_id, 'project', v_project_id, v_ws_id, v_ms_id,
          v_task->>'title', NULLIF(v_task->>'description',''),
          COALESCE(NULLIF(v_task->>'status',''),'da_fare'),
          COALESCE(NULLIF(v_task->>'priority',''),'media'),
          NULLIF(v_task->>'assignee_id','')::uuid, NULLIF(v_task->>'due_date','')::date,
          NULLIF(v_task->>'estimated_hours','')::numeric,
          COALESCE(NULLIF(v_task->>'visibility',''),'internal'), p_created_by
        );
      END LOOP;
    END LOOP;

    -- template ricorrenti (default: milestone di sistema)
    FOR v_rec IN SELECT * FROM jsonb_array_elements(COALESCE(v_ws->'recurring','[]'::jsonb)) LOOP
      INSERT INTO public.recurring_task_templates (
        client_id, project_id, workstream_id, milestone_id, title, description,
        frequency, interval, weekdays, day_of_month, start_date, end_date,
        generation_lead_days, owner_id, priority, estimated_hours, visibility, created_by
      ) VALUES (
        v_client_id, v_project_id, v_ws_id, v_sys_ms_id,
        v_rec->>'title', NULLIF(v_rec->>'description',''),
        v_rec->>'frequency', COALESCE((v_rec->>'interval')::int,1),
        CASE WHEN jsonb_typeof(v_rec->'weekdays') = 'array'
             THEN ARRAY(SELECT jsonb_array_elements_text(v_rec->'weekdays'))::int[] ELSE NULL END,
        NULLIF(v_rec->>'day_of_month','')::int,
        COALESCE(NULLIF(v_rec->>'start_date','')::date, CURRENT_DATE),
        NULLIF(v_rec->>'end_date','')::date,
        COALESCE((v_rec->>'generation_lead_days')::int,3),
        NULLIF(v_rec->>'owner_id','')::uuid,
        COALESCE(NULLIF(v_rec->>'priority',''),'media'),
        NULLIF(v_rec->>'estimated_hours','')::numeric,
        COALESCE(NULLIF(v_rec->>'visibility',''),'internal'), p_created_by
      );
    END LOOP;
  END LOOP;

  RETURN v_project_id;
END $$;

-- verifica: la funzione esiste
SELECT proname, pg_get_function_identity_arguments(oid) AS args
FROM pg_proc WHERE proname = 'create_project_from_template';
