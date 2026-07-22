# 10 — Matrice permessi e visibilità

## Ruoli

`ADMIN_ROLES` = super_admin, founder, admin → `role='admin'`
`WORKSPACE_ROLES` = manager, senior, junior, stage, freelance, partner → `role='team'`
Cliente = client, guest → `role='client'`
Risorsa esterna = guest + `resource_profiles.can_access_resource_portal`

Fonte unica: `coarseRole()` in `lib/permissions.ts`.

## Matrice

| Dato | admin | team | partner | cliente |
|---|---|---|---|---|
| Progetto: nome, stato, fasi | ✅ | ✅ | solo il proprio work package | vista semplificata |
| Task di progetto | ✅ | ✅ | solo del proprio WP | solo `is_client_task` |
| Routine Growth | ✅ | ✅ | ❌ | ❌ |
| Startup Growth | ✅ | ✅ | ❌ | vista "Avvio" |
| Planning Cycle | ✅ | ✅ lettura | ❌ | ❌ |
| Iniziative | ✅ | ✅ | ❌ | elenco semplificato |
| Ad hoc cliente | ✅ | ✅ | ❌ | solo `is_client_task` |
| `estimated_hours` / effort | ✅ | ✅ | proprio WP | ❌ |
| Costo work package partner | ✅ | ❌ | ❌ | ❌ |
| `revenue_streams`, fatture, margini | ✅ | ❌ | ❌ | solo proprie fatture |
| Service Catalog | ✅ scrittura | ✅ lettura | ❌ | ❌ |
| Data stimata vs desiderata | ✅ entrambe | ✅ entrambe | ❌ | **da decidere** |

## Il partner: la parte più delicata

`resource_profiles` (068) ha i flag giusti (`can_view_project_context`,
`can_view_client_context`, `can_view_own_compensation`) ma **0 righe**: non è mai
stata esercitata con dati veri.

Regole da scrivere **in RLS, non in UI**:

1. task visibili solo se `work_package_id` appartiene a un WP del partner
2. `project_work_packages.agreed_cost` invisibile al partner (colonna esclusa via
   VIEW, come `clients_workspace` per l'MRR)
3. nome cliente visibile solo se `can_view_client_context`
4. nessun accesso a `revenue_streams`, `invoices`, `project_cost_entries`
5. nessun accesso alle task fuori dal proprio WP, nemmeno in lettura

**Lezione da questa sessione**: nascondere in UI non è una barriera. Due volte
oggi la guardia applicativa è passata mentre il database lasciava fare — con
`IF NOT is_staff()` che non scattava su NULL. La verifica va fatta con un utente
partner reale, non col service role.

## Portale cliente (§26)

Growth → `Avvio · Attività in corso · Iniziative · Risultati · Cosa ci serve da
te · Aggiornamenti`
Digital → `Stato · Fasi · Prossima consegna · Test da fare · Task cliente ·
Aggiornamenti`
Marketing → `Richieste · Lavorazioni · Consegne · Revisioni`

Il cliente **non vede mai**: routine interne di controllo, costi, marginalità,
effort, note interne, task private, partner non autorizzati.
