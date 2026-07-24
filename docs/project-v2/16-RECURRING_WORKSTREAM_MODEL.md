# 16 — Recurring Workstream Model

## Modello dati
Una Workstream ricorrente è un `project_workstreams` con `workstream_type='recurring'`.
È **stabile** per tutta la vita del progetto: non si duplica ogni periodo. Contiene:
- milestone di sistema (`milestone_type='system'`: "Operatività continua",
  "Governance") ed eventuali milestone temporali;
- `recurring_task_templates` che generano le occorrenze (doc 08);
- storico occorrenze, owner, frequenza.

Distinzione chiave:
```
Workstream ricorrente = CONTENITORE stabile  (es. "Advertising")
Task ricorrente       = REGOLA che genera occorrenze (es. "Check Ads ogni lunedì")
```
Struttura corretta: `Progetto → Workstream ricorrente → Milestone (sistema/temporale)
→ Task generate da template`. **Mai** una workstream nuova per settimana/mese.

## Stati workstream
`draft · active · paused · completed · archived`. In pausa: niente nuove occorrenze,
le esistenti restano. Riattivazione: riparte dalla nuova data, niente duplicati
retroattivi senza conferma.

## UI
Badge: "Una tantum" / "Continuativa" / "In pausa". Dentro una workstream ricorrente:
attività di oggi/settimana/prossime/scadute/completate, calendario ricorrenze, KPI,
owner, frequenze attive. CTA: Nuova task · Nuova task ricorrente · Gestisci
ricorrenze · Sospendi Workstream · Apri storico.

## Milestone nelle workstream ricorrenti
- **Temporale**: "Chiusura mese gennaio", "Review Q1", "Piano Black Friday".
- **Di sistema**: "Operatività continua", "Governance", "Ottimizzazioni". Senza data
  di chiusura obbligata. Poiché `milestone_id` è NOT NULL per i task di progetto, la
  milestone di sistema è il contenitore di default delle ricorrenze — non si forzano
  milestone artificiali oltre queste.

## Template — Growth Lead Generation
```
Workstream: Advertising (recurring)
  Milestone sistema: Operatività continua
    Check Ads         — weekly (lun)      — Media Buyer  — 1h — internal
    Check Budget      — weekly (mer)      — Media Buyer  — 0.5h — internal
    Check Creatività  — biweekly          — Creative     — 1h — internal
    Ottimizzazione campagne — weekly      — Media Buyer  — 2h — internal
Workstream: Tracking e dati (recurring)
    Check Tracking / Verifica conversioni / Controllo qualità dati — internal
Workstream: Marketing Automation (recurring)
    Check Automation / Check flussi / Verifica errori — internal
Workstream: Lead Management (recurring)
    Check Lead / Analisi qualità lead / Supporto vendita — internal
Workstream: Governance (recurring)
  Milestone sistema: Governance
    Reportistica      — monthly (25)      — Growth       — 2h — client_visible
    Meeting periodico — monthly           — PM           — 1h — client_visible
```

## Template — Growth E-commerce
```
Workstream: Advertising (recurring)         — Check Ads/Budget/Creatività/Ottimizzazione
Workstream: UI/UX e CRO (recurring)         — Check UI/UX, Check CRO, Analisi funnel, Analisi checkout
Workstream: Automation e Retention (recurring) — Check Automation, Check flussi, Deliverability, Retention
Workstream: IT e qualità tecnica (recurring)   — Check IT/bug, Verifica errori, Integrazioni, Tracking
Workstream: Governance (recurring)          — Reportistica (client_visible), Meeting (client_visible)
```

## Idempotenza / stati / permessi / visibilità
Come doc 08 e doc 10. Occorrenze uniche su `(recurring_template_id,
generated_for_date)`; niente carry-over; generazione 3gg prima; visibilità cliente
configurabile per template e occorrenza.

## Rischi / test
- Rischio: proliferazione occorrenze → mitigato da lead-window + unique.
- Test: sospensione/riattivazione non duplica; modifica "questa e successive"
  non tocca lo storico; milestone di sistema sempre presente sui recurring.
