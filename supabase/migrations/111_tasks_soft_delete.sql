-- 111 — Soft-delete ("cestino") per le task.
--
-- Le task non vengono più cancellate fisicamente: si valorizza `deleted_at`.
-- Restano recuperabili dal Cestino (ripristino) o eliminabili in via definitiva.
-- Per non farle ricomparire in NESSUNA vista normale, si aggiunge `deleted_at IS
-- NULL` a tutte le policy RLS di lettura/scrittura di `tasks`. Le operazioni del
-- cestino (soft-delete / ripristino / eliminazione definitiva) passano dal backend
-- con service role (bypassa la RLS), quindi vedono anche le task cestinate.
-- Additiva + idempotente. NB: le sottoquery su `projects` sono invariate (dopo il
-- fix 110 non c'è ricorsione).

ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS tasks_deleted_at_idx ON public.tasks (deleted_at) WHERE deleted_at IS NOT NULL;

-- ── Policy ricreate con il filtro `deleted_at IS NULL` ───────────────────────
DROP POLICY IF EXISTS tasks_admin ON public.tasks;
CREATE POLICY tasks_admin ON public.tasks
  FOR ALL USING (public.get_my_role() = 'admin' AND deleted_at IS NULL);

DROP POLICY IF EXISTS tasks_team_read_write ON public.tasks;
CREATE POLICY tasks_team_read_write ON public.tasks
  FOR ALL USING (
    public.get_my_role() = 'team'
    AND (NOT public.is_external_resource())
    AND project_id IN (SELECT p.id FROM public.projects p WHERE p.client_id = ANY (public.get_my_client_ids()))
    AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS tasks_assignee_self_read ON public.tasks;
CREATE POLICY tasks_assignee_self_read ON public.tasks
  FOR SELECT USING (assignee_id = auth.uid() AND deleted_at IS NULL);

DROP POLICY IF EXISTS tasks_client ON public.tasks;
CREATE POLICY tasks_client ON public.tasks
  FOR SELECT USING (
    public.get_my_role() = ANY (ARRAY['client','guest'])
    AND project_id IN (SELECT p.id FROM public.projects p WHERE p.client_id = public.get_my_client_id_as_client())
    AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS tasks_external ON public.tasks;
CREATE POLICY tasks_external ON public.tasks
  FOR SELECT USING (
    public.is_external_resource()
    AND project_id = ANY (public.get_my_project_ids())
    AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS tasks_team_read_all ON public.tasks;
CREATE POLICY tasks_team_read_all ON public.tasks
  FOR SELECT USING (
    public.get_my_role() = 'team'
    AND project_id IS NOT NULL
    AND (NOT public.is_external_resource())
    AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS tasks_assignee_self_update ON public.tasks;
CREATE POLICY tasks_assignee_self_update ON public.tasks
  FOR UPDATE USING (assignee_id = auth.uid() AND deleted_at IS NULL);
