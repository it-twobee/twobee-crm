# 05 — Gerarchia Cliente → Progetto → Sprint → Milestone → Task → Subtask

> Verifica strutturale (FK) + reale (dati). Verdetto per livello: la struttura c'è,
> ma **Sprint e Subtask sono quasi inutilizzati** e mancano PM/stime/scadenze.

## Schema (esiste tutto)
```
clients.id ──< projects.client_id
projects.id ──< sprints.project_id
projects.id ──< tasks.project_id
sprints.id ──< tasks.sprint_id            (opzionale)
tasks.id ──< tasks.parent_task_id          (subtask, ricorsivo)
tasks.is_milestone = true                  (milestone = task speciale)
tasks.assignee_id → profiles.id            (owner primario)
task_assignees(task_id, profile_id)        (multi-owner, is_primary_owner)
```

## Verifica per livello (dati reali)

### Cliente ✅ struttura / ⚠️ dati
- Un cliente può avere N progetti (FK ok). Nessun progetto orfano (`client_id` sempre valido).
- **9/12 clienti senza progetti** — normale in seed, ma il portfolio/dashboard
  mostreranno molti clienti "vuoti".
- **0 clienti `is_internal`** — i clienti interni (TwoBee stessa) non sono marcati,
  quindi entrano nelle statistiche. → data quality.

### Progetto ✅ struttura / 🔴 governance
- Tutti hanno `client_id`, `status='attivo'`, `project_kind`.
- **0/4 hanno `manager_id` (PM)** → 🔴 nessun responsabile designato. Conseguenze:
  editing Workload nel workspace disabilitato, nessuna accountability.
- Membri progetto: non c'è una tabella `project_members` esplicita; l'appartenenza
  si deduce da `task_assignees`. → valutare una membership esplicita.

### Sprint ⚠️ sotto-utilizzato
- 4 sprint, tutti con date e con task collegate (nessuno vuoto).
- **Ma 37/38 task non hanno `sprint_id`**: gli sprint esistono ma la stragrande
  maggioranza delle task vive fuori da uno sprint. La pianificazione per sprint
  **non è la pratica reale**. → decidere: promuovere gli sprint o semplificarli.

### Milestone 🟢
- 8 task con `is_milestone`. Rappresentate nella board sprint/milestone
  (`SprintMilestoneBoardSection`). Coerenti.
- Da verificare: una milestone aggrega davvero le sue task nel progresso? (la UI
  le mostra come nodi, l'aggregazione progresso è per progetto, non per milestone).

### Task ✅ struttura / 🔴 qualità
- 46 task, FK progetto sempre valida. 9 `is_client_task`.
- **38/38 senza `estimated_hours`** → Workload stima a 4h default.
- **29/38 senza `due_date`** → non collocabili in timeline/calendario.
- **21/38 senza owner** (né `assignee_id` né bridge) → task "di nessuno".
- 3 task senza `project_id` → sono le **task personali/private** (migration 094,
  `tasks_team_read_all` richiede `project_id IS NOT NULL`): intenzionale.
- Multi-assegnatario: persistito in `task_assignees` (3 righe), sincronizzato con
  `assignee_id` via `setTaskAssignees`. ✅ Reale, non solo UI.

### Subtask 🔴 inutilizzato
- **0/46 task hanno `parent_task_id`**. Il supporto ricorsivo esiste nello schema e
  la UI ha `SubtaskList`/`depth`, ma **nessuna subtask è mai stata creata**.
- Da verificare in UI: creare una subtask, completarla, e controllare se aggiorna
  il progresso del padre (probabilmente non aggregato oggi).

## Ruoli sulla task (chi fa cosa) — mappatura attuale
| Ruolo funzionale | Dove vive | Stato |
|---|---|---|
| Owner primario | `tasks.assignee_id` / `task_assignees.is_primary_owner` | ✅ |
| Collaboratori | `task_assignees.role='collaborator'` | ✅ (schema pronto) |
| Reviewer | `task_assignees.role='reviewer'` | ⚠️ schema c'è, UI no |
| PM di progetto | `projects.manager_id` | 🔴 0 popolati |
| Follower | `task_followers` | ⚠️ tabella c'è, uso? |
| Chi può eliminare | admin, o richiesta via `task_deletion_requests` | ✅ flusso esiste |

## Conclusione
La gerarchia è **completa a schema** ma **poco valorizzata a dato**. I due gap che
tolgono valore operativo sono: **(1) nessun PM sui progetti**, **(2) nessuna stima
ore + molte task senza scadenza/owner**. Sprint e Subtask sono opzionali e oggi
inerti: decisione di prodotto se spingerli o nasconderli. → azioni in `11` e `13`.
