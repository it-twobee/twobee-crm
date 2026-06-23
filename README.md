# TWO BEE Gestionale

Piattaforma operativa interna per TWO BEE S.R.L. — sostituisce ClickUp + Slack.

**Stack:** Next.js 14 · Supabase · Tailwind CSS · shadcn/ui · Recharts · Vercel

---

## Setup Rapido

### 1. Prerequisiti

- Node.js 18+
- Account Supabase (supabase.com)
- Account Vercel (vercel.com)

### 2. Configura Supabase

1. Crea un nuovo progetto su [supabase.com](https://supabase.com)
2. Vai in **Settings → API** e copia:
   - `Project URL`
   - `anon public` key
   - `service_role` key

3. Esegui le migration nel **SQL Editor** di Supabase:
   - Copia e incolla il contenuto di `supabase/migrations/001_initial_schema.sql`
   - Esegui

4. Crea il bucket Storage:
   - Vai in **Storage → New Bucket**
   - Nome: `documents`
   - Public: NO

### 3. Variabili d'ambiente

```bash
cp .env.local.example .env.local
```

Modifica `.env.local` con le tue credenziali:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 4. Installa dipendenze e avvia

```bash
npm install
npm run dev
```

Apri [http://localhost:3000](http://localhost:3000)

### 5. Seed data (clienti reali TWO BEE)

Nel **SQL Editor** di Supabase, esegui il contenuto di `supabase/seed.sql`.

---

## Creare il Primo Utente Admin

1. Vai su Supabase → **Authentication → Users → Invite User**
2. Inserisci email: `marco.lucci@twobee.it`
3. L'utente riceve email con link di setup
4. Vai nel **SQL Editor** ed esegui:

```sql
UPDATE public.profiles
SET role = 'admin', full_name = 'Marco Lucci'
WHERE email = 'marco.lucci@twobee.it';
```

Ripeti per tutti i membri del team (vedi seed.sql per la lista).

---

## Deploy su Vercel

```bash
# Installa Vercel CLI
npm i -g vercel

# Deploy
vercel
```

Oppure collega il repo GitHub su [vercel.com](https://vercel.com) e imposta le env vars nel pannello Vercel:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

---

## Struttura del Progetto

```
app/
├── (auth)/login/        — Pagina login
├── (dashboard)/
│   ├── dashboard/       — Dashboard KPI
│   ├── clienti/         — Lista + pagina cliente
│   ├── task/            — Kanban board
│   ├── chat/            — Messaggistica realtime
│   ├── report/          — Report KPI aggregati
│   ├── documenti/       — File manager
│   └── impostazioni/    — Team + profilo
components/
├── shared/              — Sidebar, Header
├── dashboard/           — Componenti dashboard
├── clients/             — Lista clienti, form, tabs
supabase/
├── migrations/          — Schema SQL + RLS
└── seed.sql             — Dati iniziali clienti TWO BEE
```

---

## Ruoli e Accessi

| Ruolo | Accesso |
|-------|---------|
| `admin` | Tutto — Marco, Walter |
| `team` | Solo clienti assegnati — Toto, Sabrina, Michele, Alessia, Gabriele |
| `client` | Solo la propria pagina cliente |
| `guest` | Sola lettura sul cliente specifico |

---

## Variabili d'Ambiente Richieste

| Variabile | Descrizione |
|-----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del progetto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chiave pubblica (anon) Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Chiave service role (solo server) |
| `NEXT_PUBLIC_APP_URL` | URL dell'app (es. https://gestionale.twobee.it) |

---

*TWO BEE S.R.L. — Napoli — Uso interno riservato*
