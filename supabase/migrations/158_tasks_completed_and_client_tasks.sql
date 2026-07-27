-- 158 — Task: timestamp di completamento e task assegnate al cliente
--
-- 1) `tasks.completed_at` non esisteva (ce l'aveva solo `milestones`), ma
--    updateTaskStatus lo scriveva: completare una task falliva in produzione.
--
-- 2) Nuovo `task_type = 'cliente'`: cose che deve fare IL CLIENTE, distinte
--    dalle ad hoc (che sono nostre, interne). Come le ad hoc vivono sotto la
--    sola anagrafica, senza progetto/workstream/milestone.
--
-- Idempotente. I blocchi sono separati apposta: eseguili anche uno alla volta.

-- ── blocco 1: quando una task è stata chiusa ───────────────────────────────
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- ── blocco 2: ammetti il nuovo tipo ────────────────────────────────────────
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_task_type_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_task_type_check
  CHECK (task_type IN ('project', 'ad_hoc', 'cliente'));

-- ── blocco 3: la gerarchia vale anche per 'cliente' ────────────────────────
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_hierarchy_chk;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_hierarchy_chk CHECK (
  (task_type = 'project' AND project_id IS NOT NULL AND workstream_id IS NOT NULL AND milestone_id IS NOT NULL)
  OR (task_type IN ('ad_hoc', 'cliente') AND project_id IS NULL AND workstream_id IS NULL AND milestone_id IS NULL)
);

-- ── blocco 4: indice per la nuova sezione ──────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tasks_client_kind ON public.tasks(client_id, task_type)
  WHERE deleted_at IS NULL;
