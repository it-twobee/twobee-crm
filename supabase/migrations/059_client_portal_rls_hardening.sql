-- ============================================================
-- Migration 059: Hardening RLS per Portale Cliente
-- ------------------------------------------------------------
-- Prerequisito di sicurezza prima di abilitare login ruolo 'client'.
-- Molte tabelle aggiunte dopo lo schema iniziale avevano policy
-- permissive (USING(true) / auth.uid() IS NOT NULL) che renderebbero
-- i dati interni leggibili a un cliente loggato.
--
-- Strategia:
--   A) Tabelle INTERNE  → accesso solo staff (admin/team)
--   B) Tabelle del PORTALE → policy 'client' filtrata per client_id
-- ============================================================

-- Helper: true se l'utente è staff interno (admin o team)
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT public.get_my_role() IN ('admin', 'team');
$$;

-- ============================================================
-- A) TABELLE INTERNE — solo staff
-- ============================================================

-- 004 — Asana / task meta
DROP POLICY IF EXISTS "auth can manage task_comments"      ON public.task_comments;
CREATE POLICY "task_comments_staff"      ON public.task_comments      FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "auth can manage task_time_logs"     ON public.task_time_logs;
CREATE POLICY "task_time_logs_staff"     ON public.task_time_logs     FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "auth can manage task_followers"     ON public.task_followers;
CREATE POLICY "task_followers_staff"     ON public.task_followers     FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "auth can manage task_attachments"   ON public.task_attachments;
CREATE POLICY "task_attachments_staff"   ON public.task_attachments   FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());

-- 004 + 035 — task_dependencies (due policy storiche)
DROP POLICY IF EXISTS "auth can manage task_dependencies"  ON public.task_dependencies;
DROP POLICY IF EXISTS "auth users"                         ON public.task_dependencies;
CREATE POLICY "task_dependencies_staff"  ON public.task_dependencies  FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());

-- 005 / 018 — portfolio
DROP POLICY IF EXISTS "auth can manage portfolios"         ON public.portfolios;
CREATE POLICY "portfolios_staff"         ON public.portfolios         FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "auth can manage portfolio_clients"  ON public.portfolio_clients;
CREATE POLICY "portfolio_clients_staff"  ON public.portfolio_clients  FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "auth can manage portfolio_projects" ON public.portfolio_projects;
CREATE POLICY "portfolio_projects_staff" ON public.portfolio_projects FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());

-- 008 — customer care goals
DROP POLICY IF EXISTS "auth can manage client_accounts"    ON public.client_accounts;
CREATE POLICY "client_accounts_staff"    ON public.client_accounts    FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());

-- 011 — commerciale + ticketing interno
DROP POLICY IF EXISTS "deals_all"            ON public.deals;
CREATE POLICY "deals_staff"            ON public.deals            FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "deal_activities_all"  ON public.deal_activities;
CREATE POLICY "deal_activities_staff"  ON public.deal_activities  FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "quotes_all"           ON public.quotes;
CREATE POLICY "quotes_staff"           ON public.quotes           FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "task_templates_all"   ON public.task_templates;
CREATE POLICY "task_templates_staff"   ON public.task_templates   FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "tickets_all"          ON public.tickets;
CREATE POLICY "tickets_staff"          ON public.tickets          FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "ticket_messages_all"  ON public.ticket_messages;
CREATE POLICY "ticket_messages_staff"  ON public.ticket_messages  FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());

-- 012 — HR + strategia / OKR
DROP POLICY IF EXISTS "team_leaves_all"         ON public.team_leaves;
CREATE POLICY "team_leaves_staff"         ON public.team_leaves         FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "performance_reviews_all" ON public.performance_reviews;
CREATE POLICY "performance_reviews_staff" ON public.performance_reviews FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "onboarding_steps_all"    ON public.onboarding_steps;
CREATE POLICY "onboarding_steps_staff"    ON public.onboarding_steps    FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "objectives_all"          ON public.objectives;
CREATE POLICY "objectives_staff"          ON public.objectives          FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "key_results_all"         ON public.key_results;
CREATE POLICY "key_results_staff"         ON public.key_results         FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "roadmap_items_all"       ON public.roadmap_items;
CREATE POLICY "roadmap_items_staff"       ON public.roadmap_items       FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "strategic_notes_all"     ON public.strategic_notes;
CREATE POLICY "strategic_notes_staff"     ON public.strategic_notes     FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());

-- 013 — activity log
DROP POLICY IF EXISTS "activity_log_view"   ON public.activity_log;
DROP POLICY IF EXISTS "activity_log_insert" ON public.activity_log;
CREATE POLICY "activity_log_staff" ON public.activity_log FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());

