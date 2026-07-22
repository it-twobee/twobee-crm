# 01 — Snapshot dei progetti attivi

Interrogazione diretta del DB di produzione (service role), 2026-07-20.

## Il dato che cambia tutto

| Tabella | Righe |
|---|---|
| `clients` | 12 |
| `projects` | **3** |
| `sprints` | **0** |
| `tasks` | 27 |
| `project_phases` | 5 |
| `service_catalog` | 14 |
| `growth_routines` | 11 |
| `revenue_streams` | 12 |
| `task_assignees` | 0 |
| `time_entries` | 0 |
| `task_comments` | 0 |
| `growth_initiatives` | 0 |

Dettaglio task (27 totali):

| Condizione | Righe |
|---|---|
| `is_milestone = true` | **0** |
| `sprint_id NOT NULL` | **0** |
| `phase_id NOT NULL` | **0** |
| `parent_task_id NOT NULL` | **0** |
| `routine_id NOT NULL` | **27** |

## I 3 progetti

Tutti e tre appartengono allo **stesso cliente** (Fatima Leo Salon & Academy) e
sono stati creati il **2026-07-19**, cioè ieri.

| Nome | Linea | Servizio | Motore | Economia |
|---|---|---|---|---|
| Growth Fatima Leo | growth | *(nessuno)* | `growth_program` | `da_definire` |
| Continuing Designer — Fatima Leo | marketing | `analisi_mercato` ⚠️ | `structured_one_off` | definito |
| Social Media Management — Fatima Leo | marketing | `social_media_management` | `recurring_service` | definito |

⚠️ Il progetto "Continuing Designer" ha `service_key = analisi_mercato`: la
classificazione non corrisponde al nome. Va corretta a mano (1 UPDATE), non è
un problema di modello.

Gli altri **11 clienti su 12 non hanno alcun progetto**.

## Conseguenze operative

1. **Non esiste un dataset legacy da migrare.** Le 27 task sono tutte occorrenze
   generate ieri dalle routine Growth: nessun lavoro umano ci è sopra (0 commenti,
   0 ore registrate, 0 assegnazioni).
2. **Gli Sprint non esistono nei dati.** La tabella è vuota. La "rimozione
   progressiva" del §10 del brief non ha niente da proteggere: è una pulizia di
   codice, non una migrazione.
3. **Le Subtask non esistono nei dati.** 0 task con `parent_task_id`.
4. **Le Milestone non esistono nei dati.** 0 task con `is_milestone`.
5. **Il "reset dei progetti attivi" (§11) è già di fatto avvenuto** con la pulizia
   del 2026-07-19 (progetto `Test` + 31 task cancellati, vedi
   `docs/project-engine/12-IMPLEMENTATION_ROADMAP.md` §F/A28).

**Non serve snapshot di conservazione, non serve archiviazione legacy, non serve
piano di rollback dei dati.** Serve solo decidere il modello e costruirlo.
