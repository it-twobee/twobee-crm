# 03 — Database Relation Map

> 87 tabelle in `public`. Classificate per dominio, con sensibilità e relazioni
> centrali. Fonte: migration `supabase/migrations/*` + introspezione volumi live.

## Gerarchia centrale (FK verificate)
```
clients (12)
 └─ projects (4)            projects.client_id → clients.id ; projects.manager_id → profiles.id
     └─ sprints (4)         sprints.project_id → projects.id
         └─ tasks (46)      tasks.project_id → projects.id ; tasks.sprint_id → sprints.id
             │              tasks.parent_task_id → tasks.id (subtask) ; tasks.assignee_id → profiles.id
             └─ task_assignees (3)   (task_id, profile_id) multi-owner, is_primary_owner
```
**Nota dati:** `tasks.sprint_id` popolato solo 1/38; `parent_task_id` 0/46 →
i livelli Sprint e Subtask esistono nello schema ma sono **quasi inutilizzati**.

## Classificazione per dominio

### core
`clients`, `projects`, `sprints`, `tasks`, `task_assignees`, `profiles`,
`milestones`(= tasks con `is_milestone`), `task_dependencies`, `task_followers`,
`task_templates`, `subtasks`(= tasks con `parent_task_id`).

### operational
`task_comments`, `task_attachments`, `task_block_reports`, `task_deletion_requests`,
`task_time_logs`, `time_entries`, `project_comments`, `project_appointments`,
`project_cost_entries`, `meeting_notes`, `approvals`, `onboarding_steps`,
`activity_log` (768 righe — audit trail), `notifications`.

### commercial
`deals`, `deal_activities`, `leads`, `lead_contacts`, `quotes`, `proposals`,
`proposal_documents`, `client_interactions`, `client_contacts`, `client_stakeholders`.

### financial 🔒 (founder/super_admin)
`invoices`, `resource_costs`, `business_costs`, `project_cost_entries`, `payslips`.

### HR 🔒
`hr_requests`, `employee_contracts`, `team_leaves`, `performance_reviews`,
`personal_documents`, `payslips`.

### communication
`chat_channels`, `chat_messages`, `chat_dm_participants`, `chat_best_ideas`,
`chat_attachments`, `chat_mentions`, `chat_bridge_events`, `channel_members`,
`channel_guests`, `message_reactions`, `ticket_portals`, `tickets`, `ticket_messages`,
`dept_ai_chats`.

### document
`documents`, `client_knowledge`, `client_notes`.

### strategy
`objectives`, `key_results`, `roadmap_items`, `strategic_notes`, `decisions`,
`os_phases`, `os_tasks`, `os_backlog_items`, `os_ideas`.

### client-relationship / KPI
`client_kpis`, `client_kpi_config`, `client_accounts`, `client_assignments`,
`user_client_assignments`, `portfolios`, `portfolio_projects`, `portfolio_clients`.

### system / integration
`role_permissions`, `profile_permissions`, `workspace_sections`,
`workspace_section_permissions`, `org_units`, `org_members`, `resource_profiles`,
`invitations`, `google_credentials` 🔒, `ai_logs`.

## Tabelle sensibili (livello dati)
| Tabella | Sensibilità | Chi deve leggere |
|---|---|---|
| `resource_costs`, `business_costs`, `project_cost_entries` | 🔴 alta | founder/super_admin |
| `invoices`, `quotes`, `proposals` | 🔴 alta | admin (cliente: le proprie) |
| `payslips`, `employee_contracts`, `performance_reviews` | 🔴 alta | owner + admin |
| `personal_documents` | 🟠 media | owner + admin |
| `google_credentials` | 🔴 token | **solo service role (deny-all)** |
| `chat_dm_participants` / DM | 🟠 media | solo i 2 partecipanti |
| `client_interactions`, `client_notes`, `client_knowledge` | 🟠 media | staff |

## Anomalie schema rilevate
1. **Doppioni concettuali di assegnazione**: `client_assignments`,
   `user_client_assignments`, `client_accounts` — verificare quale è la fonte
   canonica del legame cliente↔utente (il portale cliente usa `client_assignments`,
   oggi **vuota**).
2. **Doppioni di time tracking**: `time_entries` (assente/errore in query) vs
   `task_time_logs` (0) vs `tasks.logged_hours`. Serve una fonte unica.
3. **Milestone e Subtask non sono tabelle**: sono `tasks` con flag/parent. Coerente,
   ma la UI deve renderli distintamente (vedi `05`).
4. Numeri migration duplicati (`080/081/092`).

## Colonne chiave sotto-utilizzate
- `projects.manager_id` → **0/4 popolato** (blocca editing Workload nel workspace).
- `tasks.estimated_hours` → **0/38** (Workload approssima a 4h).
- `tasks.sprint_id` → 1/38 · `tasks.parent_task_id` → 0/46.
- `clients.is_internal` → 0/12 (i clienti interni non sono marcati).
