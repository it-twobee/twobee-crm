# 07 — CTA e flusso di creazione

## Stato del wizard

`components/projects/ProjectWizard.tsx` — 553 righe, **7 step (0–6)**:
cliente → servizio → configurazione → economia → team → fasi → anteprima.
Passa da `create_project_from_wizard` (atomica ✅).

Rispetto ai 10 step del §12 mancano:
- **Step 6 Workstream** — oggi c'è uno step "fasi" che scrive `project_phases`
  ma senza owner, date, priorità, riordino;
- **Step 7 Milestone** — assente del tutto;
- **Step 8 Task** — assente (le task nascono solo dalle routine);
- **Step 9 Anteprima** — presente ma mostra solo il progetto, non l'albero, e non
  fa nessuno dei controlli richiesti (dati mancanti, date incoerenti, sovraccarico,
  duplicazioni, progetti simili attivi).

## Gli altri 10 punti di creazione

Vedi `03-DEPENDENCY_MAP.md`. Nessuno chiede il servizio; `NewClientModal` crea
progetti senza chiedere nulla. Vanno ricondotti tutti al wizard, **mantenendo il
punto d'ingresso** e passando un contesto precompilato (`clientId`, `projectId`,
`workstreamId`).

## Matrice CTA richiesta (§13)

| Contesto | Crea |
|---|---|
| Cliente | Progetto · Attività ad hoc |
| Progetto | Workstream · Milestone · Task · Ricorrenza |
| Workstream | Milestone · Task · Ricorrenza |
| Milestone | Task · Task ricorrente |
| Task | Duplica · Task collegata · Checklist · Richiedi supporto · Apri progetto/workstream/milestone |

Regola: dal cliente **non** si crea una Task o una Milestone senza scegliere
prima Progetto e Workstream. Oggi `ContextualCreate.tsx` e
`WorkspaceQuickCreate.tsx` lo permettono → vanno vincolati.

"Richiedi supporto" esiste già (`tasks.origin_task_id`/`requested_by`, migration 101).
"Attività ad hoc" esiste già (migration 128).
