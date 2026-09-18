-- 228 — la finestra di generazione la decide la cadenza (§346)
--
-- La 227 ha portato tutte le regole a trenta giorni, ed era giusto contro i tre
-- di prima: con tre giorni una mensile non produceva niente per settimane. Ma
-- trenta giorni su una **giornaliera** sono trenta righe identiche in «Le mie
-- attività»: misurato il 18 settembre 2026, un giro di generazione avrebbe
-- creato 236 occorrenze, di cui ~170 dalle sole sei regole giornaliere.
--
-- §337 aveva previsto la valvola — «resta per template: chi produce troppo si
-- abbassa da solo» — ma `generation_lead_days` non è esposto in nessun form,
-- quindi «si abbassa da solo» non è mai stato possibile. Un parametro che
-- nessuno può toccare non è una scelta: è un numero.
--
-- La regola: **quante righe una regola mette in lista non deve dipendere dalla
-- sua cadenza.** Giornaliera 7 giorni, settimanale e quindicinale 30, mensile
-- 90, trimestrale 180 — ognuna mostra all'incirca lo stesso numero di
-- occorrenze davanti a sé. Con questa finestra lo stesso giro ne creerebbe 85
-- invece di 236.
--
-- **Dove vive il numero.** In un posto solo: `recurrence_lead_days(frequency)`.
-- La colonna diventa **nullable**, e NULL vuol dire «decidila tu»: lo scrive un
-- trigger `BEFORE INSERT OR UPDATE`. Così i due soli scrittori — l'azione
-- (PostgREST, che non può chiamare una funzione) e
-- `create_project_from_template` — non devono conoscere nessuna tabella di
-- numeri, e un valore esplicito continua a vincere su tutto.
--
-- Rilanciabile: `CREATE OR REPLACE`, `DROP TRIGGER IF EXISTS`, e un backfill che
-- riporta allo stesso valore quello che ci è già.

BEGIN;

ALTER TABLE public.recurring_task_templates
  ALTER COLUMN generation_lead_days DROP NOT NULL,
  ALTER COLUMN generation_lead_days DROP DEFAULT;

COMMENT ON COLUMN public.recurring_task_templates.generation_lead_days IS
  'Quanti giorni avanti materializzare. NULL = quella della cadenza (recurrence_lead_days), scritta dal trigger.';

CREATE OR REPLACE FUNCTION public.recurrence_lead_days(p_frequency text)
RETURNS int
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_frequency
    WHEN 'daily'     THEN 7     -- una settimana davanti: di più sono trenta righe uguali
    WHEN 'weekly'    THEN 30
    WHEN 'biweekly'  THEN 30
    WHEN 'monthly'   THEN 90    -- un trimestre: una mensile a trenta giorni ne mostra una sola
    WHEN 'quarterly' THEN 180
    ELSE 30                     -- 'custom': è una RRULE che il motore non legge, non genera comunque
  END
$$;

CREATE OR REPLACE FUNCTION public.tbv2_recurrence_lead_days()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.generation_lead_days IS NULL THEN
    NEW.generation_lead_days := public.recurrence_lead_days(NEW.frequency);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_recurrence_lead_days ON public.recurring_task_templates;
CREATE TRIGGER trg_recurrence_lead_days
  BEFORE INSERT OR UPDATE ON public.recurring_task_templates
  FOR EACH ROW EXECUTE FUNCTION public.tbv2_recurrence_lead_days();

-- il wizard torna a scrivere la colonna, ma solo quando il payload la porta:
-- NULL passa al trigger, che sa cosa farne (la 227 ci arrivava con un UPDATE in coda)
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
        -- NULL = quella della cadenza, la scrive il trigger (§346)
        NULLIF(v_rec->>'generation_lead_days','')::int,
        -- §346 — il pavimento: una regola senza responsabile non genera niente
        COALESCE(
          NULLIF(v_rec->>'owner_id','')::uuid,
          NULLIF(v_ws->>'owner_id','')::uuid,
          NULLIF(proj->>'manager_id','')::uuid
        ),
        COALESCE(NULLIF(v_rec->>'priority',''),'media'),
        NULLIF(v_rec->>'estimated_hours','')::numeric,
        COALESCE(NULLIF(v_rec->>'visibility',''),'internal'), p_created_by
      );
    END LOOP;
  END LOOP;

  RETURN v_project_id;
END $$;

-- backfill: i trenta della 227 non li ha scelti nessuno — nessuna UI espone il
-- campo — quindi tornano a essere quelli della cadenza
UPDATE public.recurring_task_templates
   SET generation_lead_days = public.recurrence_lead_days(frequency)
 WHERE generation_lead_days = 30;

COMMIT;

-- verifica: la finestra per cadenza, e quante regole restano ferme senza responsabile
SELECT frequency,
       count(*)                                   AS regole,
       min(generation_lead_days)                  AS finestra_min,
       max(generation_lead_days)                  AS finestra_max,
       count(*) FILTER (WHERE owner_id IS NULL)   AS senza_responsabile
FROM public.recurring_task_templates
WHERE active
GROUP BY frequency
ORDER BY frequency;
