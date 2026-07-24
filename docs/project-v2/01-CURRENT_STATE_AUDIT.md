# 01 — Current State Audit

> Fonte di verità: codice del branch `refactor/reset-project-domain` + migration
> `144/145/146` (dichiarate **eseguite** in produzione il 2026-07-24).
> Audit read-only. Nessun accesso diretto al DB da CLI: lo stato DB è ricostruito
> dalle migration + tipi, non da query live. I punti non verificabili senza query
> sono marcati **[DA VERIFICARE IN SQL]**.

## 0. TL;DR

Il reset è **pulito**. Il vecchio flusso progetto (Cliente→Progetto→Sprint→
Milestone→Task), Workload, Portfolio, economics, commerciale, strategia/OKR,
TwoBee OS, reparti sono stati rimossi **sia dal codice sia dal DB**. Non ci sono
riferimenti orfani a tabelle droppate nel codice applicativo. **Non esistono oggi
Portale Cliente né Portale Risorsa**: le uniche due esperienze vive sono il
**Portale Admin** (`/dashboard`, `(dashboard)`) e il **Workspace** (`/workspace`).
Si costruisce quindi su terreno vergine: i nomi tabella del nuovo modello
(`projects`, `project_workstreams`, `milestones`, `tasks`, `task_assignees`,
`recurring_task_templates`) sono **liberi** — erano stati droppati, non esistono
più conflitti di FK/policy.

---

## 1. Tabelle progettuali ancora presenti

**Nessuna.** La migration 144 ha droppato con `CASCADE`:

`tasks, projects, sprints, project_workstreams, workstream_milestones,
recurring_task_templates, growth_initiatives, service_catalog, task_assignees,
task_checklist_items, task_comments, task_dependencies, task_templates,
task_time_logs, task_block_reports, task_deletion_requests, time_entries,
project_appointments, project_comments, project_cost_entries, meeting_notes,
approvals, portfolios, portfolio_clients, portfolio_projects`.

La 145 ha droppato economics/commerciale/strategia/OS:
`revenue_streams, revenue_milestones, invoices, quotes, proposal_documents,
client_economics, business_costs, resource_costs, deals, deal_activities, leads,
lead_contacts, objectives, key_results, decisions, strategic_notes,
company_targets, roadmap_items, os_tasks, os_phases, os_backlog_items, os_ideas,
onboarding_steps`.

Entrambe le migration terminano con una `SELECT` di verifica che deve tornare 0
righe. **[DA VERIFICARE IN SQL]** eseguire le due SELECT finali per conferma.

### Tabelle superstiti (dominio vivo)
- **Clienti**: `clients` (+ satelliti: `client_contacts`, `client_stakeholders`,
  `client_assignments`, `client_kpis`, `client_kpi_config`, `client_notes`,
  `client_competitors`, `client_ideas`, `client_knowledge`, `client_interactions`,
  `client_integrations`, `client_accounts`).
- **Chat**: `chat_channels` (ora solo `team`/`dm`/`customer_care`/`cliente`),
  `chat_messages`, `chat_dm_participants`, `chat_best_ideas`, `channel_members`,
  `channel_guests`.
- **Customer Care**: `tickets`, `ticket_messages`.
- **HR**: `team_leaves`, `performance_reviews`, `employee_contracts`,
  `vacation_balances`, `hr_requests`, `payslips`, `personal_documents`.
- **Calendario**: `calendar_events`, `google_credentials`.
- **Documenti**: `documents`.
- **Feedback**: `feedback`, `feedback_votes`.
- **Piattaforma**: `profiles`, `resource_profiles`, `org_units`, `org_members`,
  `role_permissions`, `profile_permissions`, `workspace_sections`,
  `workspace_section_permissions`, `notifications`, `activity_log`, `invitations`.

> Le colonne FK verso il dominio morto sono già state rimosse dalla 146:
> `chat_channels.project_id/task_id`, `calendar_events.project_id`,
> `client_integrations.project_id`, `client_kpi_config.project_id`,
> `client_kpis.project_id`, `documents.project_id`. I KPI sono tornati **mensili
> per cliente** (`UNIQUE(client_id, month)`).

---

## 2. Componenti progettuali ancora presenti

**Nessun componente di progetto/task/sprint/workload superstite.** Il commit
`57708d1` ha eliminato 203 file (~44k righe): tutte le cartelle
`components/projects/`, `components/progetti/`, `components/workload/`,
`components/dashboard/*` legacy, i tab progetto in `components/clients/tabs/`
(ProjectStatusTab, KpiTab-per-progetto, RelazioneTab, DocumentsTab…).