-- 015 — interazioni cliente (note interne commerciali)
DROP POLICY IF EXISTS "Admins can do everything on client_interactions" ON public.client_interactions;
CREATE POLICY "client_interactions_staff" ON public.client_interactions FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());

-- 026 — note interne sul cliente
DROP POLICY IF EXISTS "client_notes_view" ON public.client_notes;
CREATE POLICY "client_notes_view_staff" ON public.client_notes FOR SELECT USING (public.is_staff());

-- 032 — config KPI
DROP POLICY IF EXISTS "auth users" ON public.client_kpi_config;
CREATE POLICY "client_kpi_config_staff" ON public.client_kpi_config FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());

-- 043 — appuntamenti progetto (gestione interna)
DROP POLICY IF EXISTS "auth users" ON public.project_appointments;
CREATE POLICY "project_appointments_staff" ON public.project_appointments FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());

-- 050 — time entries (ore lavorate team)
DROP POLICY IF EXISTS "auth can manage time_entries" ON public.time_entries;
CREATE POLICY "time_entries_staff" ON public.time_entries FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());

-- 029 — reazioni messaggi: leggibili solo nei canali di cui sei membro
DROP POLICY IF EXISTS "reactions_select" ON public.message_reactions;
CREATE POLICY "reactions_select_members" ON public.message_reactions
  FOR SELECT TO authenticated USING (
    message_id IN (
      SELECT m.id FROM public.chat_messages m
      WHERE m.channel_id IN (
        SELECT channel_id FROM public.channel_members WHERE profile_id = auth.uid()
      )
    )
  );

-- ============================================================
-- B) TABELLE DEL PORTALE — policy 'client' filtrata
-- ============================================================

-- project_comments (038): era USING(true). Chiudo e separo staff / client.
DROP POLICY IF EXISTS "auth users" ON public.project_comments;

CREATE POLICY "project_comments_staff" ON public.project_comments
  FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());

-- Il cliente legge i commenti dei suoi progetti…
CREATE POLICY "project_comments_client_read" ON public.project_comments
  FOR SELECT USING (
    public.get_my_role() IN ('client', 'guest') AND
    project_id IN (
      SELECT id FROM public.projects WHERE client_id = public.get_my_client_id_as_client()
    )
  );

-- …e può inserire i propri (marcati is_client = true).
CREATE POLICY "project_comments_client_insert" ON public.project_comments
  FOR INSERT WITH CHECK (
    public.get_my_role() = 'client' AND
    author_id = auth.uid() AND
    is_client = true AND
    project_id IN (
      SELECT id FROM public.projects WHERE client_id = public.get_my_client_id_as_client()
    )
  );

-- invoices: mancava la policy client. Solo lettura delle proprie fatture.
CREATE POLICY "invoices_client_read" ON public.invoices
  FOR SELECT USING (
    public.get_my_role() IN ('client', 'guest') AND
    client_id = public.get_my_client_id_as_client()
  );

-- tasks: il cliente vede SOLO le proprie task cliente (non quelle interne)
DROP POLICY IF EXISTS "tasks_client" ON public.tasks;
CREATE POLICY "tasks_client_read" ON public.tasks
  FOR SELECT USING (
    public.get_my_role() IN ('client', 'guest') AND
    is_client_task = true AND
    project_id IN (
      SELECT id FROM public.projects WHERE client_id = public.get_my_client_id_as_client()
    )
  );

-- …e può aggiornarne lo stato (toggle completato) delle proprie task cliente.
CREATE POLICY "tasks_client_update" ON public.tasks
  FOR UPDATE USING (
    public.get_my_role() = 'client' AND
    is_client_task = true AND
    project_id IN (
      SELECT id FROM public.projects WHERE client_id = public.get_my_client_id_as_client()
    )
  ) WITH CHECK (
    public.get_my_role() = 'client' AND
    is_client_task = true AND
    project_id IN (
      SELECT id FROM public.projects WHERE client_id = public.get_my_client_id_as_client()
    )
  );

-- chat_channels: il cliente accede ai canali 'cliente' e 'customer_care'
DROP POLICY IF EXISTS "channels_client_own" ON public.chat_channels;
CREATE POLICY "channels_client_own" ON public.chat_channels
  FOR SELECT USING (
    public.get_my_role() = 'client' AND
    type IN ('cliente', 'customer_care') AND
    client_id = public.get_my_client_id_as_client()
  );

-- ============================================================
-- NOTE
-- I messaggi chat (chat_messages) restano governati da
-- "messages_members": il cliente deve essere channel_members
-- del canale customer_care. L'aggiunta come membro avviene
-- nella server action di invito (vedi app/actions/invite-client.ts).
-- ============================================================
