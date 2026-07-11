-- DQ-VIEW (P2): vista read-only che aggrega i conteggi di data quality
-- (docs/audit/11-DATA_QUALITY_ISSUES.md) per il widget admin "Salute dati".
-- Additiva, non distruttiva: nessuna scrittura, solo SELECT aggregate.
-- security_invoker = true → rispetta la RLS di chi interroga (nessun bypass);
-- la pagina /dashboard è già riservata all'admin dal middleware.

CREATE OR REPLACE VIEW public.data_quality_report
WITH (security_invoker = true) AS
SELECT
  -- DQ-01: progetti attivi senza PM
  (SELECT count(*) FROM public.projects
     WHERE status = 'attivo' AND manager_id IS NULL)                    AS projects_no_pm,
  (SELECT count(*) FROM public.projects WHERE status = 'attivo')        AS projects_active,

  -- DQ-02: task attive (non milestone) senza stima ore
  (SELECT count(*) FROM public.tasks
     WHERE is_milestone = false AND status <> 'completato'
       AND estimated_hours IS NULL)                                     AS tasks_no_estimate,

  -- DQ-03: task attive senza scadenza
  (SELECT count(*) FROM public.tasks
     WHERE is_milestone = false AND status <> 'completato'
       AND due_date IS NULL)                                            AS tasks_no_due,

  -- DQ-04: task (non milestone) senza alcun assegnatario
  (SELECT count(*) FROM public.tasks t
     WHERE t.is_milestone = false AND t.assignee_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM public.task_assignees a WHERE a.task_id = t.id)) AS tasks_no_owner,

  (SELECT count(*) FROM public.tasks
     WHERE is_milestone = false AND status <> 'completato')             AS tasks_active,

  -- DQ-05: clienti senza collegamento utente (portale irraggiungibile)
  (SELECT count(*) FROM public.clients c
     WHERE NOT EXISTS (SELECT 1 FROM public.client_assignments a WHERE a.client_id = c.id)) AS clients_no_assignment,

  -- DQ-06: clienti non marcati come interni (da rivedere manualmente)
  (SELECT count(*) FROM public.clients WHERE is_internal = false)       AS clients_not_internal,

  -- DQ-07: clienti senza progetti
  (SELECT count(*) FROM public.clients c
     WHERE NOT EXISTS (SELECT 1 FROM public.projects p WHERE p.client_id = c.id)) AS clients_no_projects,

  (SELECT count(*) FROM public.clients)                                 AS clients_total,

  -- DQ-08: task attive fuori da uno sprint
  (SELECT count(*) FROM public.tasks
     WHERE sprint_id IS NULL AND is_milestone = false
       AND status <> 'completato')                                      AS tasks_no_sprint;

GRANT SELECT ON public.data_quality_report TO authenticated;
