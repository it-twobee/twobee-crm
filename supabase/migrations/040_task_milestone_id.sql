ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS milestone_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS tasks_milestone_id_idx ON public.tasks(milestone_id);
