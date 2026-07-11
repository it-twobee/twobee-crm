-- SEC-01 — Chiusura falle RLS `USING (true)`.
--
-- Le policy RLS sono OR-permissive: una policy `USING(true)` lasciata accanto a
-- una stretta continua a concedere accesso. Perciò DROPpiamo per nome esatto le
-- policy lasche PRIMA di creare quelle corrette.
--
-- Modello:
--   • Tabelle interne (client_interactions, client_kpi_config, task_dependencies)
--     → solo staff (admin/team) via is_staff().
--   • Tabelle viste anche dal cliente (project_appointments, project_comments)
--     → staff pieno; il cliente legge SOLO i propri progetti (get_my_client_ids()).
--
-- Helper già esistenti (001): is_staff(), get_my_client_ids().
-- Migration additiva e reversibile (solo policy).

-- ─── client_interactions → staff only ────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can do everything on client_interactions" ON public.client_interactions;
DROP POLICY IF EXISTS client_interactions_staff ON public.client_interactions;
CREATE POLICY client_interactions_staff ON public.client_interactions
  FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());

-- ─── client_kpi_config → staff only ──────────────────────────────────────────
DROP POLICY IF EXISTS "auth users" ON public.client_kpi_config;
DROP POLICY IF EXISTS client_kpi_config_staff ON public.client_kpi_config;
CREATE POLICY client_kpi_config_staff ON public.client_kpi_config
  FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());

-- ─── task_dependencies → staff only ──────────────────────────────────────────
DROP POLICY IF EXISTS "auth users" ON public.task_dependencies;
DROP POLICY IF EXISTS task_dependencies_staff ON public.task_dependencies;
CREATE POLICY task_dependencies_staff ON public.task_dependencies
  FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());

-- ─── project_appointments → staff pieno + cliente legge i propri ─────────────
DROP POLICY IF EXISTS "auth users" ON public.project_appointments;
DROP POLICY IF EXISTS project_appointments_staff ON public.project_appointments;
DROP POLICY IF EXISTS project_appointments_client_read ON public.project_appointments;
CREATE POLICY project_appointments_staff ON public.project_appointments
  FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY project_appointments_client_read ON public.project_appointments
  FOR SELECT USING (client_id = ANY (public.get_my_client_ids()));

-- ─── project_comments → staff pieno + cliente legge i propri progetti ────────
DROP POLICY IF EXISTS "auth users" ON public.project_comments;
DROP POLICY IF EXISTS project_comments_staff ON public.project_comments;
DROP POLICY IF EXISTS project_comments_client_read ON public.project_comments;
CREATE POLICY project_comments_staff ON public.project_comments
  FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY project_comments_client_read ON public.project_comments
  FOR SELECT USING (
    project_id IN (
      SELECT id FROM public.projects WHERE client_id = ANY (public.get_my_client_ids())
    )
  );

-- NB: message_reactions (029, SELECT USING true) resta invariata: basso rischio
-- (solo reazioni emoji). Da valutare in un giro successivo se scoparla ai membri
-- del canale.
