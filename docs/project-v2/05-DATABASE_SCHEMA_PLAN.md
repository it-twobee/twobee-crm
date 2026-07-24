# 05 — Database Schema Plan

> Migration a partire da **147** (114→144–146 già usate; 115–143 su archive branch).
> Piano DDL, non ancora eseguito. Naming tabella libero (droppato nel reset).
> Ordine: catalogo → progetti → workstream → milestone → task → assignees →
> ricorrenze → RLS → indici. Ogni `CREATE TABLE` con RLS `ENABLE` + policy esplicite.

## Convenzioni
- PK `id uuid default gen_random_uuid()`.
- `created_at/updated_at timestamptz default now()`, trigger `set_updated_at`.
- `created_by uuid references profiles(id)`.
- `visibility text check (visibility in ('internal','client_visible')) default 'internal'`.
- Cancellazione: soft-delete `deleted_at timestamptz` dove serve cestino (task/progetti).

---

## 147 — projects

```
projects
  id, client_id → clients(id) NOT NULL
  name text NOT NULL
  description text
  area text NOT NULL            check in (marketing,growth,digital)
  service_type text NOT NULL    -- validato vs service_catalog
  service_subtype text          -- nullable (crm/management_software/custom_application)
  operating_model text          -- una_tantum | continuativo | misto
  revenue_model text            -- fixed | retainer | performance | misto  (solo admin/economics futuro)
  status text NOT NULL          check in (draft,active,on_hold,completed,archived) default 'draft'
  manager_id uuid → profiles(id)   -- PM del progetto
  priority text                 check in (alta,media,bassa) default 'media'
  visibility …
  start_date date, target_end_date date, actual_end_date date
  created_by, created_at, updated_at, deleted_at
Indici: (client_id), (status), (manager_id), (area, service_type)
```

## 147 — project_workstreams  (UI: "Sottoprogetto")

```
project_workstreams
  id, project_id → projects(id) NOT NULL
  name, description
  workstream_type text NOT NULL  check in (project,recurring) default 'project'
  status text NOT NULL           check in (draft,active,paused,completed,archived) default 'draft'
  owner_id uuid → profiles(id)
  priority, visibility
  start_date, end_date
  sort_order int default 0
  created_by, created_at, updated_at
Indici: (project_id), (workstream_type), (status)
```

## 148 — milestones

```
milestones
  id, project_id → projects(id) NOT NULL
  workstream_id → project_workstreams(id) NOT NULL
  title, description
  milestone_type text NOT NULL   check in (delivery,system) default 'delivery'
  status text NOT NULL           check in (da_fare,in_corso,in_approvazione,completata) default 'da_fare'
  owner_id uuid → profiles(id)
  due_date date, completed_at timestamptz
  approval_required boolean default false
  approved_by uuid → profiles(id), approved_at timestamptz
  deliverable text, completion_criteria text
  visibility, sort_order
  created_at, updated_at
Indici: (workstream_id), (project_id), (status), (due_date)
```

> Ogni workstream nuovo → trigger/app crea la milestone di sistema
> "Operatività continua" (`milestone_type='system'`). La UI la distingue dalle
> `delivery` (doc 08 §milestone di sistema).

## 149 — tasks  (di progetto **o** Ad Hoc)

```
tasks
  id, client_id → clients(id) NOT NULL          -- sempre valorizzato
  task_type text NOT NULL   check in (project,ad_hoc) default 'project'
  project_id    → projects(id)              -- NULL sse ad_hoc
  workstream_id → project_workstreams(id)   -- NULL sse project_id NULL
  milestone_id  → milestones(id)            -- NULL sse project_id NULL
  title text NOT NULL, description text
  status text NOT NULL   check in (da_fare,in_corso,in_review,richiesta_supporto,completato) default 'da_fare'
  priority text          check in (alta,media,bassa) default 'media'
  assignee_id uuid → profiles(id)           -- PRIMARIO, mirror di task_assignees
  start_date date, due_date date
  estimated_hours numeric, logged_hours numeric default 0
  visibility
  recurring_template_id → recurring_task_templates(id)   -- NULL se non generata
  is_recurring_instance boolean default false
  generated_for_date date                   -- data logica dell'occorrenza
  created_by, created_at, updated_at, deleted_at
CHECK gerarchia:
  (task_type='project' AND project_id IS NOT NULL AND workstream_id IS NOT NULL AND milestone_id IS NOT NULL)
  OR
  (task_type='ad_hoc'  AND project_id IS NULL AND workstream_id IS NULL AND milestone_id IS NULL)
UNIQUE idempotenza ricorrenze:
  (recurring_template_id, generated_for_date)  WHERE recurring_template_id IS NOT NULL
Indici: (client_id, task_type), (milestone_id), (workstream_id), (project_id),
        (assignee_id), (status), (due_date), (recurring_template_id)
```

