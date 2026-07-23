-- 146 — RESET: pulizia dopo 144/145
--
-- Funzioni orfane, colonne FK rimaste appese, canali chat di progetto,
-- voci di sidebar, cron del MRR.
--
-- Nota: droppare get_my_project_ids() con CASCADE porta via anche la policy
-- "clients_external" su clients (leggeva i clienti *dei propri progetti*).
-- È voluto: senza progetti quella scoping non esiste più. Le risorse esterne
-- restano senza accesso ai clienti finché non si ridisegna il portale.

BEGIN;

-- ── funzioni che leggevano tabelle droppate (tutti gli overload) ────────────
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (ARRAY[
        'get_my_project_ids', 'create_project_from_wizard', 'compute_client_risk',
        'client_mrr', 'refresh_mrr_now', 'refresh_all_client_mrr',
        'rs_monthly_amount', 'active_streams', 'unassigned_revenue', 'unbilled_sal',
        'company_revenue_ytd', 'admin_revenue_scorecards', 'workspace_revenue_summary',
        'line_sold', 'line_collected', 'line_backlog', 'recurring_by_line',
        'can_view_full_financials', 'can_view_macro_revenue'
      ])
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;

COMMIT;

BEGIN;

-- ── canali chat di progetto: via le righe prima delle colonne ───────────────
DELETE FROM public.chat_channels
WHERE project_id IS NOT NULL
   OR type IN ('interno', 'task', 'cliente_interno');

-- ── colonne FK rimaste appese su tabelle superstiti ─────────────────────────
ALTER TABLE public.chat_channels       DROP COLUMN IF EXISTS project_id;
ALTER TABLE public.chat_channels       DROP COLUMN IF EXISTS task_id;
ALTER TABLE public.calendar_events     DROP COLUMN IF EXISTS project_id;
ALTER TABLE public.client_integrations DROP COLUMN IF EXISTS project_id;
ALTER TABLE public.client_kpi_config   DROP COLUMN IF EXISTS project_id;
ALTER TABLE public.client_kpis         DROP COLUMN IF EXISTS project_id;
ALTER TABLE public.documents           DROP COLUMN IF EXISTS project_id;

-- I KPI tornano mensili per cliente: la 037 li aveva resi per progetto.
ALTER TABLE public.client_kpis
  DROP CONSTRAINT IF EXISTS client_kpis_client_project_month_unique;
ALTER TABLE public.client_kpis
  ADD CONSTRAINT client_kpis_client_id_month_key UNIQUE (client_id, month);

ALTER TABLE public.client_kpi_config
  DROP CONSTRAINT IF EXISTS client_kpi_config_client_project_unique;
ALTER TABLE public.client_kpi_config
  ADD CONSTRAINT client_kpi_config_client_id_key UNIQUE (client_id);

COMMIT;

BEGIN;

-- ── sidebar workspace: spegne le voci senza pagina ─────────────────────────
UPDATE public.workspace_sections
SET is_active = false
WHERE key IN ('progetti', 'portfolio', 'task', 'mie_attivita', 'workload', 'cestino');

COMMIT;

-- ── cron del MRR: la funzione non esiste più ───────────────────────────────
DO $$
BEGIN
  PERFORM cron.unschedule('refresh-client-mrr')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-client-mrr');
EXCEPTION WHEN undefined_table OR undefined_function OR invalid_schema_name THEN
  NULL;
END $$;

-- verifica: 0 funzioni orfane, 0 colonne appese
SELECT 'funzioni' AS che, count(*) AS residue
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('get_my_project_ids', 'client_mrr', 'create_project_from_wizard')
UNION ALL
SELECT 'colonne', count(*)
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name IN ('project_id', 'task_id', 'sprint_id', 'workstream_id', 'milestone_id');
