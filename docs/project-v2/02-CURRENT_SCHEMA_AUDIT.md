# 02 — Audit dello schema attuale

135 file di migration, l'ultima è `137_smm_service.sql`.
⚠️ `CLAUDE.md` è **disallineato**: dichiara "prossimo libero 106", in realtà è **138**.

## Quanto del brief esiste già

Le migration 128–137 (18–19 luglio) hanno già costruito buona parte di ciò che
il brief chiede, con nomi diversi.

| Richiesta del brief | Stato | Dove |
|---|---|---|
| §4 Area / Servizio / Motore / Modello economico separati | ✅ **fatto** | `service_catalog` (133), `projects.service_line/service_key/delivery_model` (132) |
| §4.5 Modello economico indipendente | ✅ **fatto** | `default_revenue_model` + `revenue_streams` (116) |
| §5 Workstream | 🟡 **parziale** | `project_phases` (134) — struttura simile, campi mancanti |
| §7 Milestone come entità | ❌ **assente** | esiste solo `tasks.is_milestone` (flag, 0 righe) |
| §8 Task con contesto completo | 🟡 parziale | manca `workstream_id`, `milestone_id`, `task_type`, `supervisor` |
| §9 Ricorrenze template + occorrenze | ✅ **fatto per Growth** | `growth_routines` + `tasks.routine_id/routine_period` (129/130) |
| §9 generazione idempotente | ✅ **fatto** | `uq_tasks_routine_period` UNIQUE INDEX (129) |
| §12 Creazione atomica | ✅ **fatto** | `create_project_from_wizard(payload JSONB)` (134) |
| §12 Wizard unico | 🟡 parziale | `ProjectWizard.tsx` esiste, 7 step, **manca lo step Workstream** |
| §19 Template configurabili | 🟡 parziale | `service_catalog.startup_tasks` JSONB, nessuna UI |

## `projects` — colonne rilevanti
`client_id`, `name`, `status`, `service_line`, `service_key`, `delivery_model`,
`project_type`, `growth_vertical`, `economic_status`, `manager_id`,
`startup_target_days`, `project_kind`, `sprint_current`.

`delivery_model` ha già i 5 valori decisi: `growth_program`, `digital_project`,
`recurring_service`, `structured_one_off`, `hybrid_delivery`.

## `project_phases` (134) — il candidato Workstream

Presenti: `id`, `project_id`, `key`, `name`, `position`, `start_date`, `end_date`,
`owner_id`, `status`, `requires_client_approval`, `approved_at`, `deliverables`,
`created_at`.

Mancano rispetto al §5: `description`, `workstream_type`, `priority`,
`visibility`, `updated_at`.

Semantica attuale (dal commento della 134): *"lo sprint è temporale, la fase è
logica"*. È **esattamente** la semantica del Workstream.

## `tasks` — colonne rilevanti
`project_id`, `client_id`, `title`, `status`, `is_milestone`, `due_date`,
`start_date`, `assignee_id`, `sprint_id`, `phase_id`, `parent_task_id`,
`routine_id`, `routine_period`, `initiative_id`, `estimated_hours`,
`logged_hours`, `origin_task_id`, `requested_by`, `deleted_at`.

`status` include già `richiesta_supporto` (101).

## `sprints`
Tabella presente, **0 righe**. `tasks.sprint_id` presente, **0 riferimenti**.
`projects.sprint_current` presente e letto da qualche componente.
