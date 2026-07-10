-- ─── Workspace: manager…partner (role='team') vedono TUTTO ───────────────────
-- Richiesta: tutti i ruoli da manager in giù devono vedere, nell'area workspace,
-- tutti i clienti, tutti i progetti e tutte le task — non più solo quelli assegnati.
--
-- I ruoli workspace (manager, senior, junior, stage, freelance, partner) hanno
-- tutti role='team' in profiles; get_my_role() legge quel campo. Basta quindi
-- allargare le policy SELECT del team da "solo i miei client_ids" a "tutto".
--
-- La SCRITTURA resta invariata: tasks_team_read_write continua a limitare
-- create/update/delete ai clienti assegnati; qui aggiungiamo solo la lettura.

-- CLIENTI: da assegnati → tutti
DROP POLICY IF EXISTS "clients_team_assigned" ON public.clients;
CREATE POLICY "clients_team_all" ON public.clients
  FOR SELECT USING (public.get_my_role() = 'team');

-- PROGETTI: da assegnati → tutti
DROP POLICY IF EXISTS "projects_team" ON public.projects;
CREATE POLICY "projects_team_all" ON public.projects
  FOR SELECT USING (public.get_my_role() = 'team');

-- SPRINT: coerenza con la vista progetto completa
DROP POLICY IF EXISTS "sprints_team" ON public.sprints;
CREATE POLICY "sprints_team_all" ON public.sprints
  FOR SELECT USING (public.get_my_role() = 'team');

-- TASK: aggiunge la lettura di TUTTE le task (la policy FOR ALL scoped resta
-- per la scrittura; le policy permissive si sommano in OR).
DROP POLICY IF EXISTS "tasks_team_read_all" ON public.tasks;
CREATE POLICY "tasks_team_read_all" ON public.tasks
  FOR SELECT USING (public.get_my_role() = 'team');
