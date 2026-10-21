-- 275 — L'ordine delle task dentro una milestone (§486). `tasks.position`, un
-- numero con i buchi (`lib/task-order.ts`): null = ordine di creazione, quindi
-- le task che esistono già non cambiano posto finché qualcuno non le sposta.
-- Additiva, rilanciabile, non riscrive funzioni.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS position double precision;
CREATE INDEX IF NOT EXISTS tasks_milestone_position_idx ON public.tasks (milestone_id, position);

NOTIFY pgrst, 'reload schema';
COMMIT;