## 150 — task_assignees  (multi-assegnatario)

```
task_assignees
  id, task_id → tasks(id) NOT NULL
  profile_id uuid → profiles(id) NOT NULL     -- oppure client contact per Ad Hoc al cliente?  (vedi nota)
  is_primary_owner boolean default false
  role_in_task text
  created_at, updated_at
UNIQUE (task_id, profile_id)
```
> Scrittura SEMPRE via `setTaskAssignees`/`bulkSetTaskAssignees` (service role) che
> tengono in sync `tasks.assignee_id` = primo assegnatario primario (come nel
> modello precedente). Nota Ad Hoc "assegnata al cliente": il cliente è un
> `profiles` con `app_role='client'` → si assegna via `profile_id` come gli altri.

## 151 — recurring_task_templates

```
recurring_task_templates
  id, client_id → clients(id) NOT NULL
  project_id → projects(id)              -- NULL se template Ad Hoc ricorrente (fase 2)
  workstream_id → project_workstreams(id)
  milestone_id → milestones(id)          -- default: milestone di sistema del workstream
  title, description
  frequency text NOT NULL  check in (daily,weekly,biweekly,monthly,quarterly,custom)
  interval int default 1
  recurrence_rule text                   -- iCal RRULE per 'custom'
  weekdays int[]                          -- 0..6 per weekly/biweekly
  day_of_month int                        -- per monthly/quarterly
  start_date date NOT NULL, end_date date
  generation_lead_days int default 3      -- genera 3 gg prima (confermato)
  owner_id uuid → profiles(id)
  priority, estimated_hours, visibility
  active boolean default true
  last_generated_at timestamptz, next_generation_at timestamptz
  created_by, created_at, updated_at
Indici: (active, next_generation_at), (project_id), (workstream_id)
```

## 152 — service_catalog (v2) + project_templates

```
service_catalog
  id, area text, service_type text, service_subtype text NULL,
  label text, is_active boolean default true, sort_order int
  UNIQUE (area, service_type, coalesce(service_subtype,''))

project_templates
  id, service_type text, service_subtype text NULL, name, description, is_active
project_template_nodes           -- struttura ad albero suggerita
  id, template_id, parent_id NULL,
  node_type text check in (workstream,milestone,task,recurring_task),
  name, workstream_type NULL, milestone_type NULL,
  frequency NULL, suggested_owner_role text NULL,
  relative_due_days int NULL, priority NULL, visibility NULL, sort_order
```
> `project_template_nodes` modella l'albero (workstream→milestone→task/ricorrenza)
> con owner suggeriti, scadenze **relative** e frequenze. Il wizard lo istanzia.

## 153 — RLS policies

Tutte le tabelle `ENABLE ROW LEVEL SECURITY`. Policy per ruolo secondo la matrice
del **doc 10**. Principi:
- **admin** (`is_staff()`/role='admin'): full su tutto.
- **team** (workspace): SELECT su progetti/workstream/milestone/task **assegnati**
  o dei progetti dove è nel team; INSERT/UPDATE task scoped; **niente** colonne
  economiche (nessuna qui: sicuro).
- **client**: SELECT solo righe `visibility='client_visible'` del proprio
  `client_id`; UPDATE limitato a task client_visible assegnate + approvazione
  milestone.
- Scrittura canali/assegnatari/generazione ricorrenze: **service role**.

## 154 — trigger & funzioni
- `set_updated_at` su tutte.
- `ensure_system_milestone()` — alla creazione workstream crea "Operatività continua".
- `sync_task_primary_assignee()` — mantiene `tasks.assignee_id`.
- `generate_recurring_task_occurrences()` — idempotente su `(template_id, generated_for_date)`; schedulata via `pg_cron` (doc 08).
- audit su INSERT/UPDATE/DELETE verso `activity_log` (esteso alle nuove tabelle).

## Note di rischio
- Il CHECK gerarchia è la garanzia che nessun task di progetto resti orfano e che
  gli Ad Hoc non aggancino gerarchia parziale.
- L'`UNIQUE(recurring_template_id, generated_for_date)` è la garanzia anti-duplicati.
- KPI: se servono per-progetto, **nuova** tabella `project_kpis` (non toccare
  `client_kpis`, tornata per-cliente). Da decidere in fase KPI (fuori MVP task).
