# TWO BEE Gestionale — Contesto Claude Code

## Stack & architettura
- **Next.js 14** App Router, TypeScript strict, Tailwind CSS
- **Supabase** PostgreSQL + Auth + RLS (`@/lib/supabase/server` server-side, `@/lib/supabase/client` client-side, `@/lib/supabase/admin` service role)
- **UI**: design token light/dark (vedi «Design system» sotto); Radix UI; lucide-react; sonner toast
- **AI**: Groq `llama-3.3-70b-versatile` via fetch — chiave `GROQ_API_KEY` server-side
- **Charts**: Recharts (client), SVG inline (server/report)
- **Dashboard grid**: react-grid-layout/legacy — layout in localStorage (`twobee-dash-layout-v3`)

## Comandi
```bash
npm run dev    # :3000
npm run build
npm run lint
```

## Struttura cartelle
```
app/(dashboard)/
  dashboard/page.tsx              ← 17 query parallele + DashboardGrid
  clienti/[id]/page.tsx           ← tabs: Panoramica|KPI|Fatturazione|Documenti|Anagrafica|Relazione
  clienti/[id]/progetto/[pid]/    ← ProjectPageClient (tab: Progetto|Appuntamenti|Riunioni|KPI|Aggiornamenti|Chat)
  progetti/page.tsx
  chat/page.tsx                   ← SlackChat globale (da mantenere)
app/actions/
  project-channels.ts             ← ensureProjectChannels() — crea canali con service role (bypassa RLS)
  delete-client.ts                ← elimina client + cascade chat/tasks/projects
components/dashboard/             ← tutti i widget (vedi sezione stato)
components/clients/tabs/          ← PanoramicaTab, KpiTab, AnagraficaTab, ProjectStatusTab…
components/projects/ProjectPageClient.tsx  ← 285 righe: header, tab, orchestrazione
components/projects/board/        ← il board, spezzato: ProgettoView, SprintBlock (da
                                    sostituire con WorkstreamBlock), MilestoneBlock,
                                    TaskRow, BriefPanel, useDragReorder, types.ts
components/chat/SlackChat.tsx     ← componente chat completo (props: channelId, channelType, currentProfile…)
components/progetti/ProgettiClient.tsx     ← CRUD progetti: NewProjectDetailedModal + EditProgettoModal + DeleteConfirmModal
lib/types/database.ts             ← tutti i tipi
app/api/ai/                       ← extract-project, extract-meeting, sprint-plan, kpi-report, project-summary
supabase/migrations/              ← 001–142, tutte applicate. Prossima libera: 143
docs/project-v2/                  ← audit e decisioni della gerarchia V2 (00-DECISIONS.md)
```

## Design system — MAI colori hardcoded
L'app ha tema chiaro e scuro (`[data-theme="light"]` su `<html>`). Ogni colore
passa dai token in `app/globals.css` + `tailwind.config.ts`. Un `#hex`,
un `text-white`, un `bg-red-500` non reagiscono al tema e rompono il contrasto.

**Vietato**: `bg-[#1A1A1A]`, `text-white/40`, `text-red-400`, `text-black`,
`style={{ color: '#F5C800' }}`, `text-[10px]`.

| Serve | Usa |
|---|---|
| sfondo pagina / superficie / hover | `bg-background` `bg-surface` `bg-surface-hover` `bg-surface-active` |
| bordi | `border-border` `border-border-strong` · input/select: `border-border-interactive` |
| testo | `text-text-primary` `text-text-secondary` `text-text-tertiary` |
| **gold come riempimento** (bottone) | `bg-gold` + `text-on-gold` |
| **gold come inchiostro** (testo, icona) | `text-gold-text` |
| stati | `text-success` `text-error` `text-warning` `text-info` `text-accent` `text-orange` (+ `-dim` per i chip) |
| overlay modale | `bg-scrim` |

**I due gold non sono intercambiabili.** `--color-gold` resta vivo in entrambi i
temi perché serve da fondo (nero sopra = 12.4:1). Come testo su bianco farebbe
1.74:1, quindi `--color-gold-text` scurisce in light. Se scrivi `text-gold` il
tema chiaro diventa illeggibile.

