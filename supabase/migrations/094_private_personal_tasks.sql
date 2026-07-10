-- Task personali/private: una task senza progetto (project_id IS NULL) è un
-- todo personale del suo assegnatario e NON deve comparire ai colleghi.
--
-- La 092 aveva aperto in lettura TUTTE le task ai ruoli team. Qui restringiamo:
-- il team vede tutte le task DI PROGETTO, ma le task senza progetto restano
-- visibili solo al proprietario (via tasks_assignee_self_read) e all'admin
-- (tasks_admin, che mantiene la supervisione). Nessuna nuova colonna: "privata"
-- = "senza progetto".

DROP POLICY IF EXISTS "tasks_team_read_all" ON public.tasks;
CREATE POLICY "tasks_team_read_all" ON public.tasks
  FOR SELECT USING (
    public.get_my_role() = 'team' AND project_id IS NOT NULL
  );
