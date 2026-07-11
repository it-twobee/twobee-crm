# 11 — Data Quality Issues

> Numeri reali dal DB live alla data dell'audit. Ogni problema ha una query di
> rilevamento riutilizzabile (da eseguire nel SQL Editor).

## Riepilogo (severità)
| # | Problema | Valore reale | Impatto | Sev |
|---|---|---|---|---|
| DQ-01 | Progetti senza PM (`manager_id`) | **4/4** | blocca editing Workload, no accountability | 🔴 |
| DQ-02 | Task senza stima ore | **38/38** | Workload approssima a 4h | 🟠 |
| DQ-03 | Task senza scadenza | **29/38** | non collocabili in timeline/calendario | 🟠 |
| DQ-04 | Task senza owner | **21/38** | task "di nessuno" | 🟠 |
| DQ-05 | `client_assignments` vuota | **0** | 🔴 nessun cliente entra nel portale | 🔴 |
| DQ-06 | Clienti interni non marcati | **0/12** `is_internal` | falsano statistiche | 🟡 |
| DQ-07 | Clienti senza progetti | **9/12** | portfolio "vuoto" | 🟡 |
| DQ-08 | Task fuori da sprint | **37/38** | sprint inerti | 🟡 |
| DQ-09 | Subtask mai usate | **0/46** | livello inutilizzato | 🟡 |
| DQ-10 | Fonti time-tracking multiple | `time_entries`/`task_time_logs`/`logged_hours` | ambiguità | 🟡 |

## Query di rilevamento (SQL)
```sql
-- DQ-01: progetti attivi senza PM
select id, name from projects where status='attivo' and manager_id is null;

-- DQ-02: task attive senza stima
select id, title from tasks
where is_milestone=false and status<>'completato' and estimated_hours is null;

-- DQ-03: task attive senza scadenza
select id, title from tasks
where is_milestone=false and status<>'completato' and due_date is null;

-- DQ-04: task senza alcun assegnatario
select t.id, t.title from tasks t
where t.is_milestone=false and t.assignee_id is null
and not exists (select 1 from task_assignees a where a.task_id=t.id);

-- DQ-05: clienti senza collegamento utente (portale irraggiungibile)
select c.id, c.company_name from clients c
where not exists (select 1 from client_assignments a where a.client_id=c.id);

-- DQ-06: candidati clienti interni (TwoBee stessa) non marcati
select id, company_name from clients where is_internal=false; -- rivedere manualmente

-- DQ-08: task attive fuori da uno sprint
select count(*) from tasks where sprint_id is null and is_milestone=false;
```

## Report "DATA_QUALITY_ISSUES" (vista suggerita, additiva)
Si può creare una **VIEW** read-only (nessun rischio) che aggrega i conteggi sopra,
da mostrare in un widget admin "Salute dei dati". Additiva, non distruttiva.
→ Backlog `DQ-VIEW` (P2).

## Azioni immediate consigliate (dato, non codice)
1. Assegnare un **PM** a ciascun progetto attivo (DQ-01) — sblocca il Workload.
2. Aggiungere **stima ore** e **scadenza** alle task dei progetti attivi (DQ-02/03).
3. Popolare **`client_assignments`** o confermare la tabella canonica (DQ-05) —
   prerequisito per far entrare i clienti.
4. Marcare i **clienti interni** con `is_internal=true` (DQ-06).
