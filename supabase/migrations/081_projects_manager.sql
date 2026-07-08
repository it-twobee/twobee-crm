-- Migration 081: projects.manager_id

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS manager_id UUID
    REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_projects_manager ON public.projects(manager_id);
