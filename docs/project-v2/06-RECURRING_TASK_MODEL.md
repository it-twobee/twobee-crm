# 06 — Modello delle task ricorrenti

## È già costruito, ma solo per il Growth

Il §9 del brief descrive `recurring_task_templates` + occorrenze idempotenti.
Esiste già come `growth_routines` (migration 129/130), ed è **in produzione**:
11 routine attive che hanno generato le 27 task presenti.

| §9 chiede | `growth_routines` |
|---|---|
| template separato dall'occorrenza | ✅ `growth_routines` / `tasks` |
| `recurrence_rule`, `frequency` | ✅ `frequency` (settimanale/mensile/trimestrale) |
| `last_generated_at`, `next_generation_at` | ✅ |
| `active` | ✅ `is_active` |
| occorrenza = task reale | ✅ `tasks.routine_id` |
| generazione idempotente | ✅ `uq_tasks_routine_period` UNIQUE(routine_id, routine_period) |
| no duplicati template+periodo | ✅ garantito dal DB, non dal codice |

## Cosa manca

1. **È legato al Growth.** Il nome, la RLS e il wizard presuppongono un
   `growth_program`. Il §9 lo vuole per ogni servizio (una SMM ha routine
   settimanali quanto una Lead Gen). → **generalizzare a `recurring_task_templates`**,
   aggiungendo `workstream_id` e `milestone_id`.
2. **Granularità**: manca `frequency = giornaliera`, `interval`, `weekdays`,
   `day_of_month` (§9). Oggi c'è solo settimanale/mensile/trimestrale.
3. **Le azioni utente del §9** (modifica solo questa / questa e successive /
   il template / sospendi / riattiva / termina) **non esistono**: oggi si può
   solo disattivare la routine.
4. **Finestra di generazione** non configurabile → domanda D15.
5. **Occorrenze scadute non eseguite**: nessun comportamento definito → D16.

## Raccomandazione
Rinominare ed estendere, non ricreare. `growth_routines` → `recurring_task_templates`,
`tasks.routine_id` → `recurring_template_id`, mantenendo l'indice unique che è
la parte che conta (e che già funziona).
