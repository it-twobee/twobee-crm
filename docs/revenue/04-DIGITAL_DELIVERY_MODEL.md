# 04 — Modello di delivery Digital

## Cosa esiste già

La struttura del §9.1 (Cliente → Progetto → Sprint → Milestone → Task → Subtask)
è **già interamente modellata**:

- `projects(client_id, name, status, project_type, project_kind, sprint_current, manager_id, brief)`
- `sprints(project_id, name, start_date, end_date, status)`
- milestone = `tasks.is_milestone = true` + `tasks.milestone_id` sulle figlie (migration 040/041)
- subtask = `tasks.parent_task_id` + `tasks.depth` (migration 042 / 114)
- `task_dependencies` (035), `task_assignees` (069/072), `task_templates` (011)
- `project_appointments` (043), `meeting_notes`, `client_kpis` per progetto (037),
  `project_comments` (038), `decisions` (044/086)
- UI: `components/projects/ProjectPageClient.tsx` (~2980 righe) con i tab
  Progetto / Appuntamenti / Riunioni / KPI / Aggiornamenti / Chat

Il Digital engine **non va costruito, va consolidato**. La Fase 5 del brief è la
più piccola di tutte, non la più grande.

## Cosa manca davvero

| Richiesto §13 | Stato |
|---|---|
| Panoramica con avanzamento / sprint corrente / prossima milestone / blocchi | ⚠️ parziale, sparso nei 2980 righe di `ProjectPageClient` |
| Piano progetto / Gantt / timeline | ❌ esiste solo la timeline del Workload (`/workload`), non del singolo progetto |
| Ad hoc cliente (pannello contestuale) | ❌ vedi doc 05 |
| Customer Care nel progetto | ✅ canali `customer_care` per progetto |
| Documenti | ✅ `files` / `file_folders` (108) |
| **Stato economico solo Admin** | ❌ **non esiste alcun dato economico sul progetto** |

## Il buco: `projects` non ha economia

`projects` non ha **nessun** campo di valore: né prezzo, né preventivo, né budget,
né SAL, né percentuale di avanzamento fatturabile. Le metriche Digital chieste dal
§7 (venduto / contrattualizzato / fatturato / incassato / backlog / da fatturare /
in ritardo / SAL completati non fatturati) sono **tutte non calcolabili**.

Non si risolve aggiungendo `projects.value`. Un progetto Digital ha tipicamente:
preventivo accettato → acconto → N SAL → saldo. Servono importi con **date di
competenza** e **stato di fatturazione** distinti dal progetto.

Modello proposto (dettagli in doc 07):

```
revenue_streams        ← l'accordo economico (1 per canone, 1 per progetto)
  client_id, project_id?, quote_id?
  service_line, revenue_model, amount, billing_frequency,
  start_date, end_date, status

revenue_milestones     ← per revenue_model = 'milestone_based' (acconto/SAL/saldo)
  stream_id, label, amount, due_on, trigger_task_id?, status
  invoice_id?          ← quando viene fatturato

invoices + stream_id / revenue_milestone_id
```

Con questo, e solo con questo:

- **Digital venduto** = Σ `quotes.final_price` con `status='accettata'` nel periodo
- **Digital contrattualizzato** = Σ `revenue_streams.amount` (service_line='digital', status='attivo')
- **Digital fatturato YTD** = Σ `invoices.amount` join stream service_line='digital', `sent_at` nell'anno
- **Digital incassato YTD** = idem ma `paid_at` nell'anno
- **Digital backlog** = contrattualizzato − fatturato
- **Da fatturare** = `revenue_milestones` completate senza `invoice_id`
- **SAL completati non fatturati** = idem, filtrato su quelle con `trigger_task_id` completata

`trigger_task_id` è il ponte fra delivery ed economia: quando la milestone di
progetto viene chiusa, il SAL diventa fatturabile. È l'unico punto in cui il
project management tocca il denaro, ed è **read-only per il Workspace**.

## Gantt

Il codice per una timeline esiste già in `lib/workload.ts` (`taskSpan`,
`computeEffortBuckets`, `computeSprintDensity`, `GRAIN_HORIZON`) e in
`WorkloadClient`. Un Gantt di progetto è un riuso di quelle funzioni filtrate su
un `project_id`, non un nuovo motore. Da fare in Fase 5, bassa priorità.

## Raccomandazione

Il Digital non è il rischio di questo lavoro. Il rischio è che
`ProjectPageClient.tsx` a 2980 righe debba ospitare **due** esperienze diverse.
Proposta: `ProjectPageClient` diventa un router sottile che, letto
`project.service_line`, monta `DigitalProjectView` (l'attuale, estratto così
com'è) o `GrowthProjectView` (nuovo). Nessuna riscrittura del Digital.
