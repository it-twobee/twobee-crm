# WORKSPACE — Piano Fase 1: Task domain condiviso

Obiettivo: UN solo dominio task (stessi campi/stati/validazione/editor) su tutte le
superfici, con scritture centralizzate e sicure. Basato su D11/D12/D16.

## 1a — Helper stati terminali ✅ FATTO
`lib/task-status.ts` (`TERMINAL/ACTIVE_TASK_STATUSES`, `isTaskDone/isTaskActive`, estendibile).
`MieAttivitaClient`: check inline sostituiti; conteggi private/operative escludono le completate (§7.1).
→ *Adozione incrementale negli altri consumer (dashboard, ProjectStatusTab, TimelineClient) quando li si tocca.*

## 1b — `<TaskDrawer>` condiviso 🔴 DA APPROVARE (il pezzo grosso)
**Cosa**: nuovo `components/tasks/TaskDrawer.tsx`, drawer laterale stile Notion, deep-link
`?task=<id>`. Compone i primitivi già esistenti (`AssigneePicker`, `SubtaskList`,
`TaskComments`, `TimeTracker`) + editor inline per stato/priorità/scadenza/stima/descrizione.
Campi §5: progetto, sprint, milestone, parent, subtask, owner+collaboratori, stato, priorità,
scadenza, ore stimate/lavorate, descrizione, documenti, commenti, visibilità, cliente/interna.

**Scritture centralizzate**: nuova server action `app/actions/tasks.ts::updateTaskFields(taskId, patch)`
con authz (assignee OR PM `projects.manager_id` OR admin) + service role, sul modello di
`workload-tasks.ts`. Gli owner sempre via `setTaskAssignees`. → chiude il bug desync
`assignee_id ↔ task_assignees` e i UPDATE silenziosamente bloccati dalla RLS.

**Capabilities per ruolo**: il drawer degrada i campi in base al ruolo (admin pieno, team
scoped, assignee self). NON esposto ai clienti (D11): il portale cliente resta read-only.

**Rollout incrementale (riduce il rischio)**:
- 1b.1 — build `TaskDrawer` + `updateTaskFields`; wire in `MieAttivitaClient` (sostituisce `TaskDetailPanel`). Verify.
- 1b.2 — wire in `ProjectPageClient` (sostituisce `TaskDetailModal`). ⚠️ monolite 2980 righe, drag-reorder + stato ottimistico: massima attenzione. Verify.
- 1b.3 — wire in `SprintMilestoneBoardSection` (+ /reparti); rimuove i modali duplicati. Verify.

**Rischi**: preservare invariante `tasks.assignee_id = primo di task_assignees`; RLS per ruolo;
non rompere il drag-reorder di ProjectPageClient; il portale cliente non deve ricevere il drawer.

## 1c — Task cliccabili ovunque → drawer (§6.1)
Rendere cliccabili le superfici oggi mute (`ProjectStatusTab`, viste Timeline/Calendario/Analitica
di MieAttivita) aprendo lo stesso `TaskDrawer`. Link progetto già coerente via `usePortalRoutes`.

## 1d — Richieste Admin→Risorsa + Richiesta supporto (§6.2/6.3, D12)
Via `tasks` + `notifications` (NO tabella dedicata). Nuovo stato `richiesta_supporto`
(ALTER additivo del CHECK di `tasks.status` + aggiornare filtri/badge/board/analitica/RLS,
usando l'helper 1a per non rompere i conteggi). `origin_task_id` per collegare la task di
supporto all'originale. All'accettazione → `da_fare` (task attiva); al rifiuto → stato chiuso.
Notifica al destinatario in dashboard.

## 1e — Unificare page duplicate
`le-mie-attivita/page.tsx` ≡ `workspace/attivita/page.tsx` → una sola con parametro portale.

## Output per §37 (a fine fase): file, migration, RLS, componenti eliminati, test per ruolo, rollback.