**Working tree non committato** (in corso): riduce la scheda cliente a
`Panoramica + Anagrafica`, eliminando `KpiTab`, `DocumentsTab`, `RelazioneTab`,
`ClientKnowledgeTab`, `client-knowledge.ts`, `NewBadge`, `useSeen.tsx`. → va
committato o annullato prima di iniziare (vedi doc 02).

Componenti **riutilizzabili** per il nuovo motore: `SlackChat` (chat), il sistema
di token design light/dark, `AnagraficaTab`/`PanoramicaTab` come reference di
layout cliente, i pattern `createAdminClient()` / Server Action.

---

## 3. Route ancora presenti

Admin `(dashboard)`: `dashboard, clienti, customer-care, documenti, calendario,
chat, feedback, hr, impostazioni`. **Nessuna** rotta `progetti/`, `workload/`,
`portfolio/`, `commerciale/`, `fatturazione/`, `controllo-gestione/`,
`strategia/`, `direzione/`, `twobee-os/`, `reparti/`, `portale-cliente/`.

Workspace `(workspace)/workspace`: `clienti, customer-care, documenti,
documenti-personali, buste-paga, calendario, chat, cronologia, feedback, hr,
profilo`. **Nessuna** `progetti/`, `portfolio/`, `workload/`, `task/`,
`attivita/` (le pagine sono state rimosse; le voci sidebar sono spente, vedi §8).

