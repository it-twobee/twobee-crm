ALTER TABLE public.os_tasks
  ADD COLUMN IF NOT EXISTS depends_on UUID[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS implementation_order INTEGER;

CREATE INDEX IF NOT EXISTS idx_os_tasks_status ON public.os_tasks(status);
CREATE INDEX IF NOT EXISTS idx_os_tasks_priority ON public.os_tasks(priority, implementation_order);
