-- Aggiunge project_kind (growth|digital) ai progetti
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS project_kind TEXT CHECK (project_kind IN ('growth', 'digital'));

-- Estende client_type per supportare growth_digital
ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_client_type_check;

ALTER TABLE public.clients
  ADD CONSTRAINT clients_client_type_check
    CHECK (client_type IN ('growth', 'digital', 'growth_digital'));
