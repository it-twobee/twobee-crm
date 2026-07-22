-- Colonne della fase Startup, referenziate da create_project_from_wizard (134)
-- ma mai create: la creazione progetto falliva con
--   column "startup_target_days" of relation "projects" does not exist
--
-- 21 giorni di default, modificabile per cliente (decisione A4).

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS startup_started_on DATE,
  ADD COLUMN IF NOT EXISTS startup_target_days INT NOT NULL DEFAULT 21,
  ADD COLUMN IF NOT EXISTS startup_completed_at TIMESTAMPTZ;

SELECT name, startup_target_days, growth_vertical FROM public.projects;
