# TWO BEE Gestionale — Contesto Claude Code

## Stack & architettura
- **Next.js 14** App Router, TypeScript strict, Tailwind CSS
- **Supabase** PostgreSQL + Auth + RLS (`@/lib/supabase/server` server-side, `@/lib/supabase/client` client-side, `@/lib/supabase/admin` service role)
- **UI**: bg `#111111`, gold `#F5C800`, surface `#1A1A1A`, border `#2A2A2A`; Radix UI; lucide-react; sonner toast
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
supabase/migrations/              ← 001–034 (vedi BUG NOTO sotto)
```

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
- `chat_channels`: `type (cliente|interno|task|customer_care|cliente_interno), client_id` — **project_id NON ancora in prod** (vedi BUG)
- `chat_messages`: `channel_id, sender_id, content`
- `tasks`: `project_id, title, status (da_fare|in_corso|completato), is_milestone, due_date`
- `objectives`: OKR aziendali con `progress, status`
- `deals`: pipeline commerciale con `stage`

## Autenticazione e ruoli
- `isSuperAdmin()` → `SUPER_ADMIN_EMAILS = ['m.lucci@twobee.it']` OR `app_role === 'super_admin'`
- `marco.d.lucci@gmail.com` = account sviluppo, NON è super admin
- RLS: `get_my_role()` legge `role` da `profiles` (non `app_role`) — admin, team, client, guest
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

## BUG NOTO — da risolvere subito
**`chat_channels.project_id` non esiste in produzione.**
La migrazione `030_channels_by_project.sql` è nei file locali ma mai applicata al DB live.
Eseguire su Supabase Dashboard → SQL Editor:
```sql
ALTER TABLE public.chat_channels
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_chat_channels_project ON public.chat_channels(project_id);
```
Finché non viene eseguita, la Chat nei progetti usa un fallback (primo canale per tipo per client_id).
Dopo l'esecuzione i canali saranno correttamente isolati per progetto.

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
