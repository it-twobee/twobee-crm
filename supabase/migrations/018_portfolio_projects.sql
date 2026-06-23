-- Portfolio → Progetti (M:M) — modello Asana
-- Un portfolio può contenere progetti di clienti diversi
-- Ogni progetto appartiene già a un cliente via projects.client_id

CREATE TABLE IF NOT EXISTS public.portfolio_projects (
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  project_id   UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  priority     TEXT NOT NULL DEFAULT 'media' CHECK (priority IN ('alta', 'media', 'bassa')),
  added_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (portfolio_id, project_id)
);

ALTER TABLE public.portfolio_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth can manage portfolio_projects"
  ON public.portfolio_projects FOR ALL USING (auth.uid() IS NOT NULL);
