-- 141 — Task V2: tipo, supervisore, visibilità, checklist.
-- Additiva + idempotente. Dipende dalla 138/139.
--
-- La checklist sostituisce la subtask come livello operativo dentro la task
-- (§1 del brief). tasks.parent_task_id resta come funzionalità accessoria —
-- ha 0 righe — ma esce dalla navigazione.

ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS task_type TEXT NOT NULL DEFAULT 'action';
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS supervisor_id UUID
  REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'internal';
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS completion_criteria TEXT;

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_task_type_chk;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_task_type_chk
  CHECK (task_type IN (
    'action','review','approval','delivery','meeting',
    'control','recurring','client_request','support_request'));

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_visibility_chk;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_visibility_chk
  CHECK (visibility IN ('internal','client','partner'));

-- Le occorrenze già generate sono ricorrenti per definizione.
UPDATE public.tasks SET task_type = 'recurring'
WHERE routine_id IS NOT NULL AND task_type = 'action';

CREATE INDEX IF NOT EXISTS idx_tasks_type ON public.tasks(task_type);

COMMENT ON COLUMN public.tasks.parent_task_id IS
  'Accessoria — non è un livello di navigazione. Per il lavoro dentro la task: task_checklist_items (141)';

-- ─── Checklist ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.task_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT false,
  position INT NOT NULL DEFAULT 0,
  done_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  done_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tci_task
  ON public.task_checklist_items(task_id, position);

-- ─── RLS: eredita la visibilità della task madre ────────────────────────────
ALTER TABLE public.task_checklist_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tci_staff_read" ON public.task_checklist_items;
CREATE POLICY "tci_staff_read" ON public.task_checklist_items
  FOR SELECT USING (public.is_staff());

-- Spuntare una voce è lavoro operativo: lo fa chi può vedere la task, non solo
-- l'admin. Se la task non è più leggibile, la voce sparisce con lei.
DROP POLICY IF EXISTS "tci_staff_write" ON public.task_checklist_items;
CREATE POLICY "tci_staff_write" ON public.task_checklist_items
  FOR ALL USING (
    public.is_staff()
    AND task_id IN (SELECT t.id FROM public.tasks t)
  ) WITH CHECK (
    public.is_staff()
    AND task_id IN (SELECT t.id FROM public.tasks t)
  );

-- ─── Verifica ───────────────────────────────────────────────────────────────
SELECT task_type, count(*) FROM public.tasks GROUP BY 1 ORDER BY 2 DESC;
