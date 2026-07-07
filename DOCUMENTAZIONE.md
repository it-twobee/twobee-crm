# TwoBee CRM — Documentazione completa del gestionale

> Piattaforma operativa interna di **TWO BEE S.R.L.** — sostituisce ClickUp + Slack + fogli Excel con un unico gestionale su misura per un'agenzia di growth & digital marketing.
>
> Repository: [github.com/it-twobee/twobee-crm](https://github.com/it-twobee/twobee-crm) · Codename storico: *B.E.O.T.A.*

Ultimo aggiornamento: sessione di sviluppo corrente · 62 migration · ~96 componenti React

---

## Indice
1. [Stack tecnologico](#1-stack-tecnologico)
2. [Architettura e concetti chiave](#2-architettura-e-concetti-chiave)
3. [Modello dati (tabelle principali)](#3-modello-dati)
4. [Autenticazione, ruoli e sicurezza (RLS)](#4-autenticazione-ruoli-e-sicurezza)
5. [Mappa delle sezioni (rotte)](#5-mappa-delle-sezioni)
6. [Funzionalità in dettaglio](#6-funzionalità-in-dettaglio)
7. [Integrazione AI](#7-integrazione-ai)
8. [TwoBee OS — Command Center di sviluppo](#8-twobee-os)
9. [Cronologia degli sviluppi (questa fase)](#9-cronologia-degli-sviluppi)
10. [Migration pendenti da eseguire](#10-migration-pendenti)
11. [Setup e configurazione](#11-setup-e-configurazione)
12. [Roadmap residua](#12-roadmap-residua)

---

## 1. Stack tecnologico

| Layer | Tecnologia |
|---|---|
| Framework | **Next.js 14** (App Router, Server Components, Server Actions) |
| Linguaggio | **TypeScript** strict |
| Styling | **Tailwind CSS** · Radix UI · lucide-react · sonner (toast) |
| Backend / DB | **Supabase** — PostgreSQL + Auth + Row Level Security + Realtime + Storage |
| AI | **Groq** `llama-3.3-70b-versatile` (via fetch, chiave server-side) |
| Grafici | Recharts (client) · SVG inline (report server-side) |
| Dashboard | react-grid-layout/legacy (griglia drag & resize) |
| Deploy | Vercel |

**Palette UI**: bg `#111111` · gold `#F5C800` · surface `#1A1A1A` · border `#2A2A2A`

---

## 2. Architettura e concetti chiave

### Client Supabase (3 livelli)
- `@/lib/supabase/server` — server components/route, **rispetta RLS**, legge i cookie di sessione
- `@/lib/supabase/client` — client components, realtime
- `@/lib/supabase/admin` — **service role, bypassa RLS** (solo server-side, per operazioni privilegiate: creazione canali, inviti, seed)

### Gerarchia operativa
```
Cliente
 └─ Progetto (project_kind: growth | digital)
     └─ Sprint
         └─ Milestone (task con is_milestone=true)
             └─ Task
                 └─ Subtask (task con parent_id)
```

### Convenzioni di codice
- Nessun commento salvo "perché" non ovvi
- Cast dei join Supabase: `as unknown as Type[]`
- `overflow-x-auto` sui wrapper tabella (mai `overflow-hidden`)
- Mai `<button>` dentro `<button>` → `<div onClick>` per i wrapper
- Server Action: `'use server'` + `revalidatePath('/path')`

---

## 3. Modello dati

62 migration (`supabase/migrations/001` → `062`). Tabelle chiave:

### Clienti e relazione
- **`clients`** — `company_name, client_type (growth|digital|growth_digital), package, mrr, client_label (stabile|in_bilico|perso|partner), risk_score, contract_start, contract_end, industry, market_area`
- **`client_contacts`**, **`client_stakeholders`** — contatti e referenti
- **`client_assignments`** — collega utenti a clienti (usata anche per legare l'utente-cliente al suo record, vedi Portale)
- **`client_interactions`** — interazioni commerciali (email, meeting, demo) + umore cliente
- **`client_notes`** — note interne
- **`client_kpis`** — KPI mensili per cliente (unique per `client_id, month`); MER, revenue_attributed, roas, ctr, leads, organic_sessions, uptime…
- **`client_kpi_config`** — quali KPI sono abilitati per cliente
- **`client_targets`** — obiettivi mensili (target_revenue, target_leads…)

### Progetti e task
- **`projects`** — `client_id, name, status, project_type, project_kind (growth|digital), sprint_current`
- **`sprints`** — `project_id, name, status, start_date, end_date`
- **`tasks`** — `project_id, title, status (da_fare|in_corso|completato), is_milestone, milestone_id, parent_id, assignee_id, estimated_hours, logged_hours, due_date, is_client_task, tags[]`
- **`task_dependencies`**, **`project_comments`** (feed aggiornamenti, con `is_client`), **`project_appointments`**, **`meeting_notes`**
- **`time_entries`** — ore lavorate del team

### Commerciale e finanza
- **`deals`**, **`deal_activities`**, **`quotes`** — pipeline commerciale
- **`leads`** — lead centralizzati (`source, status, assigned_to, value`)
- **`invoices`** — fatturazione (`invoice_type, status, month, amount`)

### Chat e supporto
- **`chat_channels`** — `type (cliente|interno|task|customer_care|cliente_interno), client_id, project_id`
- **`chat_messages`**, **`channel_members`**, **`channel_guests`**, **`message_reactions`**
- **`tickets`**, **`ticket_messages`** — customer care + portale ticket via token

### Azienda e team
- **`profiles`** — utenti (`role` per RLS: admin|team|client|guest · `app_role`: super_admin…viewer · `area, competencies, job_title, is_active`)
- **`role_permissions`** — matrice permessi configurabile per ruolo
- **`org_units`** + **`org_members`** — organigramma per funzioni *(migration 061)*
- **`team_leaves`, `performance_reviews`, `onboarding_steps`** — HR
- **`objectives`, `key_results`, `roadmap_items`, `strategic_notes`** — OKR e strategia
- **`departments`** — reparti (growth/marketing/digital/ai)
- **`dept_ai_chats`** — storico chat AI dei reparti *(migration 057)*

### Sistema e meta
- **`notifications`** — notifiche in-app (realtime)
- **`activity_log`** — audit trail
- **`decisions`** — decisioni strategiche (Decision Center)
- **`ai_logs`** — log chiamate Groq
- **`documents`** — file e link (incl. Google Drive)
- **`os_tasks`, `os_phases`, `os_backlog_items`** — TwoBee OS (roadmap sviluppo piattaforma)

---

## 4. Autenticazione, ruoli e sicurezza

### Due sistemi di ruolo
- **`profiles.role`** (`admin | team | client | guest`) → usato dalle **RLS** via `get_my_role()`
- **`profiles.app_role`** (`super_admin | admin | manager | senior | junior | viewer | client | guest`) → usato dal frontend per i permessi granulari (`role_permissions`)

### Super admin
`SUPER_ADMIN_EMAILS = ['m.lucci@twobee.it']` — GOD MODE, hardcoded, non modificabile da UI.
> `marco.d.lucci@gmail.com` è l'account di sviluppo, **NON** super admin.

### Funzioni helper RLS (Postgres)
- `get_my_role()` → legge `profiles.role`
- `is_staff()` → `role IN ('admin','team')` *(migration 059)*
- `get_my_client_id_as_client()` → il `client_id` del cliente loggato (da `client_assignments`)
- `get_my_client_ids()` → i client assegnati a un membro del team

### Hardening RLS (migration 059)
Prima del portale cliente, molte tabelle avevano policy permissive (`USING(true)`). La 059 ha blindato ~30 tabelle interne (deals, OKR, HR, note, ore, ecc.) ai soli `is_staff()`, aggiungendo policy `client` filtrate per `client_id` su: `project_comments`, `invoices`, `tasks` (solo `is_client_task`), `chat_channels`. **Prerequisito di sicurezza per abilitare login cliente.**

---

## 5. Mappa delle sezioni

### Area staff — `app/(dashboard)/`
| Rotta | Sezione |
|---|---|
| `/dashboard` | Dashboard modulare (griglia widget) |
| `/clienti` · `/clienti/[id]` | Lista + scheda cliente (7 tab) |
| `/clienti/[id]/progetto/[projectId]` | Pagina progetto (6 tab) |
| `/progetti` · `/portfolio` | Progetti e portfolio |
| `/reparti/[dept]` | Reparti Growth/Marketing/Digital/AI |
| `/commerciale` | Pipeline deal + lead gen |
| `/fatturazione` | Fatture aggregate |
| `/report` | Report KPI |
| `/customer-care` · `/customer-care/tickets` | Supporto e ticket |
| `/chat` | Chat globale Slack-like |
| `/calendario` · `/documenti` | Calendario e file |
| `/hr` · `/hr/timesheet` | Team, ferie, performance, organigramma |
| `/strategia` | OKR e obiettivi |
| `/operativa` · `/le-mie-attivita` · `/task` | Viste operative e task board |
| `/twobee-os` | Command Center sviluppo (super admin) |
| `/portale-cliente` · `/portale-cliente/[id]` | **Preview** portale (super admin) |
| `/impostazioni` · `/impostazioni/profilo` · `/impostazioni/cronologia` | Config |

### Area cliente — `app/portale/`
| Rotta | Descrizione |
|---|---|
| `/portale` | Portale del cliente loggato (layout dedicato, senza sidebar admin) |

### Pubblico
| Rotta | Descrizione |
|---|---|
| `/ticket-portal/[token]` | Portale ticket via token (senza login) |
| `/login` · `/onboarding` | Auth |

---

## 6. Funzionalità in dettaglio

### 6.1 Dashboard modulare
Griglia drag & resize (react-grid-layout) con layout persistito in `dashboard_config` (DB) + localStorage. Widget disponibili: AI Chat, Focus di oggi, Alert, Metriche, Revenue, Task settimana, Progetti, Clienti a rischio, Company Pulse, Carico team, AI Insights, Margin Radar, Financial Control, Sales Pipeline, Decision Center, AI Executive Brief, KPI Performance, AI & Automation, OKR, **Growth Performance**. 3 template preconfigurati (Operations First, Business View, Agency Full) + template custom. Solo super admin vede il pannello Personalizza.

La pagina fa ~20 query parallele con gestione errori robusta (`safe`/`safeData` con logging, nessun crash).

### 6.2 Scheda cliente (7 tab)
Panoramica · KPI · Fatturazione · Documenti · Anagrafica · Relazione · Chat.
Health score automatico, alert intelligenti, Realtime su INSERT/UPDATE/DELETE. La Panoramica include il blocco **"Cosa ci serve da te"** (task cliente pending).

### 6.3 Progetti (6 tab)
Progetto · Appuntamenti · Riunioni · KPI · Aggiornamenti · Chat.
Struttura Sprint→Milestone→Task→Subtask con inline edit, drag&drop, ore stimate/lavorate, assegnazioni. Chat per progetto con canali `cliente_interno` (team) e `customer_care` (cliente).

### 6.4 Reparti (Growth · Marketing · Digital · AI)
Sotto-tab **Operatività** con 4 viste:
- **Dashboard** — scorecard, velocity chart, client health, AI chat con storico persistente (`dept_ai_chats`)
- **Board Team** — sprint aggregati cross-cliente, tag system, filtri per assignee/tag/progetto, bulk tag
- **Task Clienti** — deliverable del cliente con template per tipo progetto + generazione/ottimizzazione AI
- **Timeline** — barre sprint, marker milestone, stelle task cliente; filtri per periodo/progetto/tag

Più sezioni **Toolbox** (UTM builder, brief generator, calcolatori MER/LTV/funnel, prompt library, ecc.) e **AI Advisor**.

### 6.5 Portale Cliente (login reale)
Il cliente accede con proprio account (`role=client`), confinato a `/portale` dal middleware (routing per ruolo). Vede solo i propri dati (RLS-enforced), 8 tab: Panoramica · Progetti · Da fare (task cliente checkabili) · Aggiornamenti · Chat · **Documenti** · Report KPI · Fatture.
Invito dei clienti dalla preview super admin (`inviteClientToPortal`): crea utente, lo collega via `client_assignments`, lo iscrive al canale customer care.

### 6.6 File storage Google Drive
Approccio link/embed (no OAuth): il team incolla link a cartelle/file Drive, mostrati in **webview (iframe)** sia lato admin (tab Documenti) sia nel portale cliente. `lib/drive.ts` converte i link in URL embeddabili. Riusa la tabella `documents`.

### 6.7 Ricerca globale (Cmd+K)
Command palette nell'Header (`GlobalSearch`) che cerca su 6 entità (clienti, progetti, task, messaggi chat, documenti, deal) con `ilike`, **RLS-enforced**. Debounce, navigazione tastiera, risultati raggruppati.

### 6.8 Report KPI (PDF)
`app/api/kpi-report` genera un report HTML stampabile (→PDF) con: copertina, **sezione Servizio** (pacchetto, MRR, contratto, progetti, team), sintesi AI, grafici SVG di trend, confronto periodi, tabella storica, **Timeline operativa** (progetti/sprint/milestone/riunioni), raccomandazioni AI.

### 6.9 Customer Care e ticket
Chat e ticket con i clienti; portale ticket pubblico via token per segnalazioni ("sito down", ecc.) centralizzate con note interne.

### 6.10 Commerciale e lead
Pipeline deal (stage) + lead gen centralizzato. **Notifiche automatiche nuovi lead**: trigger DB (`notify_new_lead`, migration 062) crea notifiche in-app per il team commerciale + toast realtime nell'Header; SMS opzionale via Twilio (env-gated).

### 6.11 HR e organigramma
Team, ferie/permessi/straordinari, performance review, e **Organigramma** (tab HR): unità funzionali editabili (Growth, Advertising, Automation & Tracking, IT & Sviluppo, Social Organic) con referente, responsabilità e membri. Leadership auto-derivata.

### 6.12 Chat globale
Slack-like con canali per cliente/interni/progetto/customer care. Realtime, reazioni, allegati (Storage), thread, ospiti.

---

## 7. Integrazione AI

Tutto su **Groq `llama-3.3-70b-versatile`** (chiave `GROQ_API_KEY` server-side). Route in `app/api/ai/` e affini:
- `dashboard-chat` — assistente contestuale sui dati dashboard
- `executive-brief` — briefing narrativo aziendale
- `extract-project` / `extract-meeting` — estrazione dati da testo/upload
- `generate-plan` / `sprint-plan` / `generate-milestones` — pianificazione automatica
- `sprint-report` / `kpi-report` / `kpi-precompile` / `kpi-chat` — analisi KPI
- `reparti/chat` / `reparti/ai-suggest` / `reparti/client-tasks-ai` — AI dei reparti
- `os/*` — analisi codebase, proposta idee, generazione prompt (TwoBee OS)

Le chiamate seguono il pattern: fetch → estrazione JSON robusta con regex `\{[\s\S]*\}`.

---

## 8. TwoBee OS

Command Center interno (`/twobee-os`, super admin) per gestire lo **sviluppo della piattaforma stessa**. Tabella `os_tasks` con `category (costruire|modificare|ottimizzare|eliminare)`, `priority (critica|alta|media|bassa)`, `section`, `status`, `effort_days`, `file_paths`, `is_next_step`, `ai_suggested`.

**Stato attuale**: 38 task aperti · 58 completati · next-step attivo → *Fatturazione elettronica Aruba* (critica).

La migration 060 ha importato i task della riunione strategica del 23/06/2026: 12 feature già consegnate (storico) + parziali/gap come to-do.

---

## 9. Cronologia degli sviluppi

### Fondamenta (commit iniziale)
Gestionale completo: dashboard, clienti, progetti, reparti, chat, HR, strategia, commerciale, fatturazione, customer care, 58 migration iniziali.

### Sviluppi di questa fase (in ordine)
| # | Commit | Descrizione |
|---|---|---|
| 1 | `fabb498` | Initial commit — gestionale B.E.O.T.A. completo |
| 2 | `be4aa38` | README con architettura e setup |
| 3 | `d5ff59f` | **Portale cliente reale** con login dedicato + hardening RLS (mig. 059) |
| 4 | `2099351` | Import task **riunione strategica 23/06** in TwoBee OS (mig. 060) |
| 5 | `083ab59` | **Storage Google Drive** con webview nel portale |
| 6 | `3ac7218` | **Ricerca globale** cross-section (Cmd+K) |
| 7 | `8ff134a` | Fix logging errori query dashboard senza crash |
| 8 | `cdafc91` | **Organigramma** e ruoli team in HR (mig. 061) |
| 9 | `a5a599f` | **Notifiche automatiche nuovi lead** in-app + SMS (mig. 062) |
| 10 | `1f7d91f` | **Sezione servizio + timeline operativa** nel report KPI |
| 11 | `d560030` | Widget **Growth Performance** aggregato cross-client |

### Operazioni infrastrutturali
- Repo GitHub inizializzato e pubblicato su `it-twobee`
- Rinominato da `B.E.O.T.A.` a **`twobee-crm`**
- `gh` CLI installato e autenticato

---

## 10. Migration pendenti

⚠️ Da eseguire su **Supabase → SQL Editor** (l'esecuzione DDL non è automatizzabile lato codice). Verificare quali sono già applicate:

| Migration | Cosa attiva | Stato tipico |
|---|---|---|
| `057_dept_ai_chat` | Storico chat AI reparti | ⚠️ da verificare |
| `058_tasks_tags_client` | Tag + `is_client_task` (portale, task clienti) | ⚠️ da verificare |
| `059_client_portal_rls_hardening` | **Sicurezza RLS portale** (crea `is_staff()`) | ⚠️ **critica** |
| `061_org_chart` | Tabelle organigramma | ⚠️ da eseguire |
| `062_lead_notifications` | Trigger notifiche lead | ⚠️ da eseguire |

> **Nota di sicurezza**: la `059` è emersa non completamente applicata (mancava `is_staff()`). Finché non è eseguita, un eventuale account cliente potrebbe leggere dati interni (pipeline, OKR, MRR altrui). È il primo intervento da completare.

I file `.sql` completi sono in `supabase/migrations/`.

---

## 11. Setup e configurazione

```bash
npm install
npm run dev      # localhost:3000
npm run build
npm run lint
```

### Variabili d'ambiente (`.env.local`)
```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
GROQ_API_KEY=

# Opzionali — SMS notifiche lead (Twilio)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM=
LEAD_SMS_TO=
```

### DB
Eseguire in ordine le migration `001` → `062` su Supabase SQL Editor. Bucket Storage `documents` (privato) per gli allegati.

---

## 12. Roadmap residua

Dal TwoBee OS (38 task aperti). Prossimi ad alto valore:
- 🔴 **Fatturazione elettronica Aruba** (critica, next-step) — integrazione esterna
- **Template onboarding progetti** con task predefinite per tipo
- **Forecast commerciale aggregato** (revenue, budget gestito, forecast)
- **Brief/Knowledge per cliente** (competitor, target, offerta) per onboarding
- **Import Excel** benchmark/competitor
- **Appuntamenti dal portale cliente** + sync Google Calendar completo
- Timesheet con costi reali → Margin Radar con marginalità effettiva
- Split di `ProjectPageClient.tsx` (2980 righe) in sub-componenti

---

*TWO BEE S.R.L. · Napoli · Documento interno riservato*
