# 00 — Decisioni prese

## 2026-07-20 — Architettura

**D-1 — Label interna: "Area di lavoro"**
Nome tecnico in DB `project_workstreams`; nella UI Admin/Workspace si legge
"Area di lavoro". Stessa label anche nel Portale Cliente dove non c'è motivo di
differenziare → riduce le label da mantenere in `service_catalog`.

**D-2 — Milestone non obbligatoria sulla task**
Obbligatorio `workstream_id`, opzionale `milestone_id`.
Motivo: le 27 task esistenti sono tutte occorrenze di routine, per cui una
milestone non ha significato. Obbligarla produrrebbe milestone-contenitore finte.

**D-3 — Scrittura struttura: admin + PM del progetto**
`project_workstreams`, `workstream_milestones`, `recurring_task_templates`:
write ad admin/super_admin/founder **e** a `projects.manager_id`.
⚠️ Non additivo: `growth_routines` oggi è admin-only in scrittura (129).
La migration 140 allarga la policy.

**D-4 — Pilota: Social Media Management**
Primo template completo (workstream + milestone + task + ricorrenze) su
`social_media_management`. Progetto reale già esistente su Fatima Leo Salon &
Academy, motore `recurring_service`, servizio aggiunto dalla 137.

## Decisioni già prese in fase di audit (motivate nei doc 04 e 05)

**D-5 — Workstream = rename di `project_phases`**, non tabella nuova (doc 04).
**D-6 — Milestone = tabella dedicata** `workstream_milestones` (doc 04).
**D-7 — Nessun `service_subtype`**: i servizi del catalogo sono foglie (doc 05).
Deviazione consapevole dal §4.4 del brief.
