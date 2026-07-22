-- FASE 3 — Scope della task: progetto, cliente o personale.
-- Additiva + idempotente.
--
-- IL PROBLEMA CHE QUESTA MIGRATION EVITA
-- Il §10 del brief propone: task ad hoc = client_id valorizzato, project_id
-- nullable. Ma la migration 094 ha GIÀ dato un significato a project_id NULL:
--
--   "una task senza progetto è un todo personale del suo assegnatario e NON
--    deve comparire ai colleghi"
--   CREATE POLICY tasks_team_read_all ... USING (get_my_role()='team'
--                                                AND project_id IS NOT NULL)
--
-- Implementando il §10 alla lettera, OGNI task ad hoc di cliente sarebbe
-- invisibile a tutto il team tranne l'assegnatario e l'admin. Il pannello
-- "Attività ad hoc del cliente" apparirebbe VUOTO a manager e senior, senza un
-- solo errore: solo liste vuote.
--
-- LA SOLUZIONE
-- `scope_type` rende esplicito ciò che era implicito nel NULL:
--
--   scope_type   project_id   client_id   team vede   significato
--   project      NOT NULL     derivato    sì          task di progetto (default)
--   client       NULL         NOT NULL    sì          ad hoc cliente (nuovo)
--   personal     NULL         NULL        NO          todo personale (094)
--
-- La privacy delle task personali resta intatta; le ad hoc diventano visibili.

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scope_type TEXT NOT NULL DEFAULT 'project',
  ADD COLUMN IF NOT EXISTS work_type TEXT NOT NULL DEFAULT 'project';

-- Backfill PRIMA dei CHECK, altrimenti le 7 task esistenti (tutte senza
-- progetto, tutte di test) violerebbero il vincolo di coerenza.
UPDATE public.tasks SET scope_type = 'personal'
WHERE project_id IS NULL AND client_id IS NULL AND scope_type = 'project';

UPDATE public.tasks SET scope_type = 'project'
WHERE project_id IS NOT NULL AND scope_type <> 'project';

-- `client_id` allineato al progetto: ridondante ma comodo per filtrare senza join.
UPDATE public.tasks t SET client_id = p.client_id
FROM public.projects p
WHERE t.project_id = p.id AND t.client_id IS NULL;

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_scope_type_chk;
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_scope_type_chk
  CHECK (scope_type IN ('project','client','personal'));

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_work_type_chk;
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_work_type_chk
  CHECK (work_type IN ('project','startup','routine','initiative','adhoc'));

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_scope_coherent;
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_scope_coherent CHECK (
    (scope_type = 'project'  AND project_id IS NOT NULL) OR
    (scope_type = 'client'   AND project_id IS NULL AND client_id IS NOT NULL) OR
    (scope_type = 'personal' AND project_id IS NULL AND client_id IS NULL)
  );

CREATE INDEX IF NOT EXISTS idx_tasks_client ON public.tasks(client_id);
CREATE INDEX IF NOT EXISTS idx_tasks_scope ON public.tasks(scope_type);
CREATE INDEX IF NOT EXISTS idx_tasks_adhoc ON public.tasks(client_id, status)
  WHERE scope_type = 'client';

-- Tiene client_id allineato al progetto quando la task si sposta.
CREATE OR REPLACE FUNCTION public.tasks_sync_client_id()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.project_id IS NOT NULL THEN
    SELECT p.client_id INTO NEW.client_id FROM public.projects p WHERE p.id = NEW.project_id;
    NEW.scope_type := 'project';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tasks_client_sync ON public.tasks;
CREATE TRIGGER tasks_client_sync
  BEFORE INSERT OR UPDATE OF project_id ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.tasks_sync_client_id();

-- ─── RLS: sostituisce la policy della 094 ───────────────────────────────────
-- Prima: il team vedeva le task CON progetto. Ora vede quelle di progetto E
-- quelle di cliente; le personali restano al solo proprietario (via
-- tasks_assignee_self_read) e all'admin (tasks_admin).

DROP POLICY IF EXISTS "tasks_team_read_all" ON public.tasks;
CREATE POLICY "tasks_team_read_all" ON public.tasks
  FOR SELECT USING (
    public.get_my_role() = 'team' AND scope_type IN ('project','client')
  );

-- Verifica
SELECT scope_type, COUNT(*) FROM public.tasks GROUP BY scope_type;

-- Rollback:
--   DROP TRIGGER tasks_client_sync ON public.tasks;
--   DROP FUNCTION public.tasks_sync_client_id();
--   DROP POLICY "tasks_team_read_all" ON public.tasks;
--   CREATE POLICY "tasks_team_read_all" ON public.tasks FOR SELECT
--     USING (public.get_my_role() = 'team' AND project_id IS NOT NULL);
--   ALTER TABLE public.tasks DROP COLUMN client_id, DROP COLUMN scope_type, DROP COLUMN work_type;
