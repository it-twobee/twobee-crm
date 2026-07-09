# TwoBee OS
### Il sistema operativo interno di TWO BEE S.R.L.

> Piattaforma operativa interna per **TWO BEE S.R.L.** — progettata per sostituire l'intero stack ClickUp + Slack + fogli Excel con un unico gestionale su misura per agenzie di digital marketing e growth.

---

## Cosa è

TwoBee OS è un gestionale full-stack costruito attorno ai processi reali di un'agenzia. Non è un template: ogni funzionalità nasce da un problema operativo specifico.

```
Clienti → Progetti → Sprint → Milestone → Task → Subtask
    ↓           ↓          ↓
  KPI        Chat       Aggiornamenti
    ↓           ↓
Fatture    Portale Cliente
```

---

## Stack

| Layer | Tecnologia |
|-------|-----------|
| Frontend | Next.js 14 App Router · TypeScript strict · Tailwind CSS |
| Backend | Supabase (PostgreSQL + Auth + RLS + Realtime) |
| AI | Groq `llama-3.3-70b-versatile` |
| Charts | Recharts · SVG inline |
| UI | Radix UI · Lucide · Sonner toast |
| Deploy | Coolify (Docker · Next.js standalone) — os.twobee.it |

---

## Funzionalità

### Dashboard
Grid drag & resize con widget configurabili (solo super admin). Snapshot aziendale in tempo reale: MRR, risk score clienti, task in scadenza, pipeline commerciale, obiettivi strategici, AI executive brief.

### Clienti
Scheda cliente completa con 7 tab: Panoramica · KPI · Fatturazione · Documenti · Anagrafica · Relazione · Chat. Health score automatico, alert intelligenti, aggiornamento Realtime su ogni modifica.

### Progetti
Struttura gerarchica **Sprint → Milestone → Task → Subtask** con inline edit, assegnazioni, ore stimate/lavorate, date di scadenza, chat per progetto con canali team e customer care separati.

### Reparti (Growth · Marketing · Digital · AI)
Board operativa per reparto con 4 sotto-tab:

| Tab | Contenuto |
|-----|-----------|
| **Dashboard** | Scorecard, velocity chart, client health, AI chat con storico persistente |
| **Board Team** | Sprint attivi aggregati, tag system cross-progetto, filtri per assignee/tag/progetto, bulk tag |
| **Task Clienti** | Deliverable del cliente, template automatici per tipo progetto, ottimizzazione AI con chat |
| **Timeline** | Barre sprint, marker milestone, stelle task cliente; filtri periodo/progetto/tag |

### Portale Cliente *(preview super admin)*
Vista fedele di quello che vede il cliente:
- Task da completare (checkabili direttamente)
- Aggiornamenti dei progetti con tag e risposte
- Chat customer care in tempo reale
- KPI mensili e fatture

### AI integrata
- Dashboard chat contestuale sui dati aziendali
- Executive brief narrativo quotidiano
- Generazione sprint e milestone da obiettivi
- Analisi KPI mensile e report automatici
- Template task cliente generati e ottimizzati per tipo progetto
- AI Advisor per reparto con azioni dirette (crea task, salva nota, esporta PDF)

### Sistema di Tag
14 tag predefiniti con colori (`#growth #marketing #digital #ai #tracking #automation #urgente #bloccante #quick-win #design #copy #dev #strategia #analytics`) + tag custom liberi. Filtri rapidi cross-progetto, pillole inline sulle task, bulk tag su selezione multipla.

### Altro
Fatturazione · Commerciale & pipeline lead · HR & timesheet · Strategia & OKR · Customer care & ticket · Calendario · Documenti · Cronologia

---

## Struttura

```
app/
├── (auth)/                     # Login, reset password
├── (dashboard)/
│   ├── dashboard/              # Dashboard principale
│   ├── clienti/[id]/           # Scheda cliente
│   │   └── progetto/[pid]/     # Pagina progetto
│   ├── reparti/[dept]/         # Board reparto (growth/marketing/digital/ai)
│   ├── portale-cliente/[id]/   # Preview portale cliente (super admin)
│   ├── commerciale/            # Pipeline e lead
│   ├── fatturazione/           # Fatture aggregate
│   ├── hr/                     # Team e timesheet
│   └── strategia/              # OKR e obiettivi
└── api/                        # Route handlers AI + integrazioni

components/
├── dashboard/                  # Widget dashboard
├── clients/tabs/               # Tab scheda cliente
├── projects/                   # ProjectPageClient, SprintMilestoneBoardSection
├── reparti/                    # BoardTeam, TaskClienteSection, RepartiTimeline
├── portale-cliente/            # ClientPortalView
├── chat/                       # SlackChat
└── shared/                     # Sidebar, Header

lib/
├── supabase/                   # client · server · admin
├── types/database.ts           # Tutti i tipi TypeScript
├── permissions.ts              # isSuperAdmin, RLS helpers
└── reparti-constants.ts        # Tag system, template task cliente

supabase/migrations/            # 58 migration (001 → 058)
```

---

## Setup

### 1. Variabili d'ambiente

```bash
cp .env.local.example .env.local
```

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
NEXT_PUBLIC_APP_URL=http://localhost:3000
GROQ_API_KEY=gsk_...
```

### 2. Esegui le migration

Su Supabase Dashboard → SQL Editor, esegui in ordine i file `supabase/migrations/001_*.sql` → `058_*.sql`.

### 3. Installa e avvia

```bash
npm install
npm run dev        # localhost:3000
npm run build
npm run lint
```

---

## Ruoli

| Ruolo | Accesso |
|-------|---------|
| `super_admin` | Tutto + customize dashboard + portale cliente preview |
| `admin` | Gestione completa clienti, progetti, team |
| `team` | Operativo su progetti assegnati |
| `client` | Solo portale cliente |
| `guest` | Read-only su aree specifiche |

---

## Migration pendenti

Dopo il primo deploy, eseguire su Supabase SQL Editor:

```sql
-- 057: AI chat reparti
CREATE TABLE IF NOT EXISTS public.dept_ai_chats ( ... );

-- 058: Tag e task cliente
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS is_client_task BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
```

Vedi i file completi in `supabase/migrations/`.

---

*TWO BEE S.R.L. · Napoli · Uso interno riservato*
