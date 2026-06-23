ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS "order" INTEGER DEFAULT 0;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS milestone_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL;
ALTER TABLE public.sprints ADD COLUMN IF NOT EXISTS "order" INTEGER DEFAULT 0;
CREATE INDEX IF NOT EXISTS tasks_parent_id_idx    ON public.tasks(parent_id);
CREATE INDEX IF NOT EXISTS tasks_milestone_id_idx ON public.tasks(milestone_id);
