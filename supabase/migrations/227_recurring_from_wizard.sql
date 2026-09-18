-- 227 — le ricorrenti del wizard nascono lavorabili (§346)
--
-- Misurato sul database il 2026-09-17, prima di questa migration: 15 regole
-- ricorrenti attive, **zero occorrenze**, `last_generated_at` nullo su tutte e
-- 15, `owner_id` nullo su tutte e 15. Tutte nate dal wizard.
--
-- Due difetti, e stanno tutti e due qui dentro:
--
-- 1) **La finestra era di tre giorni.** §337 aveva deciso trenta e la 223 ha
--    messo `DEFAULT 30` sulla colonna, ma questa funzione scriveva
--    `COALESCE(..., 3)` esplicito: il default non si applicava mai. Con tre
--    giorni una mensile o una quindicinale non produce niente per settimane —
--    la regola c'è, l'elenco delle task resta vuoto, e non c'è modo di
--    accorgersene. Il gate lo dice da sempre: «tre giorni non ne prendono
--    nessuno» (`lib/recurrence-run.check.ts`). Adesso la colonna **non viene
--    scritta** se il payload non porta un numero: il valore sta nella colonna,
--    in un posto solo, e chi vuole una finestra diversa la scrive e basta.
--
-- 2) **La regola nasceva di nessuno.** `owner_id` finiva nel template così
--    com'era nel payload — e il payload del wizard lo lasciava sempre vuoto.
--    Il motore copia `owner_id` in `assignee_id`: a regola senza responsabile,
--    occorrenza di nessuno, che è il modo più silenzioso di non consegnare un
--    lavoro. Qui c'è il **pavimento**: se il payload non dice chi, prende il
--    responsabile del workstream e in ultima istanza il PM del progetto. La UI
--    propone lo stesso nome e lo si può cambiare prima di creare; questo serve
--    ai payload che la UI non costruisce — la conversione di un'opportunità
--    vinta (225) crea progetti da template senza passare dal wizard.
--
-- Backfill: le righe a 3 tornano a 30. Nessun backfill sui responsabili — chi
-- riceve una ricorrente è una decisione di qualcuno, e inventarla qui la
-- renderebbe indistinguibile da una scelta vera. Quelle senza responsabile le
-- dichiara la scheda progetto, con il gesto per rimediare.
--
-- Rilanciabile: `CREATE OR REPLACE` + un UPDATE idempotente.

BEGIN;

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
  v_rec       jsonb; v_rec_id uuid;
BEGIN
  v_client_id := NULLIF(proj->>'client_id','')::uuid;  -- NULL = progetto interno
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
      project_id, name, description, workstream_type, status, owner_id, priority,
      visibility, start_date, end_date, sort_order
    ) VALUES (
      v_project_id, v_ws->>'name', NULLIF(v_ws->>'description',''),
      COALESCE(NULLIF(v_ws->>'workstream_type',''),'project'),
      COALESCE(NULLIF(v_ws->>'status',''),'active'),
      NULLIF(v_ws->>'owner_id','')::uuid,
      COALESCE(NULLIF(v_ws->>'priority',''),'media'),
      COALESCE(NULLIF(v_ws->>'visibility',''),'internal'),
      NULLIF(v_ws->>'start_date','')::date, NULLIF(v_ws->>'end_date','')::date,
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
        owner_id, priority, estimated_hours, visibility, created_by
      ) VALUES (
        v_client_id, v_project_id, v_ws_id, v_sys_ms_id,
        v_rec->>'title', NULLIF(v_rec->>'description',''),
        v_rec->>'frequency', COALESCE((v_rec->>'interval')::int,1),
        CASE WHEN jsonb_typeof(v_rec->'weekdays') = 'array'
             THEN ARRAY(SELECT jsonb_array_elements_text(v_rec->'weekdays'))::int[] ELSE NULL END,
        NULLIF(v_rec->>'day_of_month','')::int,
        COALESCE(NULLIF(v_rec->>'start_date','')::date, CURRENT_DATE),
        NULLIF(v_rec->>'end_date','')::date,
        -- §346 — il pavimento: una regola senza responsabile genera task di nessuno
        COALESCE(
          NULLIF(v_rec->>'owner_id','')::uuid,
          NULLIF(v_ws->>'owner_id','')::uuid,
          NULLIF(proj->>'manager_id','')::uuid
        ),
        COALESCE(NULLIF(v_rec->>'priority',''),'media'),
        NULLIF(v_rec->>'estimated_hours','')::numeric,
        COALESCE(NULLIF(v_rec->>'visibility',''),'internal'), p_created_by
      ) RETURNING id INTO v_rec_id;

      -- §346 — la finestra sta nella colonna (DEFAULT 30): qui si scrive solo
      -- se il payload ne chiede una diversa, o sarebbe lo stesso numero in due posti
      IF NULLIF(v_rec->>'generation_lead_days','') IS NOT NULL THEN
        UPDATE public.recurring_task_templates
           SET generation_lead_days = (v_rec->>'generation_lead_days')::int
         WHERE id = v_rec_id;
      END IF;
    END LOOP;
  END LOOP;

  RETURN v_project_id;
END $$;

-- backfill: il 3 non l'ha scelto nessuno — nessuna UI lo espone
UPDATE public.recurring_task_templates
   SET generation_lead_days = 30
 WHERE generation_lead_days = 3;

COMMIT;

-- verifica: nessuna regola con la finestra a tre giorni, e quante sono senza
-- responsabile (quelle le sistema una persona, non questa migration)
SELECT
  count(*) FILTER (WHERE generation_lead_days = 3)              AS finestra_3,
  count(*) FILTER (WHERE generation_lead_days = 30)             AS finestra_30,
  count(*) FILTER (WHERE owner_id IS NULL AND active)           AS senza_responsabile,
  count(*) FILTER (WHERE last_generated_at IS NULL AND active)  AS mai_generate
FROM public.recurring_task_templates;