- Tipografia: mai sotto `text-2xs` (12px). La scala parte da `text-sm` = 15px.
- Style inline: usa `var(--color-*)`. Per l'alfa niente `${c}18` → `color-mix(in srgb, ${c} 9%, transparent)`.
- Eccezioni legittime: `app/api/**` (HTML standalone senza `:root`), `app/global-error.tsx`
  (fuori dal ThemeProvider), colori brand di terzi (Asana `#F06A35`, Google).
- Ogni interattivo deve avere focus visibile (già globale via `:focus-visible`) e
  `aria-label` se ha solo un'icona.

Verifica: apri la pagina, cambia tema, e controlla il contrasto sul DOM renderizzato
(gli screenshot mentono; le transizioni CSS falsano `getComputedStyle` — disabilitale
con `*{transition:none!important}` prima di misurare).

## Convenzioni codice
- Nessun commento salvo WHY non ovvi
- Cast join Supabase: `as unknown as Type[]`
- `overflow-x-auto` sui wrapper tabella (mai `overflow-hidden`)
- No `<button>` dentro `<button>` — usare `<div onClick>` per wrapper
- Set spread: `Array.from(new Set([...]))` non `[...new Set(...)]`
- Server Action: `'use server'` + `revalidatePath('/path')`

## Gerarchia del Project Management (V2, dal 2026-07-20)

```
Cliente → Progetto → Workstream → Milestone → Task
```

**Gli Sprint sono fuori dalla gerarchia.** `sprints` esiste ancora (0 righe,
mai usata in produzione) e `tasks.sprint_id` pure: entrambi deprecati, nessun
`DROP`. Non scriverci.

**Le Subtask non sono un livello.** `tasks.parent_task_id` resta come
funzionalità accessoria (0 righe) ma non è navigazione: per il lavoro dentro
una task si usa `task_checklist_items`.

Nomi: in DB è `project_workstreams`, **nella UI interna si scrive "Area di
lavoro"**. Nel Portale Cliente la label dipende dal servizio
(`service_catalog.client_workstream_label`: Iniziative / Fasi / Moduli / Aree
organizzative). Vedi `docs/project-v2/` per l'audit e le decisioni.

Quattro assi separati, da non confondere: **servizio** (cosa ha comprato il
cliente) · **linea** (chi lo fa) · **motore** (come si organizza il lavoro) ·
**accordo** (come si guadagna).

## DB — tabelle chiave
- `clients`: `company_name, display_name, legal_name, client_type (growth|digital|growth_digital), package, mrr, client_label, risk_score`
- `projects`: `client_id, name, status, service_line, service_key, delivery_model, growth_vertical, economic_status, manager_id (= PM), project_kind (growth|digital)`. `project_type` e `sprint_current` sono legacy.
- `service_catalog`: catalogo dei 17 servizi — `key, service_line, delivery_engine, default_revenue_model, phases JSONB, milestone_templates JSONB, client_workstream_label`. **Il catalogo propone, il progetto dispone**: il contenuto viene *copiato* sul progetto alla creazione, poi diverge. Cambiare il default aziendale NON aggiorna i progetti esistenti.
- `project_workstreams`: `project_id, name, position, status, owner_id, visibility (internal|client|partner), requires_client_approval, deliverables`
- `workstream_milestones`: `workstream_id, project_id, title, milestone_type (delivery|approval|checkpoint|release|control|recurring_cycle), expected_date, actual_date, approval_required, completion_criteria, visibility`
- `recurring_task_templates`: la **regola**, non l'occorrenza. `project_id, workstream_id, frequency, recurrence_interval, generation_lead_days, is_active, template_key`
- `client_kpis`: KPI mensili, unique `(client_id, month)`
- `chat_channels`: `type (cliente|interno|task|customer_care|cliente_interno|team|dm), client_id, project_id, team_key`
- `chat_messages`: `channel_id, sender_id, content`
- `tasks`: `project_id, client_id, workstream_id, milestone_id, title, status (da_fare|in_corso|in_revisione|completato|richiesta_supporto), task_type, priority, due_date, start_date, visibility, assignee_id (PRIMARIO), routine_id, period_key`. `milestone_id` è **opzionale** (le occorrenze ricorrenti non ne hanno una sensata); `workstream_id` no. `is_milestone` è deprecata.
- `task_checklist_items`: `(task_id, label, done, position)` — sostituisce la subtask
- `task_assignees`: multi-assegnatario `(task_id, profile_id, is_primary_owner, role)`. **Sorgente canonica** dei 0..N assegnatari; `tasks.assignee_id` resta il primario (= primo della lista) perché molte viste lo leggono. Scrivi SEMPRE via `setTaskAssignees`/`bulkSetTaskAssignees` (service role), che tengono i due in sync.
- `objectives`: OKR aziendali con `progress, status`
- `deals`: pipeline commerciale con `stage`

