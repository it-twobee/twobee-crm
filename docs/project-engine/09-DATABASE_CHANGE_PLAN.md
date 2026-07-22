# 09 — Piano di modifica database

Prossima migration libera: **132**. Tutte additive.

## Il nodo da sciogliere prima di scrivere: `delivery_model`

Esiste già (115) con 3 valori. Il brief ne chiede 5.

| Oggi | Brief |
|---|---|
| `recurring_operations` | `growth_program` · `recurring_service` |
| `structured_project` | `digital_project` · `structured_one_off` |
| `hybrid` | `hybrid_delivery` |

Non è un allargamento: è una **granularità diversa**. `recurring_operations`
copre sia il Growth Program (genera lavoro da template) sia il Continuing
Designer (riceve lavoro dal cliente) — che sono motori diversi e vanno separati.

Tre opzioni:

- **A** — allargare il CHECK ai 5 nuovi e migrare i valori vecchi. 2 righe in
  produzione, costo ~zero. Sinonimi eliminati.
- **B** — tenere i 3 e aggiungere `delivery_engine` accanto. Due colonne che
  dicono la stessa cosa: è l'errore che il brief vieta.
- **C** — tenere i 3 e distinguere Growth da Continuing Designer via
  `service_line`. Funziona ma è implicito, e implicito significa che qualcuno
  sbaglierà.

**Raccomandazione: A.** Con 2 progetti in produzione la finestra è aperta ora e
si chiude appena arrivano gli 85 progetti Asana.

---

## 132 — Motori operativi a 5 valori

```sql
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_delivery_model_check;
UPDATE public.projects SET delivery_model =
  CASE WHEN delivery_model = 'recurring_operations' AND service_line = 'growth' THEN 'growth_program'
       WHEN delivery_model = 'recurring_operations' THEN 'recurring_service'
       WHEN delivery_model = 'structured_project' AND service_line = 'digital' THEN 'digital_project'
       WHEN delivery_model = 'structured_project' THEN 'structured_one_off'
       ELSE 'hybrid_delivery' END;
ALTER TABLE public.projects ADD CONSTRAINT projects_delivery_model_check
  CHECK (delivery_model IN ('growth_program','digital_project','recurring_service','structured_one_off','hybrid_delivery'));
```
Va aggiornato anche il trigger `projects_derive_service_line` (124).

## 133 — Service Catalog

`ALTER TABLE task_templates` con i campi del doc 03. Seed dei 13 servizi.
RLS: lettura staff, scrittura admin.

## 134 — Growth Startup e verticale

```sql
ALTER TABLE public.projects
  ADD COLUMN growth_vertical TEXT CHECK (growth_vertical IN ('ecommerce','lead_gen')),
  ADD COLUMN startup_started_on DATE,
  ADD COLUMN startup_target_days INT DEFAULT 21,
  ADD COLUMN startup_completed_at TIMESTAMPTZ;
```
Backfill: `growth_vertical` da `project_type` dove `service_line='growth'`.

## 135 — Planning Cycles

`growth_planning_cycles` + `growth_initiatives.planning_cycle_id`.

## 136 — Fasi Digital

`project_phases` + `tasks.phase_id` + `sprints.phase_id`.

## 137 — Release e tempo cliente

```sql
ALTER TABLE public.tasks
  ADD COLUMN release_env TEXT,
  ADD COLUMN release_outcome TEXT,
  ADD COLUMN wait_type TEXT CHECK (wait_type IN
    ('lavoro_twobee','lavoro_partner','attesa_cliente','test_cliente','revisione'));
```

## 138 — Date dinamiche

`projects.desired_end_date`, `estimated_end_date`, `estimate_confidence`,
`estimate_updated_at`.

## 139 — Partner e work package

`project_work_packages` + `tasks.work_package_id` + RLS partner + VIEW senza
`agreed_cost`.

## 140 — Recurring Service

`work_type` esteso con `'request'`; contatore di capacità per ciclo.

## 141 — Pulizia

Rimozione di `project_kind` (deprecata dalla 115, ancora letta in 25 file) e
`tasks.recurrence` (011, mai usata). **Solo dopo** che il codice è stato
ripuntato.

---

## Riepilogo

| # | Cosa | Rischio |
|---|---|---|
| 132 | delivery_model a 5 valori | basso (2 righe) — **finestra che si chiude** |
| 133 | Service Catalog | nullo (tabella vuota) |
| 134 | Startup + verticale | basso |
| 135 | Planning Cycles | nullo |
| 136 | Fasi Digital | basso |
| 137 | Release + wait_type | basso |
| 138 | Date dinamiche | basso in DB, **alto nella logica** |
| 139 | Partner | **medio** — RLS da verificare con utente reale |
| 140 | Recurring Service | basso |
| 141 | Pulizia colonne morte | medio — 25 file da ripuntare prima |
