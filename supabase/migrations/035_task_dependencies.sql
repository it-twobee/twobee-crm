CREATE TABLE IF NOT EXISTS public.task_dependencies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE NOT NULL,
  depends_on_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL DEFAULT 'blocking' CHECK (type IN ('blocking', 'waiting_on')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(task_id, depends_on_id)
);

ALTER TABLE public.task_dependencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth users" ON public.task_dependencies FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_task_dependencies_task_id ON public.task_dependencies(task_id);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_depends_on_id ON public.task_dependencies(depends_on_id);
