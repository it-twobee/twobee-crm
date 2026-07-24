-- 154 - Project V2: subtask (task figlie) dentro le task di progetto
--
-- Una subtask e' una task con parent_task_id valorizzato. Eredita la gerarchia
-- (client/project/workstream/milestone) dal padre; il CHECK esistente resta
-- valido perche' i FK vengono comunque copiati.

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS parent_task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_tasks_parent ON public.tasks(parent_task_id);

-- verifica
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'parent_task_id';
