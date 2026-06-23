ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_project_kind_check;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_project_kind_check
    CHECK (project_kind IN ('growth', 'marketing', 'digital', 'ai'));
