-- FASE 1a — Classificazione progetti: linea di servizio e modello operativo.
-- Additiva + idempotente.
--
-- `project_kind` (036) resta in tabella ma è DEPRECATA: `service_line` è l'unica
-- fonte di verità (decisione Q27). Va rimossa in una migration successiva, dopo
-- che il codice che la legge (lib/workload.ts, WorkloadClient, ProgettiWidget,
-- ProgettiClient) è stato ripuntato. Tenerle entrambe vive = due verità.
--
-- `project_type` (031) NON è deprecata: è la tipologia tecnica (sito, ecommerce,
-- app…), ortogonale alla linea di servizio.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS service_line TEXT NOT NULL DEFAULT 'digital'
    CHECK (service_line IN ('growth','digital','ai','hybrid','consulting','other')),
  ADD COLUMN IF NOT EXISTS delivery_model TEXT NOT NULL DEFAULT 'structured_project'
    CHECK (delivery_model IN ('recurring_operations','structured_project','hybrid')),
  ADD COLUMN IF NOT EXISTS lifecycle_status TEXT NOT NULL DEFAULT 'active'
    CHECK (lifecycle_status IN ('draft','startup','active','paused','closed','archived'));

CREATE INDEX IF NOT EXISTS idx_projects_service_line ON public.projects(service_line);
CREATE INDEX IF NOT EXISTS idx_projects_lifecycle    ON public.projects(lifecycle_status);

-- Nessun backfill da project_kind: `projects` ha 0 righe in produzione (audit
-- 2026-07-19). Se un giorno servisse su un ambiente con dati, la conversione è
--   growth|marketing → growth · ai → ai · digital → digital,
--   delivery_model = recurring_operations per growth|marketing, altrimenti
--   structured_project.

COMMENT ON COLUMN public.projects.project_kind IS
  'DEPRECATA — usare service_line (migration 115). Rimozione prevista dopo il ripuntamento del codice.';

-- Rollback: ALTER TABLE public.projects
--   DROP COLUMN service_line, DROP COLUMN delivery_model, DROP COLUMN lifecycle_status;
