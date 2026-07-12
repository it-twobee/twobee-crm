-- 106 — Scoping risorse ESTERNE (freelance / partner) ai soli progetti in cui sono incluse.
--
-- Problema: freelance e partner hanno app_role diverso ma role='team' in profiles,
-- quindi get_my_role()='team' e le policy 092/094 (clients_team_all, projects_team_all,
-- sprints_team_all, tasks_team_read_all) li fanno leggere TUTTI i clienti/progetti/task.
-- Regola prodotto: gli esterni vedono SOLO i progetti in cui sono inclusi, in sola lettura.
--
-- Qui: (1) helper per identificarli e per calcolare i loro progetti; (2) togliamo agli
-- esterni la lettura "tutto" e aggiungiamo policy scoped; (3) chiudiamo per sicurezza
-- anche la scrittura RLS delle task (già a scope vuoto senza client_assignments).
-- Il blocco delle scritture via service-role (server action) è nel codice applicativo.
--
-- "Incluso in un progetto" = ha una task assegnata (task_assignees o tasks.assignee_id)
-- nel progetto, oppure ne è il project manager (projects.manager_id).
--
-- Additiva e idempotente (DROP POLICY IF EXISTS + CREATE OR REPLACE).

-- ── Helper ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_external_resource()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(app_role IN ('freelance', 'partner'), false)
  FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_my_project_ids()
RETURNS UUID[] AS $$
  SELECT ARRAY(
    SELECT DISTINCT t.project_id
      FROM public.tasks t
      JOIN public.task_assignees ta ON ta.task_id = t.id
      WHERE ta.profile_id = auth.uid() AND t.project_id IS NOT NULL
    UNION
    SELECT DISTINCT t2.project_id
      FROM public.tasks t2
      WHERE t2.assignee_id = auth.uid() AND t2.project_id IS NOT NULL
    UNION
    SELECT p.id FROM public.projects p WHERE p.manager_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ── CLIENTI ──────────────────────────────────────────────────────────────────
-- Team interno: tutti. Esterni: solo i clienti dei propri progetti.
DROP POLICY IF EXISTS "clients_team_all" ON public.clients;
CREATE POLICY "clients_team_all" ON public.clients
  FOR SELECT USING (
    public.get_my_role() = 'team' AND NOT public.is_external_resource()
  );

DROP POLICY IF EXISTS "clients_external" ON public.clients;
CREATE POLICY "clients_external" ON public.clients
  FOR SELECT USING (
    public.is_external_resource() AND
    id IN (SELECT client_id FROM public.projects WHERE id = ANY(public.get_my_project_ids()))
  );

-- ── PROGETTI ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "projects_team_all" ON public.projects;
CREATE POLICY "projects_team_all" ON public.projects
  FOR SELECT USING (
    public.get_my_role() = 'team' AND NOT public.is_external_resource()
  );

DROP POLICY IF EXISTS "projects_external" ON public.projects;
CREATE POLICY "projects_external" ON public.projects
  FOR SELECT USING (
    public.is_external_resource() AND id = ANY(public.get_my_project_ids())
  );

-- ── SPRINT ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "sprints_team_all" ON public.sprints;
CREATE POLICY "sprints_team_all" ON public.sprints
  FOR SELECT USING (
    public.get_my_role() = 'team' AND NOT public.is_external_resource()
  );

DROP POLICY IF EXISTS "sprints_external" ON public.sprints;
CREATE POLICY "sprints_external" ON public.sprints
  FOR SELECT USING (
    public.is_external_resource() AND project_id = ANY(public.get_my_project_ids())
  );

-- ── TASK ─────────────────────────────────────────────────────────────────────
-- Read: team interno tutte le task di progetto; esterni solo quelle dei propri progetti.
DROP POLICY IF EXISTS "tasks_team_read_all" ON public.tasks;
CREATE POLICY "tasks_team_read_all" ON public.tasks
  FOR SELECT USING (
    public.get_my_role() = 'team' AND project_id IS NOT NULL AND NOT public.is_external_resource()
  );

DROP POLICY IF EXISTS "tasks_external" ON public.tasks;
CREATE POLICY "tasks_external" ON public.tasks
  FOR SELECT USING (
    public.is_external_resource() AND project_id = ANY(public.get_my_project_ids())
  );

-- Write RLS: esclude esplicitamente gli esterni (sola lettura), oltre allo scope client.
DROP POLICY IF EXISTS "tasks_team_read_write" ON public.tasks;
CREATE POLICY "tasks_team_read_write" ON public.tasks
  FOR ALL USING (
    public.get_my_role() = 'team' AND NOT public.is_external_resource() AND
    project_id IN (
      SELECT id FROM public.projects WHERE client_id = ANY(public.get_my_client_ids())
    )
  );

-- Nota rollback: ripristinare le definizioni 092/094/001 delle policy droppate
-- (clients_team_all, projects_team_all, sprints_team_all, tasks_team_read_all,
-- tasks_team_read_write) senza il predicato is_external_resource(), e DROP delle
-- policy *_external + delle due funzioni helper.
