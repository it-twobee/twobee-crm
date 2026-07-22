# 03 — Mappa delle dipendenze

## Sprint — dipendenze applicative

**Dati: 0 righe.** Il costo è tutto nel codice.

`sprint_id` compare in **12 file**:

| File | Occorrenze |
|---|---|
| `components/projects/ProjectPageClient.tsx` | 10 |
| `components/workspace/WorkspaceQuickCreate.tsx` | 9 |
| `components/reparti/BoardTeam.tsx` | 8 |
| `app/actions/workspace-create.ts` | 8 |
| `components/shared/ContextualCreate.tsx` | 7 |
| `components/clients/tabs/ProjectStatusTab.tsx` | 6 |
| `components/reparti/DeptOperativity.tsx` | 3 |
| `components/projects/tabs/RiunioniTab.tsx` | 3 |
| `components/projects/SprintMilestoneBoardSection.tsx` | 3 |
| `lib/types/database.ts` | 1 |
| `app/actions/tasks.ts` | 1 |
| `app/actions/project-wizard.ts` | 1 |

La parola "sprint" compare in **58 file** (include `sprint_current`, API AI,
label UI). Da eliminare o riscrivere per intero:
`app/actions/workload-sprints.ts`, `app/api/ai/sprint-plan/`,
`app/api/ai/sprint-report/`, `components/projects/SprintMilestoneBoardSection.tsx`.

Nessuna RLS filtra su `sprint_id`. Nessuna VIEW lo usa.

## Punti di creazione progetto — 11

Il brief (§12) chiede un flusso unico. Oggi ce ne sono **11**:

`app/actions/project-wizard.ts` · `app/actions/workspace-create.ts` ·
`components/clients/NewClientModal.tsx` · `components/clients/tabs/PanoramicaTab.tsx` ·
`components/clients/tabs/ProjectStatusTab.tsx` · `components/operativa/OperativaClient.tsx` ·
`components/progetti/ProgettiClient.tsx` · `components/projects/ProjectWizard.tsx` ·
`components/reparti/CreateProjectModal.tsx` · `components/shared/ContextualCreate.tsx` ·
`components/workspace/WorkspaceQuickCreate.tsx`

Solo `ProjectWizard.tsx` passa da `create_project_from_wizard`. Gli altri fanno
`insert` diretta e **non chiedono il servizio**: ogni progetto creato da lì nasce
senza classificazione.

## Rischi di regressione

| # | Rischio | Note |
|---|---|---|
| 1 | `ProjectPageClient.tsx` (~3000 righe) tocca sprint, milestone e task insieme | va spezzato **prima** di aggiungere il Workstream |
| 2 | Chiudere gli altri 10 punti di creazione rompe abitudini quotidiane | il wizard deve accettare un contesto precompilato, non sostituire il punto d'ingresso |
| 3 | `projects.sprint_current` letto da widget dashboard | lasciarlo, smettere di scriverlo |
| 4 | RLS partner/risorsa esterna non testate con utente reale | il service role maschera i buchi |
