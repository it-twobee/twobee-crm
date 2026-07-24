# 17 — Recurring Task Templates (& Project Templates)

## Due livelli di template
1. **Project templates** (`project_templates` + `project_template_nodes`) — la
   struttura suggerita di un servizio (Sottoprogetti → Milestone → Task →
   Task ricorrenti). Usati dal wizard (doc 07 step 6).
2. **Recurring task templates** (`recurring_task_templates`) — le regole di
   ricorrenza istanziate dentro un progetto reale (doc 08).

Il wizard trasforma i nodi `recurring_task` del project template in
`recurring_task_templates` reali alla creazione del progetto.

## Campi di un template ricorrente (nodo o istanza)
```
title, description, service/verticale (solo nel project template),
frequency, interval, weekdays/day_of_month, recurrence_rule (custom),
suggested_owner_role → owner_id, priority, estimated_hours,
visibility, checklist (opzionale), start/end, generation_lead_days=3
```

## Esempi (istanze)
```
Check Ads
  frequency: weekly · weekday: lun · due 18:00 · gen 3gg prima
  owner: Media Buyer · priority: alta · 1h · visibility: internal
Reportistica
  frequency: monthly · day_of_month: 25 · due: ultimo giorno lavorativo
  owner: Growth Specialist · priority: alta · 2h · visibility: client_visible
```

## Gestione (super_admin)
Creare / modificare / duplicare / disattivare project template; aggiungere task;
cambiare frequenze/owner suggerito; **applicare un template a un progetto esistente**
(genera i nodi mancanti). Tutto **dato**, nessun deploy. Solo super_admin scrive i
template globali (doc 10).

## Frequenze supportate
`daily · weekly · biweekly · monthly · quarterly · custom`. Ogni template indica:
start, frequenza, giorno settimana/mese, scadenza relativa, anticipo generazione,
end, sospensione, owner, estimated_hours.

## Decisioni applicate (dai default confermati)
- **Check Ads / Budget / Creatività** = **task ricorrenti separate** (assegnabili e
  completabili singolarmente), NON checklist di un'unica task.
- **Reportistica / Meeting** = **task ricorrenti** dentro milestone di sistema
  **"Governance"**, non milestone a sé.
- Anticipo generazione **3 giorni**; nessun carry-over delle occorrenze scadute.
- Visibilità default: operative `internal`, report/meeting `client_visible`.

## Idempotenza
Ogni occorrenza è una `tasks` reale con `is_recurring_instance=true`; unicità
garantita da `UNIQUE(recurring_template_id, generated_for_date)` (doc 05/08).

## Seed MVP
Template completi per **Lead Generation** ed **E-commerce** (doc 16) al lancio; gli
altri servizi (Branding, SMM, Audit, Continuing Design, Evento, SaaS, AI Project,
CRM/Gestionale/Applicativo) aggiunti iterativamente come dati.

## Test
- Applicare un template a progetto esistente non duplica nodi già presenti.
- Disattivazione template ferma la generazione, preserva le occorrenze.
- Occorrenza modificata "solo questa" non altera il template.
