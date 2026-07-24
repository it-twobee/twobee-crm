-- 152 - Project V2: motore di generazione occorrenze ricorrenti
--
-- Genera Task reali dai recurring_task_templates attivi, per la finestra
-- [oggi, oggi + generation_lead_days]. Idempotente grazie a
-- UNIQUE(recurring_template_id, generated_for_date) + ON CONFLICT DO NOTHING.
-- Nessun carry-over: genera solo occorrenze nella finestra futura.
-- 'custom' (RRULE) non e' gestito qui: sara' lato app.

CREATE OR REPLACE FUNCTION public.generate_recurring_task_occurrences()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO public.tasks (
    client_id, task_type, project_id, workstream_id, milestone_id,
    title, description, status, priority, assignee_id, due_date,
    estimated_hours, visibility, recurring_template_id, is_recurring_instance,
    generated_for_date, created_by
  )
  SELECT
    t.client_id, 'project', t.project_id, t.workstream_id, t.milestone_id,
    t.title, t.description, 'da_fare', t.priority, t.owner_id, g::date,
    t.estimated_hours, t.visibility, t.id, true, g::date, t.created_by
  FROM public.recurring_task_templates t
  CROSS JOIN LATERAL generate_series(CURRENT_DATE, CURRENT_DATE + t.generation_lead_days, interval '1 day') AS g
  WHERE t.active
    AND t.project_id IS NOT NULL
    AND t.workstream_id IS NOT NULL
    AND t.milestone_id IS NOT NULL
    AND g::date >= t.start_date
    AND (t.end_date IS NULL OR g::date <= t.end_date)
    AND (
      (t.frequency = 'daily'
        AND ((g::date - t.start_date) % GREATEST(t.interval, 1)) = 0)
      OR (t.frequency = 'weekly'
        AND EXTRACT(dow FROM g)::int = ANY (COALESCE(t.weekdays, ARRAY[EXTRACT(dow FROM t.start_date)::int]))
        AND (((g::date - t.start_date) / 7) % GREATEST(t.interval, 1)) = 0)
      OR (t.frequency = 'biweekly'
        AND EXTRACT(dow FROM g)::int = ANY (COALESCE(t.weekdays, ARRAY[EXTRACT(dow FROM t.start_date)::int]))
        AND (((g::date - t.start_date) / 7) % 2) = 0)
      OR (t.frequency = 'monthly'
        AND EXTRACT(day FROM g)::int = COALESCE(t.day_of_month, EXTRACT(day FROM t.start_date)::int)
        AND ((((EXTRACT(year FROM g) - EXTRACT(year FROM t.start_date)) * 12
              + (EXTRACT(month FROM g) - EXTRACT(month FROM t.start_date)))::int) % GREATEST(t.interval, 1)) = 0)
      OR (t.frequency = 'quarterly'
        AND EXTRACT(day FROM g)::int = COALESCE(t.day_of_month, EXTRACT(day FROM t.start_date)::int)
        AND ((((EXTRACT(year FROM g) - EXTRACT(year FROM t.start_date)) * 12
              + (EXTRACT(month FROM g) - EXTRACT(month FROM t.start_date)))::int) % 3) = 0)
    )
  ON CONFLICT (recurring_template_id, generated_for_date) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.recurring_task_templates
  SET last_generated_at = now(),
      next_generation_at = (CURRENT_DATE + 1)::timestamptz
  WHERE active;

  RETURN v_count;
END $$;

-- schedulazione giornaliera via pg_cron (06:00). Guardata: se pg_cron non c'e', si ignora.
DO $$
BEGIN
  PERFORM cron.schedule('generate-recurring-tasks', '0 6 * * *',
    $cron$ SELECT public.generate_recurring_task_occurrences(); $cron$);
EXCEPTION WHEN undefined_table OR undefined_function OR invalid_schema_name THEN
  RAISE NOTICE 'pg_cron non disponibile: schedula generate-recurring-tasks a mano';
END $$;

-- generazione immediata di prova (popola subito la finestra corrente)
SELECT public.generate_recurring_task_occurrences() AS occorrenze_generate;
