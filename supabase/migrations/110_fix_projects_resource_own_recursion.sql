-- 110 — Fix ricorsione infinita RLS su `projects`.
--
-- La policy `projects_resource_own` (introdotta in 068) usava una sottoquery
-- INLINE su `tasks`:
--     id IN (SELECT project_id FROM tasks WHERE assignee_id = auth.uid())
-- Ma le policy RLS di `tasks` rimandano a loro volta a `projects`
-- (tasks_client / tasks_team_read_write) → ciclo projects → tasks → projects →
-- "infinite recursion detected in policy for relation projects". Qualsiasi query
-- che espande la RLS di projects (es. la sottoquery di `clients_external` sulla
-- lista clienti) andava in ERRORE → l'app riceveva data=null → LISTA VUOTA.
--
-- Fix: usare la funzione SECURITY DEFINER get_my_project_ids() (che già include i
-- progetti dove sono assegnato via task o manager) al posto della sottoquery inline.
-- Definer = non applica la RLS di tasks/projects → niente ricorsione.
-- Idempotente.

DROP POLICY IF EXISTS projects_resource_own ON public.projects;
CREATE POLICY projects_resource_own ON public.projects
  FOR SELECT USING (id = ANY (public.get_my_project_ids()));