## Autenticazione e ruoli
- `isSuperAdmin()` → `SUPER_ADMIN_EMAILS = ['m.lucci@twobee.it']` OR `app_role === 'super_admin'`
- `marco.d.lucci@gmail.com` = account sviluppo, NON è super admin
- RLS: `get_my_role()` legge `role` da `profiles` (non `app_role`) — admin, team, client, guest
- **`coarseRole(app_role)` in `lib/permissions.ts` è l'unica fonte per `app_role → role`.** Usala in registrazione (invite/accept), cambio ruolo admin e ovunque serva. Non-admin (manager…partner, viewer) → `role='team'` → il middleware li confina a `/workspace`. Non duplicare la mappa.
- INSERT su `chat_channels` richiede `role = 'admin'` → usare sempre `createAdminClient()` server-side

## Pattern ricorrenti
```ts
// Fetch server-side
const { data } = await createClient().from('table').select('*')

// Admin (bypassa RLS)
import { createAdminClient } from '@/lib/supabase/admin'
const { data } = await createAdminClient().from('table').insert({...})

// Groq AI
const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
  body: JSON.stringify({ model: 'llama-3.3-70b-versatile', max_tokens: 1000,
    messages: [{ role: 'system', content: '...' }, { role: 'user', content: '...' }] }),
})
const parsed = JSON.parse((await res.json()).choices?.[0]?.message?.content?.match(/\{[\s\S]*\}/)?.[0] ?? '{}')
```

## Migration (Supabase Dashboard → SQL Editor)
**Non c'è nulla di arretrato: 001–142 sono tutte applicate in produzione**
(verificato sul DB il 2026-07-20). Il prossimo numero libero è **143**.
Attenzione: `080_*`, `081_*`, `092_*` e `109_*` compaiono due volte.

Ogni migration nuova deve essere **additiva e idempotente** (`IF NOT EXISTS`,
`DROP POLICY IF EXISTS` prima di `CREATE POLICY`) e chiudersi con una `SELECT`
di verifica.

⚠️ **Il SQL Editor di Supabase tronca gli incolli lunghi** (blocchi da ~25
caratteri persi, in silenzio). Statement corti, una migration per volta, mai
concatenare: il troncamento diventa un errore di sintassi visibile invece che
una colonna mancante scoperta settimane dopo.

Bucket privati da creare a mano (le migration non li creano): `payslips`,
`personal-documents`, `best-ideas`.

