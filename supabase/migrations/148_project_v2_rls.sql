-- 148 — Project V2: Row Level Security
--
-- Modello: la RLS governa le SELECT. Le scritture privilegiate (manager/PM/
-- risorsa/cliente) passano da Server Action con service role + controlli
-- applicativi (coarseRole/permessi). A livello RLS solo l'admin scrive: è il
-- pattern già in uso nel progetto (INSERT chat_channels → createAdminClient).
--
-- Tre livelli di lettura:
--   • admin            → tutto
--   • team INTERNO     → tutto (come clients_team_all)
--   • team ESTERNO     → solo progetti/task dove è membro o assegnato
--   • client/guest     → solo il proprio cliente e solo visibility='client_visible'

BEGIN;

-- progetti dell'utente corrente (nuovo helper: get_my_project_ids() droppato nel reset)
CREATE OR REPLACE FUNCTION public.get_my_v2_project_ids()
RETURNS UUID[] AS $$
  SELECT ARRAY(
    SELECT id FROM public.projects WHERE manager_id = auth.uid()
    UNION
    SELECT project_id FROM public.project_members WHERE profile_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ── abilita RLS su tutte le tabelle V2 ──────────────────────────────────────
ALTER TABLE public.service_catalog          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_templates        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_template_nodes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_workstreams      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.milestones               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_task_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_assignees           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_comments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_checklist_items     ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════════════
-- CATALOGO e TEMPLATE — staff legge, admin scrive (super_admin-only in app layer)
-- ════════════════════════════════════════════════════════════════════════════
CREATE POLICY service_catalog_admin_all ON public.service_catalog
  FOR ALL USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');
CREATE POLICY service_catalog_staff_read ON public.service_catalog
  FOR SELECT USING (public.is_staff());

CREATE POLICY project_templates_admin_all ON public.project_templates
  FOR ALL USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');
CREATE POLICY project_templates_staff_read ON public.project_templates
  FOR SELECT USING (public.is_staff());

CREATE POLICY ptn_admin_all ON public.project_template_nodes
  FOR ALL USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');
CREATE POLICY ptn_staff_read ON public.project_template_nodes
  FOR SELECT USING (public.is_staff());

-- ════════════════════════════════════════════════════════════════════════════
-- PROJECTS
-- ════════════════════════════════════════════════════════════════════════════
CREATE POLICY projects_admin_all ON public.projects
  FOR ALL USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');
CREATE POLICY projects_team_internal_read ON public.projects
  FOR SELECT USING (public.get_my_role() = 'team' AND NOT public.is_external_resource());
CREATE POLICY projects_team_external_read ON public.projects
  FOR SELECT USING (public.get_my_role() = 'team' AND public.is_external_resource()
                    AND id = ANY (public.get_my_v2_project_ids()));
CREATE POLICY projects_client_read ON public.projects
  FOR SELECT USING (public.get_my_role() IN ('client','guest')
                    AND visibility = 'client_visible'
                    AND client_id = public.get_my_client_id_as_client());

-- ════════════════════════════════════════════════════════════════════════════
-- PROJECT_MEMBERS
-- ════════════════════════════════════════════════════════════════════════════
CREATE POLICY pm_admin_all ON public.project_members
  FOR ALL USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');
CREATE POLICY pm_staff_read ON public.project_members
  FOR SELECT USING (public.get_my_role() = 'team'
                    AND (NOT public.is_external_resource()
                         OR project_id = ANY (public.get_my_v2_project_ids())));

-- ════════════════════════════════════════════════════════════════════════════
-- PROJECT_WORKSTREAMS
-- ════════════════════════════════════════════════════════════════════════════
CREATE POLICY ws_admin_all ON public.project_workstreams
  FOR ALL USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');
CREATE POLICY ws_team_internal_read ON public.project_workstreams
  FOR SELECT USING (public.get_my_role() = 'team' AND NOT public.is_external_resource());
CREATE POLICY ws_team_external_read ON public.project_workstreams
  FOR SELECT USING (public.get_my_role() = 'team' AND public.is_external_resource()
                    AND project_id = ANY (public.get_my_v2_project_ids()));
CREATE POLICY ws_client_read ON public.project_workstreams
  FOR SELECT USING (public.get_my_role() IN ('client','guest')
                    AND visibility = 'client_visible'
                    AND EXISTS (SELECT 1 FROM public.projects p
                                WHERE p.id = project_id
                                  AND p.client_id = public.get_my_client_id_as_client()));

-- ════════════════════════════════════════════════════════════════════════════
-- MILESTONES
-- ════════════════════════════════════════════════════════════════════════════
CREATE POLICY ms_admin_all ON public.milestones
  FOR ALL USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');
CREATE POLICY ms_team_internal_read ON public.milestones
  FOR SELECT USING (public.get_my_role() = 'team' AND NOT public.is_external_resource());
CREATE POLICY ms_team_external_read ON public.milestones
  FOR SELECT USING (public.get_my_role() = 'team' AND public.is_external_resource()
                    AND project_id = ANY (public.get_my_v2_project_ids()));
CREATE POLICY ms_client_read ON public.milestones
  FOR SELECT USING (public.get_my_role() IN ('client','guest')
                    AND visibility = 'client_visible'
                    AND EXISTS (SELECT 1 FROM public.projects p
                                WHERE p.id = project_id
                                  AND p.client_id = public.get_my_client_id_as_client()));

-- ════════════════════════════════════════════════════════════════════════════
-- RECURRING_TASK_TEMPLATES — nessun accesso client
-- ════════════════════════════════════════════════════════════════════════════
CREATE POLICY rtt_admin_all ON public.recurring_task_templates
  FOR ALL USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');
CREATE POLICY rtt_team_internal_read ON public.recurring_task_templates
  FOR SELECT USING (public.get_my_role() = 'team' AND NOT public.is_external_resource());
CREATE POLICY rtt_team_external_read ON public.recurring_task_templates
  FOR SELECT USING (public.get_my_role() = 'team' AND public.is_external_resource()
                    AND project_id = ANY (public.get_my_v2_project_ids()));

-- ════════════════════════════════════════════════════════════════════════════
-- TASKS  (client_id diretto; include Ad Hoc)
-- ════════════════════════════════════════════════════════════════════════════
CREATE POLICY tasks_admin_all ON public.tasks
  FOR ALL USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');
CREATE POLICY tasks_team_internal_read ON public.tasks
  FOR SELECT USING (public.get_my_role() = 'team' AND NOT public.is_external_resource());
CREATE POLICY tasks_team_external_read ON public.tasks
  FOR SELECT USING (public.get_my_role() = 'team' AND public.is_external_resource()
                    AND (project_id = ANY (public.get_my_v2_project_ids())
                         OR id IN (SELECT task_id FROM public.task_assignees WHERE profile_id = auth.uid())));
CREATE POLICY tasks_client_read ON public.tasks
  FOR SELECT USING (public.get_my_role() IN ('client','guest')
                    AND visibility = 'client_visible'
                    AND client_id = public.get_my_client_id_as_client());

-- ════════════════════════════════════════════════════════════════════════════
-- TASK_ASSIGNEES / TASK_COMMENTS / TASK_CHECKLIST — allineate al task padre
-- ════════════════════════════════════════════════════════════════════════════
CREATE POLICY ta_admin_all ON public.task_assignees
  FOR ALL USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');
CREATE POLICY ta_staff_read ON public.task_assignees
  FOR SELECT USING (public.is_staff());

CREATE POLICY tc_admin_all ON public.task_comments
  FOR ALL USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');
CREATE POLICY tc_staff_read ON public.task_comments
  FOR SELECT USING (public.is_staff());
CREATE POLICY tc_client_read ON public.task_comments
  FOR SELECT USING (public.get_my_role() IN ('client','guest')
                    AND visibility = 'client_visible'
                    AND EXISTS (SELECT 1 FROM public.tasks t
                                WHERE t.id = task_id
                                  AND t.visibility = 'client_visible'
                                  AND t.client_id = public.get_my_client_id_as_client()));

CREATE POLICY tci_admin_all ON public.task_checklist_items
  FOR ALL USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');
CREATE POLICY tci_staff_read ON public.task_checklist_items
  FOR SELECT USING (public.is_staff());

COMMIT;

-- verifica: policy create per tabella V2
SELECT tablename, count(*) AS policies
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN (
  'service_catalog','project_templates','project_template_nodes','projects',
  'project_members','project_workstreams','milestones','recurring_task_templates',
  'tasks','task_assignees','task_comments','task_checklist_items'
) GROUP BY tablename ORDER BY tablename;
