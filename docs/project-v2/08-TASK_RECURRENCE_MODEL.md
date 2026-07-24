# 08 — Task Recurrence Model

## Principio
La **ricorrenza è una regola**, non un livello gerarchico. Un
`recurring_task_templates` genera **Task reali** (occorrenze), ognuna assegnabile,
modificabile, completabile e storicizzabile.

## Frequenze
`daily · weekly · biweekly · monthly · quarterly · custom` (custom = `recurrence_rule`
in formato iCal RRULE). Parametri: `interval`, `weekdays[]` (weekly/biweekly),
`day_of_month` (monthly/quarterly), `start_date`, `end_date?`.

## Generazione (idempotente)
- Ogni occorrenza = riga in `tasks` con `is_recurring_instance=true`,
  `recurring_template_id`, `generated_for_date`.
- **Anti-duplicati**: `UNIQUE (recurring_template_id, generated_for_date)`. La
  funzione fa `INSERT … ON CONFLICT DO NOTHING`.
- **Anticipo**: `generation_lead_days=3` (confermato) → l'occorrenza nasce 3 giorni
  prima della `due_date` calcolata.
- Motore: funzione DB `generate_recurring_task_occurrences()` schedulata via
  `pg_cron` (giornaliera). Legge i template `active=true` con
  `next_generation_at <= now()`, crea le occorrenze mancanti fino a lead-window,
  aggiorna `last_generated_at`/`next_generation_at`.
- Default owner occorrenza = `template.owner_id`; milestone = milestone di sistema
  "Operatività continua" del workstream (o quella indicata dal template).

## Occorrenze non completate
**Nessun carry-over automatico** (confermato): l'occorrenza scaduta resta
`da_fare`/`in_corso` e appare come **scaduta**; non si duplica nel periodo
successivo. Il periodo nuovo genera comunque la sua occorrenza.

## Modifica
- **Solo questa occorrenza** → modifica la riga `tasks` (non tocca il template).
- **Questa e le successive** → aggiorna il template dalla data corrente in poi.
- **Il template** → modifica globale.
- **Sospendi** → `active=false`: niente nuove occorrenze; le esistenti restano.
- **Termina** → `end_date` = oggi; storico preservato.
- Riattivazione (`active=true`): riparte dalla nuova `start/next_generation`;
  niente generazione retroattiva senza conferma esplicita.

## Milestone di sistema
Per attività senza consegna specifica ogni Sottoprogetto ha milestone di sistema
(`milestone_type='system'`): **Operatività continua**, **Governance** (report/
meeting), **Backlog operativo**, **Richieste straordinarie**. Distinte in UI dalle
milestone di consegna (badge "Sistema"). Evitano task orfane pur con
`milestone_id NOT NULL`.

## Alert
Se un'occorrenza scade non completata → notifica a **owner + PM** (`type=task_due`).

## Esempi
```
Check Ads    — weekly, lunedì, due lun 18:00, gen 3gg prima, owner Media Buyer, 1h, internal
Reportistica — monthly, day_of_month 25, due ultimo giorno lavorativo, owner Growth, 2h, client_visible
Check Creatività — biweekly, interval 2 settimane
```

## Visibilità cliente
Default ricorrenti operative (`Check *`) = `internal`. `Report`/`Meeting` =
`client_visible`. Configurabile per template e per singola occorrenza (doc 15).
