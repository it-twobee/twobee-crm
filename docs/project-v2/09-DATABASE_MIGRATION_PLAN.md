# 09 — Piano di migrazione database

Tutte additive e idempotenti. Prossimo numero libero: **138**
(⚠️ `CLAUDE.md` dice 106, è disallineato di 32).

## 138 — Workstream
- `ALTER TABLE project_phases RENAME TO project_workstreams`
- aggiunge `description`, `workstream_type`, `priority`, `visibility` (`internal|client|partner`), `updated_at`, trigger `updated_at`
- `ALTER TABLE tasks RENAME COLUMN phase_id TO workstream_id` (0 righe interessate)
- rinomina indici/policy/constraint (`pph_*` → `pws_*`)
- VIEW `project_phases` di compatibilità temporanea, per non rompere `project-phases.ts` prima del refactor

## 139 — Milestone V2
- `CREATE TABLE workstream_milestones`: `id`, `workstream_id`, `project_id` (denormalizzato per RLS), `title`, `description`, `milestone_type` (`delivery|approval|checkpoint|release|control|recurring_cycle`), `status`, `owner_id`, `expected_date`, `actual_date`, `deliverables JSONB`, `completion_criteria`, `approval_required`, `approved_by`, `approved_at`, `visibility`, `sort_order`, timestamps
- `ALTER TABLE tasks ADD COLUMN milestone_id UUID REFERENCES workstream_milestones(id) ON DELETE SET NULL`
- RLS: read staff, write PM/admin, client read solo `visibility='client'`

## 140 — Ricorrenze generalizzate
- `ALTER TABLE growth_routines RENAME TO recurring_task_templates`
- aggiunge `workstream_id`, `milestone_id`, `client_id`, `recurrence_interval`,
  `weekdays`, `day_of_month`, `generation_lead_days`, `last_generated_at`, `priority`
- `frequency` CHECK esteso con `giornaliera`
- **`tasks.routine_id` e `tasks.period_key` NON si rinominano.** (Correzione: una
  stesura precedente di questo doc parlava di `routine_period`, colonna che non
  esiste — il nome reale è `period_key`.) Sono le due colonne su cui poggia
  `uq_tasks_routine_period`, l'indice che impedisce le occorrenze doppie ed è
  l'unica parte del motore già in produzione (27 task generate). Rinominarle per
  coerenza estetica significa toccare il generatore funzionante senza guadagno.

## 141 — Task V2
- `tasks`: `task_type` (`action|review|approval|delivery|meeting|control|recurring|client_request|support_request`), `supervisor_id`, `visibility`
- `CREATE TABLE task_checklist_items` (`task_id`, `label`, `done`, `position`)
- `tasks.is_milestone` e `tasks.sprint_id`: **restano**, marcati deprecati via `COMMENT ON COLUMN`

## 142 — Template di servizio
- `service_catalog`: `workstream_templates JSONB`, `milestone_templates JSONB`, `client_workstream_label TEXT`
- seed dei template per i servizi decisi in D10
- aggiunge `saas_growth`, `custom_application`, `integration`

## 143 — Wizard atomico V2
- `CREATE OR REPLACE FUNCTION create_project_from_wizard(payload JSONB)` esteso a workstream + milestone + task in un'unica transazione

## 144 — Deprecazione Sprint (solo dopo che il codice non la usa più)
- `COMMENT ON TABLE sprints IS 'DEPRECATA — sostituita da project_workstreams'`
- **nessun DROP.** Il §10 lo vieta e la tabella è comunque vuota.

## Ordine e reversibilità
138 → 139 → 140 → 141 → 142 → 143. Ogni step è indipendente e non distruttivo.
I rename di colonna su tabelle con 0 righe rilevanti sono l'unico punto sensibile:
vanno accompagnati dal refactor del codice nello stesso commit.
