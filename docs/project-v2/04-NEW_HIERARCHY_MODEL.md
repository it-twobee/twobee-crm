# 04 — Modello della nuova gerarchia

```
Cliente → Progetto → Workstream → Milestone → Task
```

## Decisione 1 — Il Workstream: rinominare `project_phases`

**Raccomandazione: rinominare ed estendere `project_phases` → `project_workstreams`.**

Perché non una tabella nuova:
- `project_phases` ha già `project_id`, `name`, `position`, `start/end_date`,
  `owner_id`, `status`, `requires_client_approval`, `deliverables`. È il 70% del §5.
- La sua semantica dichiarata nella 134 è già quella del Workstream
  (*"lo sprint è temporale, la fase è logica"*).
- Contiene **5 righe su un solo progetto**, e **0 task** puntano a `phase_id`:
  il rename non ha costo di dati.

Due tabelle con lo stesso significato e nomi diversi sarebbero il vero danno.

Da aggiungere: `description`, `workstream_type`, `priority`, `visibility`,
`updated_at`. `key` esiste già e serve da riferimento al template.

`tasks.phase_id` → rinominato `workstream_id` (0 righe da migrare).

## Decisione 2 — Le Milestone: tabella dedicata

**Raccomandazione: tabella nuova `workstream_milestones`. Nessuna retrocompatibilità da difendere.**

Il brief (§7) chiede di motivare fra tre opzioni:

1. *Mantenere le milestone in `tasks` con un flag* — è l'unica opzione che avrebbe
   avuto senso con dati esistenti. **`is_milestone = true` ha 0 righe.** Non c'è
   retrocompatibilità da preservare: il flag non protegge niente.
2. *Tabella dedicata* — ✅ **scelta**. Una milestone ha campi che una task non ha
   e non deve avere: `expected_date` vs `actual_date`, `approval_required`,
   `completion_criteria`, `milestone_type`. Metterli su `tasks` significa 6
   colonne nulle su ogni task operativa e un `WHERE is_milestone = false`
   dimenticato da qualche parte che fa comparire le milestone nelle liste task.
3. *Migrazione progressiva* — costo senza beneficio: non c'è niente da migrare.

Il flag `tasks.is_milestone` resta in colonna (non lo droppiamo ora) ma smette di
essere scritto e sparisce dalla UI.

## Decisione 3 — Le Subtask

`parent_task_id` ha **0 righe**. Resta in schema come funzionalità accessoria
(§1: "task figlie mantenute ma non livello obbligatorio"), sparisce dalla
navigazione. Il livello operativo dentro la task diventa **checklist**
(`task_checklist_items`, da creare) + `completion_criteria`.

## Obbligatorietà

Proposta, da confermare (domande D13/D14):
- Task **deve** avere `project_id` e `workstream_id`.
- Task **può** avere `milestone_id` nullo → cade in un Workstream "operativo".
- Ogni progetto nasce con almeno 1 Workstream (il wizard lo garantisce).
- Le task ad hoc cliente (già esistenti, 128) vanno in un Workstream speciale
  auto-creato per progetto/cliente.
