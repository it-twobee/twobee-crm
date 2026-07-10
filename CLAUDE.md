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
components/projects/ProjectPageClient.tsx  ← 2980 righe, tab Chat con ProjectChatSection
components/chat/SlackChat.tsx     ← componente chat completo (props: channelId, channelType, currentProfile…)
components/progetti/ProgettiClient.tsx     ← CRUD progetti: NewProjectDetailedModal + EditProgettoModal + DeleteConfirmModal
lib/types/database.ts             ← tutti i tipi
app/api/ai/                       ← extract-project, extract-meeting, sprint-plan, kpi-report, project-summary
supabase/migrations/              ← 001–091 (086–091 da eseguire, vedi sotto)
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

## DB — tabelle chiave
- `clients`: `company_name, client_type (growth|digital|growth_digital), package, mrr, client_label, risk_score`
- `projects`: `client_id, name, status, project_type, project_kind (growth|digital), sprint_current`
- `client_kpis`: KPI mensili, unique `(client_id, month)`
- `chat_channels`: `type (cliente|interno|task|customer_care|cliente_interno|team|dm), client_id, project_id, team_key`
- `chat_messages`: `channel_id, sender_id, content`
- `tasks`: `project_id, title, status (da_fare|in_corso|completato), is_milestone, due_date, assignee_id (PRIMARIO)`
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

## Migration da eseguire (Supabase Dashboard → SQL Editor)
`chat_channels.project_id` **esiste** in produzione: il vecchio "BUG NOTO" è risolto.
Numerazione: attenzione, `080_*`, `081_*` e `092_*` compaiono due volte. Il prossimo libero è **096**.

| # | Cosa fa | Serve anche |
|---|---|---|
| `086_decisions.sql` | ALTER su `decisions` (la 044 l'aveva già creata: NON ricrearla) | — |
| `087_workspace_groups_sections.sql` | `group_key`/`group_order` + sezioni workspace nuove | — |
| `088_payslips.sql` | Buste paga, RLS owner-only | bucket **privato** `payslips` |
| `089_personal_documents.sql` | Documenti personali con scadenze | bucket privato `personal-documents` |
| `090_chat_rework.sql` | canali `team`/`dm`, `chat_dm_participants`, `chat_best_ideas` | bucket `best-ideas` |
| `091_google_credentials.sql` | token Google fuori da `user_metadata` | ricollegare Google una volta |
| `092_workspace_team_read_all.sql` | i ruoli `team` (manager…partner) leggono TUTTI clienti/progetti/task (scrittura task resta scoped) | — |
| `093_feedback.sql` | tabelle `feedback` + `feedback_votes` (RLS staff-read/own-write/admin-manage) + sezione workspace `feedback` | — |
| `095_workspace_workload_section.sql` | voce sidebar `workload` nel workspace (il layout la inietta comunque come fallback) | — |

## Workload (`/workload` e `/workspace/workload`)
Vista strategica dei progetti in parallelo: effort (ore stimate, default 4h dove
manca), timeline, carico per risorsa. Stessa `WorkloadClient` per admin e workspace.
`lib/workload.ts` = calcoli puri (l'effort di una task multi-assegnata si **divide**
fra gli assegnatari). Filtri: tipo/cliente/risorsa/periodo. Editing (stato,
riassegnazione, elimina) riservato al **PM** (`projects.manager_id`), al `manager`
di ruolo o all'admin, via `app/actions/workload-tasks.ts` (service role). Nessun
dato economico: è sicuro anche nel workspace.
| `094_private_personal_tasks.sql` | task senza progetto = personali/private: `tasks_team_read_all` ora richiede `project_id IS NOT NULL` (i colleghi non le vedono) | — |

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
| Margin Radar | — | ❌ da costruire |
| Decision Center | — | ❌ da costruire |
| AI Executive Brief | `SmartInsights` (approssimazione) | ⚠️ parziale |
| Financial Control aggregato | — | ❌ solo in tab cliente |
| Growth Performance aggregato | — | ❌ solo in tab cliente |
| Sales Pipeline widget | Fetcha `deals` ma no widget | ⚠️ dati ci sono |
| Strategic Objectives widget | Fetcha `objectives` ma no widget | ⚠️ dati ci sono |
| AI & Automation Center | — | ❌ da costruire |

## Funzionalità completate (sessione corrente)
- Dashboard grid drag/resize con localStorage, 3 template, `CustomizePanel` (solo super_admin)
- Clienti: Supabase Realtime (INSERT/UPDATE/DELETE), `router.refresh()` su dettaglio
- Progetti: `project_kind (growth|digital)` su ogni progetto; CRUD completo in `PanoramicaTab` (con upload file → AI extract) e `ProgettiClient`; badge G/D su `ProgettiWidget`
- Chat: rimossa da tab cliente, spostata in ogni progetto (tab `🗨️ Chat`) con canali `cliente_interno` (team) e `customer_care` (cliente); creazione via `ensureProjectChannels()` server action
- CLAUDE.md aggiornato con regole caveman

## Prossimi lavori suggeriti (in ordine priorità)
1. **Eseguire SQL migration** `project_id` su chat_channels (vedi BUG sopra)
2. **Decision Center** — nuova tabella `decisions` + widget dashboard
3. **AI Executive Brief** — sintesi narrativa Groq che legge dati dashboard
4. **Margin Radar** — widget per margine per cliente (fee − costi)
5. **Financial Control aggregato** — crediti totali, scaduti, burn rate in dashboard
6. **Sales Pipeline widget** — i dati `deals` sono già fetchati in `page.tsx`
7. **Strategic Objectives widget** — i dati `objectives` sono già fetchati

## Regole di risposta
- Zero preamboli. Vai dritto a codice.
- Spiega solo se non ovvio o richiesto.
- Una sola soluzione proposta salvo richiesta esplicita.
- Modifica solo le righe necessarie.
- Niente riassunti: una riga di conferma basta.
- Leggi solo le righe rilevanti del file.
- TypeScript: zero errori al primo tentativo.
- Non chiedere conferma per modifiche non distruttive.
