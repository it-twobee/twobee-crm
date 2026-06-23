-- Aggiunge project_id a client_kpis per KPI per progetto
ALTER TABLE public.client_kpis
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE;

-- Rimuove il vecchio unique constraint (client_id, month)
ALTER TABLE public.client_kpis
  DROP CONSTRAINT IF EXISTS client_kpis_client_id_month_key;

-- Rimuove partial index (non supportati da PostgREST onConflict)
DROP INDEX IF EXISTS client_kpis_project_month_unique;
DROP INDEX IF EXISTS client_kpis_client_month_noproject_unique;

-- Unique constraint reale per upsert onConflict
ALTER TABLE public.client_kpis
  ADD CONSTRAINT client_kpis_client_project_month_unique
  UNIQUE (client_id, project_id, month);

-- Aggiunge project_id a client_kpi_config
ALTER TABLE public.client_kpi_config
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE;

ALTER TABLE public.client_kpi_config
  DROP CONSTRAINT IF EXISTS client_kpi_config_client_id_key;

DROP INDEX IF EXISTS client_kpi_config_project_unique;
DROP INDEX IF EXISTS client_kpi_config_client_noproject_unique;

ALTER TABLE public.client_kpi_config
  ADD CONSTRAINT client_kpi_config_client_project_unique
  UNIQUE (client_id, project_id);
