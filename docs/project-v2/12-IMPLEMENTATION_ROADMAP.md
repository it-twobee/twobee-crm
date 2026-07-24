# 12 — Implementation Roadmap

Prerequisiti (bonifica, doc 02 §E): scegliere branch (`feat/project-v2` da qui),
chiudere il working tree, fotografare RLS `clients` in SQL. Poi:

## Fase 0 — Fondamenta DB (migration 147+)
- `service_catalog` v2 + seed tassonomia (doc 04).
- `projects`, `project_workstreams`, `milestones`, `tasks`, `task_assignees`,
  `task_comments`, `task_checklist_items`, `recurring_task_templates`,
  `project_templates` + nodes.
- CHECK gerarchia + Ad Hoc, `UNIQUE(recurring_template_id, generated_for_date)`.
- Trigger: `set_updated_at`, `ensure_system_milestone`, `sync_task_primary_assignee`.
- RLS (doc 10). Tipi TypeScript in `lib/types/database.ts` (+ ripulire orfani).
- **Milestone**: build+typecheck verdi, nessun dato.

## Fase 1 — Service Catalog & Template
- CRUD catalogo + `project_templates` (config super_admin).
- Seed template MVP: Lead Generation ed E-commerce (doc 16/17), poi gli altri.

## Fase 2 — Wizard progetto
- `<ProjectWizard>` (9 step) + `create_project_from_template()` atomica.
- Entry point: `/progetti` e `/clienti/[id]/progetti`.

## Fase 3 — Dominio progetto (Admin)
- Pagina progetto: header + tab Panoramica/Sottoprogetti/Milestone/Task/Calendario/
  Aggiornamenti/Documenti (+ Customer Care/KPI se pronti).
- Sezione globale `/progetti` (lista/board/timeline/calendario + filtri).
- Sezione **Task Ad Hoc** nel cliente.

## Fase 4 — Task management
- **Drawer task unico** (doc 14).
- Viste lista/board/timeline/calendario + filtri + drag&drop.
- Commenti, menzioni, checklist, link documenti, notifiche, activity log.
- Motore ricorrenze + `pg_cron` (doc 08).

## Fase 5 — Workspace
- Riattiva `Le mie attività` + `Progetti`; stesso drawer, RLS scoped.
- Ricerca globale reindicizzata su progetti/task.

## Fase 6 — Portale Cliente (nuovo)
- Layout + middleware + route `/portale`; panoramica, progetti, milestone visibili,
  task cliente, aggiornamenti, documenti, Customer Care, KPI.
- Ridisegno visibilità cliente + approvazioni milestone.

## Fase 7 — Stabilizzazione
- Test RLS per ruolo (admin/team/PM/risorsa/client), test URL diretti, API,
  Server Action, regressione. Build, typecheck, responsive, performance.

## Fase 8 — Pilota Seven
- Creare il primo progetto reale su **Seven** end-to-end (wizard → sottoprogetti →
  milestone → task → ricorrenze → workspace → cliente). Validare prima del rollout.

## Vincoli permanenti
- **No Sprint. No Workload/Portfolio** in queste fasi (campi predisposti per
  Capacity futuro). Dominio task **unico**. Nessuna tabella duplicata per portale.
