-- 279 — Una task resta nella sua milestone e compare nel calendario di Progetti
-- (§479). `tasks.on_calendar`: false per tutte le task che esistono già, quindi
-- il calendario non cambia finché qualcuno non ne segna una. Sostituisce
-- «Trasforma in milestone», che creava un riquadro nuovo ed eliminava la task.
-- Additiva, rilanciabile, non riscrive funzioni.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS on_calendar boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS tasks_on_calendar_idx ON public.tasks (project_id) WHERE on_calendar AND deleted_at IS NULL;

NOTIFY pgrst, 'reload schema';
COMMIT;
