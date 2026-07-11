# WORKSPACE — Piano Fase 3: Workload + Portfolio + Dashboard strategica

> Decisioni già prese: D5 capacità (40h default + campo part-time), D6 effort spalmato
> su intervallo (serve `tasks.start_date`), D7 assenze solo approvate. Include §9, §10, §6.4.

## Slice (ordine per rischio/dipendenze)

### 3a — Rinomina "Progetti attivi" → Workload 🟢
Il Workload diventa la vista centrale dei progetti. `/workspace/progetti` (lista) →
**redirect** a `/workspace/workload` (WorkloadClient ha già la vista Progetti). Il dettaglio
`/workspace/progetti/[projectId]` **resta**. Sidebar: la voce viene rinominata/ripuntata
(via migration 103, sezione workspace_sections). Non-distruttivo: `WorkspaceProjectsClient` resta nel repo.

### 3b — Migration 103 + intensità reale 🟠
Migration: `tasks.start_date` (D6), `resource_profiles.weekly_capacity_hours` (D5, default 40),
UPDATE workspace_sections (rinomina voce). `lib/workload.ts`/`workload-data.ts`: leggere
`sprints` + `team_leaves` (approvate) + start_date; calcolo intensità per finestre 7/14/30/60/90;
effort spalmato start→due; capacità per risorsa (non 40h fissi); **warning** dove mancano stime
(niente default 4h spacciato per reale).

### 3c — Timeline multi-scala + hover ricco 🟠
WorkloadClient TimelineView: scale giorno/settimana/mese/anno/sprint/milestone; hover con
data/intervallo/progetto/sprint-milestone/owner/effort/stato. Estrarre un `<TimelineTooltip>`/hook
condiviso da riusare nel Gantt del progetto (Fase 4 §15.2). Milestone come cittadini di prima classe.

### 3d — AI Planning (propone, non applica) 🟠
Endpoint `/api/ai/workload-plan` (Groq) che analizza carichi/scadenze/conflitti e PROPONE
(anticipa/posticipa/riassegna/split). Flusso: analizza→propone→utente conferma→sistema applica
(via `pmUpdateTask`/`setTaskAssignees`). Mostra fonti/dati usati. NIENTE modifica automatica.

### 3e — Portfolio: filtro tipologia (§10) 🟢
`WorkspacePortfolioClient`: filtro per `projects.project_type`/`project_kind` (campo reale, non hardcoded).

### 3f — Dashboard: aggregati strategici (§6.4) 🟢
Widget MRR macro **aggregato** + fatturato totale **aggregato** (consentiti al Workspace, §3).
Somma server-side (mai per-cliente); RLS: l'aggregato non espone il dettaglio.

## Output §37
- **Migration**: `103_workload_portfolio.sql` (tasks.start_date, resource capacity, sidebar rename).
- **File**: `lib/workload.ts`, `lib/workload-data.ts`, `components/workload/WorkloadClient.tsx`,
  `WorkspacePortfolioClient.tsx`, dashboard widget aggregati, `/api/ai/workload-plan`, redirect progetti.
- **Rischi**: intensità cambia semantica delle funzioni pure (versionare); `team_leaves` RLS;
  aggregati economici devono restare SOLO aggregati (no per-cliente); AI non deve applicare da sola.
- **Rollback**: migration additiva; redirect reversibile; funzioni pure versionate.

## Nota
Nessuna domanda bloccante residua (D5/D6/D7 prese). Aggregati §6.4: l'MRR/fatturato totale è
consentito al Workspace — calcolato server-side come somma, senza esporre i valori per-cliente.
