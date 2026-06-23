-- Tags e flag task cliente sulle tasks
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS is_client_task BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_tasks_is_client_task ON public.tasks(is_client_task);
CREATE INDEX IF NOT EXISTS idx_tasks_tags ON public.tasks USING gin(tags);
