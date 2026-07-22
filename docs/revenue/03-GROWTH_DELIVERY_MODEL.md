# 03 — Modello di delivery Growth

## Cosa esiste già

| Pezzo richiesto dal §9.2 | Stato attuale |
|---|---|
| Fase Startup una tantum | ❌ niente. `sprints` esiste ma è vuota e non ha tipo |
| Routine ricorrenti | ⚠️ `tasks.recurrence ∈ (settimanale, quindicinale, mensile)` + `recurrence_end` (migration 011) — **campo presente, nessun generatore**. Nessuna occorrenza viene mai creata |
| Template | ⚠️ `task_templates(name, service_type ∈ growth/digital/entrambi, tasks JSONB)` (migration 011) — tabella presente, **0 righe, nessuna UI** |
| Iniziative una tantum | ❌ non esiste il concetto. Oggi sarebbe una milestone come le altre |
| Ad hoc | ⚠️ esiste `AD_HOC_TITLE = 'Ad Hoc'` in `app/actions/workspace-create.ts:131` — **milestone senza sprint dentro un progetto**, cioè legata al progetto, non al cliente |
| `project_kind = 'growth'` | ✅ esiste sul progetto, usato solo per un badge G/D e per il filtro Workload |

Quindi: le fondamenta (`recurrence`, `task_templates`) sono state posate e mai
usate. Non vanno reinventate, vanno completate.

## Il nodo strutturale: `recurrence` sulla task è il modello sbagliato

`tasks.recurrence` mette la regola di ricorrenza **sulla singola task**. Il §9.2
chiede routine **generate da template**, con periodo, owner e idempotenza. Con
`recurrence` sulla task ci sono solo due esiti, entrambi cattivi:

- una task "madre" che si auto-clona → nessuna traccia di quale occorrenza
  appartenga a quale periodo, e "modifica solo questa occorrenza" vs "modifica il
  template futuro" (§12) è irrisolvibile;
- N task pre-generate a inizio contratto → nessuna idempotenza, e cambiare la
  frequenza significa cancellare il futuro.

**Proposta**: separare *regola* da *occorrenza*.

```
growth_routines            ← la regola (il template attivo su quel progetto)
  project_id, title, description
  frequency ∈ (settimanale | quindicinale | mensile | trimestrale | custom)
  rrule TEXT (opzionale, per custom)
  default_owner_id, default_estimated_hours
  starts_on, ends_on, is_active
  template_id → task_templates(id)  (opzionale, da cosa è nata)

tasks  ← l'occorrenza, task reale come tutte le altre
  + routine_id → growth_routines(id)
  + period_key TEXT           es. '2026-W29' | '2026-07' | '2026-Q3'
  UNIQUE (routine_id, period_key)   ← QUESTA è l'idempotenza (§20.11)
```

Il vincolo `UNIQUE(routine_id, period_key)` è il cuore: il generatore può girare
ogni notte, a mano, due volte di fila, in parallelo — non produce mai duplicati.
`ON CONFLICT DO NOTHING`.

Con questo:
- «modifica solo questa occorrenza» = UPDATE sulla `tasks`;
- «modifica il template futuro» = UPDATE su `growth_routines` (le occorrenze già
  generate restano com'erano — corretto, sono storia);
- «routine non eseguita riportata al ciclo successivo» = decisione aperta (Q19).

## Le quattro aree del progetto Growth

Serve una dimensione sulla task che dica **a quale area appartiene**. Proposta:
`tasks.work_type`.

| `work_type` | Area §9.2 | Struttura |
|---|---|---|
| `startup` | A. Startup | milestone + task + subtask, dentro una fase iniziale |
| `routine` | B. Routine | generata da `growth_routines`, ha `routine_id` + `period_key` |
| `initiative` | C. Iniziative una tantum | ha `initiative_id`, può avere sprint/milestone proprie |
| `adhoc` | D. Ad hoc cliente | vedi `05-AD_HOC_TASK_MODEL.md` |
| `project` (default) | task Digital normale | invariato |

`work_type` è additivo con default `'project'`: nessuna task esistente cambia
comportamento.

### Iniziative

```
growth_initiatives
  project_id, name, description
  start_date, end_date
  budget NUMERIC (opzionale)
  owner_id, status
  created_at
```

Le task dell'iniziativa: `work_type='initiative'` + `initiative_id`. Se
l'iniziativa è complessa, può agganciare uno `sprint` esistente — nessuna
struttura parallela, si riusa `sprints`/milestone come per il Digital.

### Startup

Non serve una tabella. È una milestone di sistema per progetto (stesso pattern
già usato per "Ad Hoc" in `workspace-create.ts`), con le task a
`work_type='startup'`. Quando tutte le task startup sono `completato`, la
Panoramica passa lo stato Startup a "completata" e collassa la sezione — resta
consultabile ma smette di dominare (§9.2.A).

## Cosa NON fare

- Non creare una tabella `growth_projects` parallela a `projects`. Il dominio
  progetto resta unico (§20.16), cambia la UI e cambiano i campi.
- Non generare routine con un cron applicativo prima di aver deciso Q17–Q19: la
  frequenza sbagliata su 9 clienti Growth produce centinaia di task da cancellare
  a mano.
- Non usare `tasks.recurrence` per il nuovo motore. Va lasciato dov'è (nessuna
  riga lo usa) e deprecato in un secondo momento.

## Domande aperte che bloccano l'implementazione

Q16–Q21 in `10-IMPLEMENTATION_ROADMAP.md`. In particolare: durata Startup,
frequenza di default, elenco delle routine da seedare, owner di default,
comportamento delle routine scadute.
