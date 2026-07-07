-- ─── Portale Risorsa (Fase 2 MVP): l'utente vede/aggiorna i propri task ───────
-- Additiva e sicura: allarga SOLO l'accesso ai task di cui sei assignee.
-- Non restringe nulla, non tocca le policy esistenti (tasks_admin, _team, _client).
-- Necessaria perché tasks_team_read_write limita ai client assegnati via
-- client_assignments: senza questa, un membro potrebbe non vedere un proprio
-- task su un cliente non suo.

DROP POLICY IF EXISTS "tasks_assignee_self_read" ON public.tasks;
CREATE POLICY "tasks_assignee_self_read" ON public.tasks
  FOR SELECT USING (assignee_id = auth.uid());

DROP POLICY IF EXISTS "tasks_assignee_self_update" ON public.tasks;
CREATE POLICY "tasks_assignee_self_update" ON public.tasks
  FOR UPDATE USING (assignee_id = auth.uid())
  WITH CHECK (assignee_id = auth.uid());
