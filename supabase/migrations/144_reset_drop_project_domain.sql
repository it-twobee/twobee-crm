-- 144 — RESET: demolizione del dominio "flusso progetto"
--
-- DISTRUTTIVA E NON IDEMPOTENTE NEL SENSO DEI DATI: droppa tabelle con dati.
-- Backup JSON in supabase/backup/2026-07-22-pre-reset/ (commit cdffa88).
-- Codice archiviato sul branch archive/project-v2-wip.
--
-- Resta in piedi: clients (+ satelliti), chat, HR/documenti, customer care,
-- profiles/ruoli. Tutto il resto si ricostruisce iterativamente sopra il
-- nuovo flusso progetto.
--
-- CASCADE è voluto: porta via FK, viste e policy dipendenti. Le due viste
-- che muoiono qui (data_quality_report, projects_missing_agreement) leggevano
-- projects/tasks e non hanno senso senza.

BEGIN;

-- ── foglie prima, per rendere leggibile l'errore se qualcosa manca ──────────
DROP TABLE IF EXISTS public.task_assignees          CASCADE;
DROP TABLE IF EXISTS public.task_checklist_items    CASCADE;
DROP TABLE IF EXISTS public.task_comments           CASCADE;
DROP TABLE IF EXISTS public.task_dependencies       CASCADE;
DROP TABLE IF EXISTS public.task_templates          CASCADE;
DROP TABLE IF EXISTS public.task_time_logs          CASCADE;
DROP TABLE IF EXISTS public.task_block_reports      CASCADE;
DROP TABLE IF EXISTS public.task_deletion_requests  CASCADE;
DROP TABLE IF EXISTS public.time_entries            CASCADE;

DROP TABLE IF EXISTS public.workstream_milestones     CASCADE;
DROP TABLE IF EXISTS public.recurring_task_templates  CASCADE;
DROP TABLE IF EXISTS public.growth_initiatives        CASCADE;
DROP TABLE IF EXISTS public.project_workstreams       CASCADE;
DROP TABLE IF EXISTS public.sprints                   CASCADE;

DROP TABLE IF EXISTS public.project_appointments  CASCADE;
DROP TABLE IF EXISTS public.project_comments      CASCADE;
DROP TABLE IF EXISTS public.project_cost_entries  CASCADE;
DROP TABLE IF EXISTS public.meeting_notes         CASCADE;
DROP TABLE IF EXISTS public.approvals             CASCADE;

DROP TABLE IF EXISTS public.portfolio_projects  CASCADE;
DROP TABLE IF EXISTS public.portfolio_clients   CASCADE;
DROP TABLE IF EXISTS public.portfolios          CASCADE;

DROP TABLE IF EXISTS public.service_catalog  CASCADE;

-- ── i due tronchi ───────────────────────────────────────────────────────────
DROP TABLE IF EXISTS public.tasks     CASCADE;
DROP TABLE IF EXISTS public.projects  CASCADE;

COMMIT;

-- verifica: deve restituire 0 righe
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'projects','tasks','sprints','project_workstreams','workstream_milestones',
    'recurring_task_templates','service_catalog','task_assignees',
    'task_checklist_items','task_comments','task_dependencies','task_templates',
    'task_time_logs','task_block_reports','task_deletion_requests','time_entries',
    'project_appointments','project_comments','project_cost_entries','portfolios',
    'portfolio_clients','portfolio_projects','growth_initiatives','approvals',
    'meeting_notes'
  );