**Non esiste** `app/(portale)`, `app/portale`, `app/risorsa`. → Portale Cliente e
Portale Risorsa vanno costruiti da zero (coerente con l'addendum).

---

## 4. Dipendenze dagli Sprint

**Zero.** Nessun riferimento a `sprints`, `sprint_id`, `sprint_current` nel
codice applicativo. La 146 verifica esplicitamente che non esistano colonne
`sprint_id` residue. Gli Sprint **non vanno reintrodotti** (vincolo del prompt).

---

## 5. Dipendenze dal vecchio Workload

**Zero nel codice.** `app/(dashboard)/workload`, `app/(workspace)/workspace/workload`,
`components/workload/*`, `lib/workload.ts`, `app/actions/workload-*.ts` sono stati
eliminati. Il Workload è stato rimosso **sia da UI sia da codice** (non solo
nascosto). La voce sidebar workspace `workload` è disattivata (§8). → da NON
ricreare in questa fase; il nuovo schema deve però restare predisposto a un futuro
modulo Capacity (campi `estimated_hours`, `weekly_capacity_hours` da prevedere).

---

## 6. CTA che usano il vecchio modello

**Nessuna CTA "Nuovo progetto / task / sprint" residua.** `GlobalSearch` e
`global-search.ts` sono stati ripuliti dalle entità morte. → tutte le CTA del
nuovo motore partono da zero.

---

## 7. Dati legacy ancora presenti

- **DB**: dopo 144/145 le tabelle sono droppate → nessun dato progettuale live.
  **[DA VERIFICARE IN SQL]** conferma con le SELECT finali delle migration.
- **Backup**: JSON di 47 tabelle in `supabase/backup/2026-07-22-pre-reset/`
  (tasks 35, os_tasks 121, service_catalog 17, revenue_streams 12, ecc.) +
  branch `archive/project-v2-wip` (codice V2 completo, migration 115–143).
  → recuperabile se serve seed/riferimento tassonomia.

---

## 8. RLS e permessi esistenti

- `coarseRole(app_role)` in `lib/permissions.ts` = unica mappa `app_role → role`
  (`admin|team|client|guest`). Gruppi: `ADMIN_ROLES=[super_admin,founder,admin]`,
  `WORKSPACE_ROLES=[manager,senior,junior,stage,freelance,partner]`,
  `CLIENT_ROLES=[client]`, `EXTERNAL_ROLES=[freelance,partner]`.
- `get_my_role()` legge `profiles.role` (non `app_role`).
- INSERT su `chat_channels` richiede `role='admin'` → sempre `createAdminClient()`.
- **Effetto collaterale del reset**: la 146 ha droppato `get_my_project_ids()` con
  `CASCADE`, che ha portato via la policy `clients_external` su `clients`. → le
  risorse esterne (guest) **non hanno più accesso ai clienti** finché non si
  ridisegna la visibilità. Da riprogettare col Portale Risorsa/Cliente.
- **VERIFICATO IN SQL (2026-07-24)** — policy su `clients`:
  - `clients_admin_all` (ALL): `get_my_role()='admin'`.
  - `clients_client_own` (SELECT): `get_my_role() IN ('client','guest') AND id = <proprio client>`.
  - `clients_team_all` (SELECT): `get_my_role()='team' AND NOT is_external_resource()`.
  - → `clients_external` **è caduta** (confermato). I ruoli team **interni** vedono
    tutti i clienti; gli **esterni** (guest/freelance/partner flaggati) hanno solo
    la propria riga cliente, non i clienti dei progetti a cui sono assegnati = gap
    da chiudere nella fase portali.
  - VIEW `clients_workspace` **sopravvive** (mrr/fiscali azzerati) → riusabile per
    Workspace e Portale Cliente.
- Le policy delle tabelle nuove (`projects`, `tasks`, ecc.) **non esistono**:
  vanno scritte da zero nella matrice del doc 10.

---

## 9. Componenti riutilizzabili

`SlackChat`, token design light/dark (`app/globals.css` + `tailwind.config.ts`),
pattern Server Action + `revalidatePath`, `createAdminClient()`,
`ensureX()` service-role, `WorkspaceSidebar` (config-driven da `workspace_sections`),
`Sidebar` admin (array-driven), `AnagraficaTab`/`PanoramicaTab` come reference UI,
`calendar_events` + `google_credentials` per il calendario progetto.

## 10. Componenti da deprecare

Nel working tree corrente: nessuno da "deprecare", solo da **committare** la
riduzione della scheda cliente. Tipi orfani da ripulire (doc 02).

---

## 11. Rischi tecnici

1. **Working tree sporco**: 13 file non committati. Iniziare il nuovo motore su un
   albero sporco confonde la storia. → committare/azzerare prima.
2. **Visibilità clienti per esterni azzerata**: la policy `clients_external` è
   caduta. I ruoli guest non vedono clienti. Va riprogettata contestualmente al
   Portale Risorsa/Cliente, non dopo.
3. **Tipi orfani in `database.ts`**: `LeadContact`, `LeadContactSource/Status`
   (tabella droppata), `PermissionSection` include ancora `fatturazione`/`task`,
   `NotificationType` include `task_assigned`/`task_due`. Innocui ma fuorvianti.
4. **Numerazione migration**: si salta 114 → 144. Le 115–143 vivono solo su
   `archive/project-v2-wip`. Il prossimo numero libero su questo branch è **147**.
   ⚠️ Il prompt cita migration "144–146" per il reset: già usate. Il nuovo schema
   parte da **147**.
5. **`workspace_sections`**: `progetti/portfolio/task/mie_attivita/workload/cestino`
   sono `is_active=false`. Vanno **riattivate/ricreate** con le nuove route quando
   il motore esiste, non prima (altrimenti voci morte).
6. **RLS da riscrivere da zero** per tutte le entità nuove: è la parte a più alto
   rischio sicurezza (dati economici, visibilità cliente). Richiede la matrice
   del doc 10 prima di scrivere SQL.
7. **KPI ora per-cliente**: se il nuovo modello vuole KPI per-progetto, serve una
   nuova tabella/colonna, non riusare `client_kpis` (tornata `UNIQUE(client_id,month)`).

---

## 12. Impatto su Admin, Workspace e Portale Cliente

- **Admin**: guadagna sezione globale `/progetti` + wizard + dominio progetto +
  `/clienti/[id]/progetti`. Sidebar admin da estendere (array in `Sidebar.tsx`).
- **Workspace**: riattivare `Le mie attività` + `Progetti` (+ Calendario già
  presente), lette dagli stessi dati con RLS scoped; niente dati economici.
- **Portale Cliente / Risorsa**: **non esistono** → nuovi layout, middleware,
  route, RLS. È il lavoro più grande dell'addendum.

---

## 13. Piano di sostituzione (alto livello — dettaglio nel doc 12)

1. Schema nuovo (147+): projects → workstreams → milestones → tasks +
   assignees + recurring templates + RLS.
2. Service taxonomy + template configurabili (Service Catalog v2).
3. Wizard progetto condiviso (atomico).
4. Dominio progetto (Admin) + `/progetti` globale + tab in cliente.
5. Task management (drawer unico, viste lista/board/timeline/calendario).
6. Workspace (Le mie attività / Progetti) sugli stessi dati.
7. Portale Risorsa (nuovo) → Portale Cliente (nuovo).
8. Stabilizzazione (RLS, ruoli, build, typecheck).

---

## 14. Domande bloccanti

Vedi risposta in chat (sezione "Domande bloccanti"): 20 dal prompt principale +
15 dall'addendum, consolidate. Le più critiche per lo schema:
`milestone_id` obbligatoria vs opzionale, nome del portale operativo
(Workspace vs Portale Risorsa), label UI di `workstream`, scope MVP Asana.
