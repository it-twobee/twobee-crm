-- tasks.assigned_to: colonna usata nelle query dashboard per filtro junior
-- non presente in nessuna migration precedente → aggiunta idempotente
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Indice su assigned_to: ogni caricamento dashboard filtra tasks per utente corrente
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to
  ON public.tasks(assigned_to)
  WHERE assigned_to IS NOT NULL;

-- Indice composito (status, due_date): le query tasks usano sempre neq(status) + range(due_date)
-- più efficiente dei due indici separati per questa combinazione
CREATE INDEX IF NOT EXISTS idx_tasks_status_due_date
  ON public.tasks(status, due_date)
  WHERE due_date IS NOT NULL;

-- channel_members(profile_id): query eseguita ad ogni caricamento per TUTTI gli utenti
-- nessun indice esistente → alto impatto
CREATE INDEX IF NOT EXISTS idx_channel_members_profile
  ON public.channel_members(profile_id);

-- projects(status): filtro eq('status','attivo') nel widget Progetti
CREATE INDEX IF NOT EXISTS idx_projects_status
  ON public.projects(status);

-- invoices composito: query revenue chart usa invoice_type + status + gte(month)
CREATE INDEX IF NOT EXISTS idx_invoices_type_status_month
  ON public.invoices(invoice_type, status, month DESC);

-- decisions(status, created_at): widget decisioni usa neq(status) + order(created_at)
CREATE INDEX IF NOT EXISTS idx_decisions_status_created
  ON public.decisions(status, created_at DESC);

-- tickets(status, priority): alert urgenti filtra per status IN + priority = 'urgente'
CREATE INDEX IF NOT EXISTS idx_tickets_status_priority
  ON public.tickets(status, priority);

-- client_kpis(month): KPI snapshot usa gte(month) senza client_id fisso
-- l'indice esistente idx_kpis_client_month non copre range solo su month
CREATE INDEX IF NOT EXISTS idx_client_kpis_month
  ON public.client_kpis(month DESC);

-- user_client_assignments: lookup per utenti non-admin (fase 2 del dashboard)
CREATE INDEX IF NOT EXISTS idx_user_client_assignments_user
  ON public.user_client_assignments(user_id);
