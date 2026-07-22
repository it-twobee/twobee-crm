# 11 — RLS e permessi

## Base esistente da riusare
- `coarseRole(app_role)` in `lib/permissions.ts` — unica fonte `app_role → role`
- `is_staff()`, `get_my_role()` in DB
- 096 chiude le RLS `USING(true)`; 100 toglie gli economici al Workspace;
  106 scoping risorse esterne; 110 fix ricorsione

## Nuove tabelle — policy previste

### `project_workstreams`
| Ruolo | Read | Write |
|---|---|---|
| admin / super_admin / founder | tutto | tutto |
| manager | tutto | sì |
| senior/junior/stage/freelance | workstream dei progetti dove sono assegnati | no |
| partner | solo `visibility='partner'` dei propri progetti | no (D18) |
| client | solo `visibility='client'` del proprio cliente | no |

### `workstream_milestones`
Stessa matrice. `approved_by` scrivibile dal cliente **solo** se
`approval_required = true` e `visibility='client'` — è l'unico caso in cui un
utente `client` scrive su una tabella operativa.

### `recurring_task_templates`
Read staff, write admin **o PM del progetto** (`projects.manager_id`) → D17/D20.
Oggi `growth_routines` è **admin-only in scrittura**: allargare al PM è una
modifica di policy, non additiva. Da confermare.

### `task_checklist_items`
Eredita la visibilità della task madre.

## Il punto critico
`resource_profiles` ha **0 righe**: nessuna RLS partner è mai stata verificata
con un utente reale. Tutte le query di questa sessione sono passate dal service
role, che bypassa RLS.

**Le policy partner e client vanno testate con utenti veri prima del rilascio.**
È già segnalato come rischio #3 in `docs/project-engine/12-IMPLEMENTATION_ROADMAP.md`,
con la nota che due volte la guardia applicativa è passata mentre il DB lasciava fare.
