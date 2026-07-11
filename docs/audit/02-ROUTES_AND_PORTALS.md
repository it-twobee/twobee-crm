# 02 — Routes & Portals

> Ogni rotta con `page.tsx` in `app/`, il portale, i ruoli, le tabelle principali,
> lo stato e il valore. Stato: ✅ maturo · 🟢 funzionale · ⚠️ parziale/da verificare.

## Portale Admin — `app/(dashboard)/`

| Rotta | Ruoli | Tabelle principali | Azioni/API | Stato | Note |
|---|---|---|---|---|---|
| `/dashboard` | admin | clients, projects, tasks, invoices, deals, objectives, kpis | dashboard-config, executive-brief, ai/dashboard-chat | ✅ | 17 query parallele + grid |
| `/clienti` · `/clienti/[id]` | admin | clients, projects, client_kpis, invoices, documents, client_knowledge | delete-client, client-knowledge | ✅ | tab: Panoramica/KPI/Fatture/Doc/Anagrafica/Relazione |
| `/clienti/[id]/progetto/[projectId]` | admin | projects, sprints, tasks, task_assignees, project_comments, project_appointments | task-assignees, project-channels, ai/generate-plan | ✅ | ProjectPageClient (2191 righe) |
| `/progetti` · `/portfolio` | admin | projects, portfolios, portfolio_projects | — | 🟢 | portfolio con pattern suggeriti |
| `/le-mie-attivita` | admin | tasks, task_assignees, projects | task-assignees, reparti | ✅ | 5 viste (bacheca dnd, timeline…) |
| `/workload` | admin, manager | projects, tasks, task_assignees, profiles | workload-tasks, task-assignees | 🟢 | **nuovo**; editing gated al PM |
| `/calendario` | admin | project_appointments, tasks, google_credentials | google/events | 🟢 | agende colleghi, privacy "Occupato" |
| `/chat` | admin | chat_channels, chat_messages, chat_dm_participants, chat_best_ideas | chat-dm, project-channels | ✅ | 4 gruppi |
| `/commerciale` | admin | deals, leads, quotes, proposals | quote-builder, proposals, lead-notify | 🟢 | deal + preventivi |
| `/fatturazione` | admin | invoices, clients | — | ⚠️ | 0 fatture nel DB |
| `/controllo-gestione` | founder+ | resource_costs, project_cost_entries, business_costs, invoices | resource-costs, ai/margin-analysis | ⚠️ | **dati economici sensibili** |
| `/soldi/costi-risorse` | founder+ | resource_costs | resource-costs | ⚠️ | sensibile |
| `/customer-care` · `/customer-care/tickets` | admin | chat_channels(customer_care), tickets, ticket_messages | ticket-chat, cc-ai | 🟢 | |
| `/hr` · `/hr/timesheet` | admin | hr_requests, employee_contracts, team_leaves, time_entries | — | ⚠️ | 0 hr_requests |
| `/reparti` · `/reparti/[dept]` | admin | tasks, task_templates, dept_ai_chats | reparti, reparti/ai-suggest | 🟢 | growth/marketing/digital/ai |
| `/strategia` | admin, manager | objectives, key_results, roadmap_items, strategic_notes | decisions | 🟢 | OKR |
| `/direzione/roadmap` · `/direzione/decision-center` | super_admin | roadmap_items, decisions | decisions | 🟢 | **nuovo** |
| `/twobee-os` | super_admin | os_phases, os_tasks, os_backlog_items, os_ideas | os, os-tasks, os/* | 🟢 | meta-gestione dev |
| `/feedback` | admin | feedback, feedback_votes | feedback | 🟢 | |
| `/impostazioni` · `/impostazioni/profilo` · `/impostazioni/cronologia` | admin | profiles, role_permissions, activity_log | admin-user, restore-entity | ✅ | cronologia = activity_log |
| `/operativa` · `/task` · `/timeline` | admin | tasks | — | ⚠️ | possibili doppioni di le-mie-attivita/workload (vedi 13) |
| `/portale-cliente` · `/portale-cliente/[id]` | super_admin | clients, projects | invite-client | 🟢 | anteprima portale cliente |

## Portale Operativo — `app/(workspace)/workspace/`

| Rotta | Tabelle | Note |
|---|---|---|
| `/workspace` | tasks, projects, hr_requests, personal_documents | dashboard risorsa |
| `/workspace/attivita` | tasks, task_assignees | le mie attività |
| `/workspace/calendario` | project_appointments, google_credentials | |
| `/workspace/progetti` · `/[projectId]` | projects, tasks | scoped a chi è assegnato |
| `/workspace/portfolio` | projects | **no dati economici** (vista ristretta) |
| `/workspace/workload` | projects, tasks, task_assignees | risorsa vede i suoi; admin/manager tutto |
| `/workspace/documenti` | documents | filtrati per visibility |
| `/workspace/clienti` · `/[id]` | clients, projects | lettura (migration 092) |
| `/workspace/customer-care` · `/tickets` | tickets | |
| `/workspace/hr` | hr_requests | ferie/permessi/spese |
| `/workspace/buste-paga` | payslips | **owner-only + signed URL** |
| `/workspace/documenti-personali` | personal_documents | owner-only, scadenze |
| `/workspace/cronologia` | activity_log | proprie attività |
| `/workspace/profilo` | profiles, google_credentials | dati, Google, tema |
| `/workspace/chat` → redirect | — | disattivata (solo customer care) |
| `/workspace/task` → redirect | — | vista globale disattivata |

## Portale Cliente — `app/portale/`
Un solo `page.tsx` → `ClientPortalView` a tab (Panoramica, Progetti, Da fare,
Aggiornamenti, Chat, Documenti, Report, Fatture). Filtro per `client_assignments`.
🔴 **`client_assignments` = 0 nel DB**: nessun cliente reale può entrare oggi.

## Portale Risorsa — `app/risorsa/`
`/risorsa`, `/risorsa/attivita`, `/risorsa/progetti`, `/risorsa/documenti`,
`/risorsa/timesheet`. Il più snello; nessun profilo/doc-personali/tema. Vedi `09`.

## Osservazioni trasversali
- **Possibili doppioni** (candidati a MERGE/HIDE, vedi 13): `/task`, `/operativa`,
  `/timeline` vs `/le-mie-attivita` + `/workload`.
- **Rotte a dato zero** (⚠️ non un bug, ma vuote in demo): fatturazione, hr,
  commerciale — dipendono dal popolamento.