## Workload (`/workload` e `/workspace/workload`)
Vista strategica dei progetti in parallelo: effort (ore stimate, default 4h dove
manca), timeline, carico per risorsa. Stessa `WorkloadClient` per admin e workspace.
`lib/workload.ts` = calcoli puri (l'effort di una task multi-assegnata si **divide**
fra gli assegnatari). Filtri: tipo/cliente/risorsa/periodo. Editing (stato,
riassegnazione, elimina) riservato al **PM** (`projects.manager_id`), al `manager`
di ruolo o all'admin, via `app/actions/workload-tasks.ts` (service role). Nessun
dato economico: è sicuro anche nel workspace.
| `094_private_personal_tasks.sql` | task senza progetto = personali/private: `tasks_team_read_all` ora richiede `project_id IS NOT NULL` (i colleghi non le vedono) | — |
| `096_rls_hardening.sql` | SEC-01: chiude le RLS `USING(true)` (policy lasche droppate per nome) | — |
| `097_data_quality_view.sql` | VIEW read-only `data_quality_report` (widget "Salute Dati") | — |
| `098_time_tracking_consolidation.sql` | TIME-01: `time_entries` = fonte unica; trigger alimenta `tasks.logged_hours`; deprecata `task_time_logs`. **Supera la 050** (esegui solo la 098) | — |
| `099_activity_log_uniform.sql` | LOG-01: trigger audit esteso a `decisions`; RLS `activity_log` ristretta a `is_staff()` (era aperta a tutti) | — |
| `100_workspace_security_rls.sql` | Fase 0 sicurezza Workspace: economici (deals/quotes/proposals/invoices) solo admin; VIEW `clients_workspace` (mrr/fiscali azzerati); drop `clients_team_all` | — |
| `101_task_requests.sql` | Fase 1d: stato task `richiesta_supporto` (ALTER CHECK) + `origin_task_id`/`requested_by` per richieste dirette e supporto | — |
| `102_calendar_events.sql` | Fase 2b: mirror `calendar_events` (link cliente/progetto, external_event_id, sync_status) + colonne watch channel su `google_credentials` | — |
| `103_workload_portfolio.sql` | Fase 3: `tasks.start_date` + `profiles.weekly_capacity_hours` (default 40) per intensità reale; disattiva voce sidebar `progetti` (→ Workload) | — |
| `104_workload_sidebar_position.sql` | Sidebar: "Workload" tra "Le mie attività" e "Calendario" (riordino sort_order) | — |
| `105_client_names.sql` | Fase 4a: `clients.display_name` (nome visualizzato, backfill da company_name) + `legal_name` (ragione sociale); aggiorna la VIEW `clients_workspace` | — |
| `109_item_views.sql` | Operatività Fase 1: `item_views(profile_id,item_id,item_type,seen_at)` RLS own-only per il badge "Nuovo" per-utente + aggiunge `sprints.created_at` (backfill da start_date) | — |

**Scorciatoia**: `supabase/APPLY_PENDING.sql` è il concatenato (081, 086–093) in
transazione, da incollare una volta sola nel SQL Editor. Bucket privati da creare
a mano: `payslips`, `personal-documents`, `best-ideas`. Le env Google
(`GOOGLE_CLIENT_ID/SECRET`, `NEXT_PUBLIC_APP_URL`) sono già presenti.

Finché non le esegui l'app **non si rompe**: le pagine mostrano `SetupNotice`
e le funzioni nuove degradano con un messaggio. I bucket vanno creati a mano
(le migration non li creano).

