-- La 042 non è mai arrivata in produzione (lo snapshot ha preso da 041 solo
-- milestone_id e order): senza `parent_id` il board del progetto
-- (SprintMilestoneBoardSection) non può creare sottotask — insert in errore.
--
-- Nota: l'app usa DUE colonne per lo stesso legame. `parent_id` la usa il board
-- del progetto, `parent_task_id` il workspace / "Le mie attività" / createTaskWs.
-- Qui le facciamo coesistere e le allineiamo; unificarle è un lavoro a parte.
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS tasks_parent_id_idx ON public.tasks(parent_id);

UPDATE public.tasks SET parent_id = parent_task_id
 WHERE parent_task_id IS NOT NULL AND parent_id IS NULL;