## Architettura portali
- **Admin** (`/dashboard`, tutto): `super_admin`, `founder`, `admin`.
- **Workspace** (`/workspace/**` e nient'altro): `manager`, `senior`, `junior`, `stage`, `freelance`, `partner`.
- **Cliente** (`/portale/**`): `client`, `guest` non-risorsa.
- **Risorsa esterna** (`/risorsa/**`): `guest` con `resource_profiles.can_access_resource_portal`.

Il gate è in `middleware.ts` **e** nei layout: nascondere una voce di menu non è
una barriera. I gruppi di ruolo stanno in `lib/permissions.ts`
(`ADMIN_ROLES` / `WORKSPACE_ROLES`), unica fonte di verità: non riscriverli inline.

Solo il super admin vede `PortalSwitcher` e può entrare in `/portale` (in anteprima,
scegliendo il cliente da `?client=<id>`).

## Chat — quattro gruppi
`Team` (canali `type='team'`: `team-intern`, `angolo-informativo`, `best-ideas`) ·
`Progetti` (un solo canale interno per progetto) · `Messaggi diretti` (`type='dm'`,
partecipanti in `chat_dm_participants`, leggibili **solo** dai due, nemmeno dall'admin).

Il **Customer Care non sta più nella chat**: i canali `customer_care`/`cliente` esistono
ancora e li usa `/customer-care`. La chat li esclude a monte, non li cancella.
`#best-ideas` non è una chat: è un raccoglitore (`chat_best_ideas`).

## Calendario e Google
I token stanno in `google_credentials` (RLS deny-all, solo service role).
**Mai** in `user_metadata`: il client dell'utente lo legge e lo riscrive.
`/api/google/events?profileIds=a,b` legge le agende dei colleghi; degli eventi
altrui espone solo `"Occupato"` — niente titolo, descrizione o partecipanti.
Le task del calendario sono personali e nascoste di default.

## Stato attuale — widget dashboard
| Widget | Componente | Stato |
|---|---|---|
| Company Pulse | `CompanyPulse` + `KpiCards` + `RevenueChart` | ✅ attivo, ~50% doc |
| Client Health | `ClientsRiskPanel` | ✅ attivo, semplificato |
| Delivery Radar | `ProgettiWidget` + `TasksDue` | ✅ attivo, parziale |
| Team Capacity | `WorkloadPanel` | ✅ attivo, base |
| Risk/Alerts | `SmartInsights` + `AlertCenter` | ✅ attivo, rule-based |
| Founder Focus | `DailyFocus` | ✅ attivo |
| AI Chat | `AIDashboardChat` | ✅ attivo |
| Margin Radar | `MarginRadar` | ✅ attivo |
| Decision Center | `DecisionCenter` | ✅ attivo |
| Financial Control aggregato | `FinancialControl` | ✅ attivo |
| Sales Pipeline widget | `SalesPipeline` | ✅ attivo |
| Strategic Objectives widget | `StrategicObjectives` | ✅ attivo |
| AI & Automation Center | `AIAutomationCenter` | ✅ attivo |
| Revenue Scorecards | `RevenueScorecards` | ✅ attivo |
| AI Executive Brief | `SmartInsights` (approssimazione) | ⚠️ parziale |
| Growth Performance aggregato | — | ❌ solo in tab cliente |

## Task ricorrenti — la regola da non rompere
Le ricorrenze si generano da `recurring_task_templates`; ogni occorrenza è una
task reale con `routine_id` + `period_key`.

**`uq_tasks_routine_period` — UNIQUE(routine_id, period_key) — è ciò che
impedisce le occorrenze doppie.** La garanzia sta nel database, non nel codice
che genera: non toglierla, non rinominare quelle due colonne, e non aggirarla
con un controllo applicativo "tanto è più veloce". È l'unica parte del motore
già in produzione (27 task generate) e regge da sola l'idempotenza.

## Stato della migrazione V2 (2026-07-20)
Fatto: schema (138–142), split del board, allineamento del codice ai rename.

Da fare, nell'ordine:
1. **Board su Workstream → Milestone → Task**: `WorkstreamBlock` sostituisce
   `SprintBlock`, `MilestoneBlock` passa da `tasks.is_milestone` a
   `workstream_milestones`, sparisce la tab "Fasi" (era il Workstream sotto
   altro nome). *Questo passo elimina gli Sprint dalla UI per costruzione:
   non farlo in due tempi, o l'app ha due modelli di milestone insieme.*
2. Riadattare `SprintTimeline`, `ProjectGantt`, `AiPlanBuilder` (consumano sprint)
3. **Wizard a 10 step** + riscrittura di `create_project_from_wizard` (migration 143)
   e chiusura degli altri 10 punti di creazione progetto
4. Workload: filtri e timeline a 4 livelli
5. Portali: Workspace, Cliente (label per servizio), Risorsa
6. Pilota end-to-end su Social Media Management + **verifica RLS con utenti veri**

⚠️ Il service role bypassa le RLS: le policy `partner` e `client` non sono mai
state provate con un utente reale (`resource_profiles` ha 0 righe). Testarle con
il service role non prova niente.

## Regole di risposta
- Zero preamboli. Vai dritto a codice.
- Spiega solo se non ovvio o richiesto.
- Una sola soluzione proposta salvo richiesta esplicita.
- Modifica solo le righe necessarie.
- Niente riassunti: una riga di conferma basta.
- Leggi solo le righe rilevanti del file.
- TypeScript: zero errori al primo tentativo.
- Non chiedere conferma per modifiche non distruttive.
