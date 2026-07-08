# ARCHITECTURE_PLAN.md — TwoBee OS
> Versione: 1.0 — 08 Luglio 2026 | Deadline MVP: 31 Luglio 2026

---

## 1. Ruoli definitivi

### Gerarchia `app_role`

| `app_role` | Livello | Descrizione |
|---|---|---|
| `super_admin` | 0 | Accesso totale, configura navigazione, permessi, tutto |
| `founder` | 1 | Strategia + dati economici completi + direzione |
| `admin` | 2 | Gestionale operativo, no dati riservati founder |
| `manager` | 3 | Gestione team/progetto, dati economici intermedi |
| `senior` | 4 | Risorsa operativa senior |
| `junior` | 5 | Risorsa operativa base |
| `stage` | 6 | Stagista, accesso molto limitato |
| `freelance` | 7 | Risorsa esterna continuativa, portale workspace |
| `partner` | 8 | Azienda partner esterna, portale /partner |
| `client` | 9 | Solo portale /portale |
| `guest` | 10 | Solo lettura, accesso ultra-limitato |

> **Nota**: `founder` ≠ `super_admin`. Toto = `founder` + `admin`.  
> `super_admin` è riservato all'account di sviluppo e alla configurazione del sistema.

### Esistente da aggiornare

`AppRole` in `lib/types/database.ts` è già definito ma manca `founder`, `stage`, `freelance`, `partner`.

```ts
// Da aggiornare
export type AppRole =
  | 'super_admin' | 'founder' | 'admin' | 'manager'
  | 'senior' | 'junior' | 'stage' | 'freelance'
  | 'partner' | 'client' | 'guest'
```

### Resource Type (su `profiles`, campo da aggiungere)

| `resource_type` | Descrizione |
|---|---|
| `dipendente` | Dipendente interno con contratto |
| `piva` | P.IVA con collaborazione continuativa |
| `freelance_continuativo` | Freelance esterno continuativo |
| `collaboratore_una_tantum` | Collaboratore occasionale |
| `partner_aziendale` | Risorsa di un'azienda partner esterna |

> ⚠️ Esiste già `ResourceProfile` con campi granulari `can_*`. La colonna `resource_type` su `profiles` è tuttavia separata e necessaria per RLS e routing.

### Seniority (su `profiles`, campo da aggiungere)

| `seniority` | Descrizione |
|---|---|
| `lead` | Lead / Head of |
| `senior` | Senior |
| `mid` | Mid-level |
| `junior` | Junior |
| `stage` | Stagista |

---

## 2. Matrice permessi

### Visibilità dati economici

| Dato | super_admin | founder | admin | manager | senior/junior/stage/freelance | partner | client |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Margini per cliente/progetto | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Costi risorse (compensi) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Costi business fissi | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Fatture specifiche per cliente | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Fatture proprie (cliente) | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Preventivi interni | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Fee partner | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| MRR per singolo cliente | ✅ | ✅ | ❌ | ✅ (anonimiz.) | ❌ | ❌ | ❌ |
| MRR macro aggregato | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Fatturato totale (annuale + mensile) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Obiettivo revenue aziendale | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| % avanzamento obiettivo | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Forecast finanziario dettagliato | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Break-even / cashflow | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

> **Manager**: vede MRR aggregato + fatturato totale + obiettivo (come tutti) + MRR per progetto/cliente **anonimizzato** (es. "Cliente A: 5k€/mese" senza nome). Non vede mai compensi, costi, margini.

### Visibilità dati strategici

| Sezione | super_admin | founder | admin | manager | senior/junior | stage/freelance | partner | client |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Strategia riservata | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| OKR aziendali pubblici | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| OKR di reparto | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Roadmap operativa | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Decision Center | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Pipeline commerciale | ✅ | ✅ | ✅ | ✅ (assegnati) | ❌ | ❌ | ❌ | ❌ |
| Note private admin | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

### Azioni su task

| Azione | super_admin | founder | admin | manager | senior/junior | stage | freelance | partner | client |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Crea task | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Modifica task propria | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Modifica task altrui | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Elimina task | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Richiedi eliminazione | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Crea subtask | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Duplica task | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Segnala blocco | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Completa task cliente | — | — | ✅ | ✅ | ✅ | — | — | — | ✅ |

---

## 3. Sezioni visibili per portale

### Portale Admin `/` (app_role: super_admin, founder, admin, manager)

```
Dashboard                    ← sempre visibile, contenuto filtrato per ruolo
Clienti
  ├─ Tutti i clienti
  ├─ Clienti interni
  └─ Lead
Lavori
  ├─ Tutti i progetti
  └─ Le mie attività
Commerciale                  ← founder/admin/manager autorizzati
  ├─ Pipeline Deal
  ├─ Preventivi
  └─ Contatti Lead
Controllo di Gestione        ← founder/super_admin ONLY
  ├─ Panoramica
  ├─ Costi Fissi
  ├─ Costi Risorsa
  └─ Margini
Team
  ├─ Risorse
  ├─ Richieste HR
  └─ Performance
Direzione                    ← founder/super_admin ONLY
  ├─ OKR
  ├─ Roadmap
  └─ Decision Center
Sistema                      ← super_admin ONLY
  ├─ Configurazione Workspace
  ├─ Configurazione Partner Portal
  ├─ Permessi & Ruoli
  └─ Impostazioni
```

### Portale Workspace `/workspace` (app_role: manager, senior, junior, stage, freelance)

**Day-one MVP (7 sezioni):**
```
Dashboard                    ← attività oggi, task urgenti, alert, calendario
Le mie attività              ← port di /le-mie-attivita
Progetti assegnati           ← solo progetti dove è assegnato
Calendario                   ← deadline + appuntamenti personali
Chat                         ← canali team/progetto, NO customer care
Documenti                    ← filtrati per visibility
Richieste HR                 ← ferie, permessi, malattia, spese
```

**Phase 2:**
```
Profilo                      ← dati personali, competenze
Performance personale        ← KPI operativi personali
Knowledge operativa          ← documenti knowledge condivisi
AI Assistant                 ← "cosa devo fare oggi?"
Andamento TwoBee             ← MRR macro, solo se SuperAdmin abilita
```

### Portale Partner `/partner` (app_role: partner)

```
Dashboard                    ← consegne attese, task urgenti
Progetti assegnati           ← nome cliente VISIBILE
Task assegnate               ← filtrate per partner
Documenti                    ← shared partner_visible
Chat                         ← canali progetto + customer_care_partner
Consegne                     ← upload deliverable
```

### Portale Cliente `/portale` (app_role: client)

```
Dashboard                    ← stato servizi, aggiornamenti
Progetti
  ├─ Panoramica
  ├─ Da fare (task cliente)
  ├─ Aggiornamenti
  └─ Chat (customer care)
Lead Generation              ← SOLO se progetto lead gen attivo
  ├─ Contatti
  ├─ Per sorgente
  └─ Analytics
Report KPI
Documenti
Fatture
Profilo
```

---

## 4. Schema DB — modifiche e nuove tabelle

### 4.1 Modifiche a tabelle esistenti

```sql
-- ─── profiles: aggiungi resource_type e seniority ───────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS resource_type text,
  ADD COLUMN IF NOT EXISTS seniority text;
-- resource_type: dipendente | piva | freelance_continuativo | collaboratore_una_tantum | partner_aziendale
-- seniority: lead | senior | mid | junior | stage

-- ─── documents: aggiungi visibility ─────────────────────────────────────────
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'internal';
-- values: internal | operations_visible | partner_visible | client_visible
--         private_admin | private_founder | shared_in_report | draft

-- ─── projects: aggiungi manager_id ──────────────────────────────────────────
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ─── AppRole: aggiorna il tipo (solo TypeScript, non SQL) ───────────────────
-- Aggiungere 'founder' | 'stage' | 'freelance' | 'partner' al tipo AppRole
```

### 4.2 Nuove tabelle

```sql
-- ─── profile_permissions: permessi granulari per profilo ─────────────────────
CREATE TABLE IF NOT EXISTS public.profile_permissions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  permission  TEXT NOT NULL,
  -- Permessi disponibili:
  --   can_view_full_financials     → margini, costi, fatture, preventivi
  --   can_view_macro_revenue       → MRR aggregato, fatturato totale, obiettivo
  --   can_view_deals               → pipeline commerciale
  --   can_view_team_data           → dati HR team (solo admin/manager autorizzati)
  --   can_view_strategy            → strategia riservata
  --   can_approve_hr               → approva richieste HR
  --   can_configure_workspace      → configura navigazione workspace (delegato)
  --   can_manage_partners          → gestisce portale partner
  granted     BOOLEAN NOT NULL DEFAULT false,
  granted_by  UUID REFERENCES public.profiles(id),
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(profile_id, permission)
);

-- ─── workspace_sections: sezioni del portale Workspace ───────────────────────
CREATE TABLE IF NOT EXISTS public.workspace_sections (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key                  TEXT UNIQUE NOT NULL,
  label                TEXT NOT NULL,
  description          TEXT,
  route                TEXT NOT NULL,
  icon                 TEXT,
  sort_order           INT DEFAULT 0,
  is_active            BOOLEAN DEFAULT true,
  is_beta              BOOLEAN DEFAULT false,
  is_phase2            BOOLEAN DEFAULT false,
  requires_permission  TEXT,  -- FK logica a profile_permissions.permission
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);

-- ─── workspace_section_permissions: chi vede cosa nel Workspace ───────────────
CREATE TABLE IF NOT EXISTS public.workspace_section_permissions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id     UUID NOT NULL REFERENCES public.workspace_sections(id) ON DELETE CASCADE,
  app_role       TEXT,          -- applica a tutti con questo app_role
  resource_type  TEXT,          -- opzionale: filtra per tipo risorsa
  seniority      TEXT,          -- opzionale: filtra per seniority
  can_view       BOOLEAN DEFAULT false,
  can_create     BOOLEAN DEFAULT false,
  can_edit       BOOLEAN DEFAULT false,
  can_delete     BOOLEAN DEFAULT false,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- ─── hr_requests: ferie, permessi, malattia, spese ───────────────────────────
CREATE TABLE IF NOT EXISTS public.hr_requests (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type           TEXT NOT NULL,
  -- ferie | permesso | malattia | spesa | documento_hr
  status         TEXT NOT NULL DEFAULT 'pending',
  -- pending | approved | rejected | cancelled
  start_date     DATE,
  end_date       DATE,
  notes          TEXT,
  amount         DECIMAL(10,2),    -- solo per spese
  attachment_url TEXT,             -- ricevuta spesa / certificato malattia
  reviewed_by    UUID REFERENCES public.profiles(id),
  reviewed_at    TIMESTAMPTZ,
  review_note    TEXT,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

-- ─── lead_contacts: contatti Lead Generation per portale cliente ───────────────
CREATE TABLE IF NOT EXISTS public.lead_contacts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  project_id  UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  source      TEXT,
  -- meta_ads | google_ads | website | organic | whatsapp | email | other
  full_name   TEXT,
  email       TEXT,
  phone       TEXT,
  status      TEXT NOT NULL DEFAULT 'nuovo',
  -- nuovo | contattato | qualificato | in_trattativa | convertito | perso
  notes       TEXT,
  metadata    JSONB DEFAULT '{}',
  -- campo libero per dati extra dall'API (budget, campagna, landing page, ecc.)
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ─── task_block_reports: segnalazione blocco su una task ──────────────────────
CREATE TABLE IF NOT EXISTS public.task_block_reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id      UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  reported_by  UUID NOT NULL REFERENCES public.profiles(id),
  reason       TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'open',
  -- open | acknowledged | resolved
  resolved_by  UUID REFERENCES public.profiles(id),
  resolved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);
```

### 4.3 Seed dati workspace_sections (MVP day-one)

```sql
INSERT INTO public.workspace_sections (key, label, route, icon, sort_order, is_active, is_phase2) VALUES
  ('dashboard',          'Dashboard',          '/workspace',                   'LayoutDashboard', 1,  true,  false),
  ('mie_attivita',       'Le mie attività',    '/workspace/attivita',          'CheckSquare',     2,  true,  false),
  ('progetti',           'Progetti assegnati', '/workspace/progetti',           'FolderKanban',    3,  true,  false),
  ('calendario',         'Calendario',         '/workspace/calendario',         'Calendar',        4,  true,  false),
  ('chat',               'Chat',               '/workspace/chat',               'MessageSquare',   5,  true,  false),
  ('documenti',          'Documenti',          '/workspace/documenti',          'FileText',        6,  true,  false),
  ('hr',                 'Richieste HR',       '/workspace/hr',                 'Heart',           7,  true,  false),
  ('profilo',            'Profilo',            '/workspace/profilo',            'User',            8,  true,  true),
  ('performance',        'Performance',        '/workspace/performance',        'TrendingUp',      9,  false, true),
  ('knowledge',          'Knowledge',          '/workspace/knowledge',          'BookOpen',        10, false, true),
  ('ai_assistant',       'AI Assistant',       '/workspace/ai',                 'Sparkles',        11, false, true),
  ('andamento_twobee',   'Andamento TwoBee',   '/workspace/andamento',          'BarChart3',       12, false, true)
ON CONFLICT (key) DO NOTHING;
```

---

## 5. Navigazione Admin — struttura completa

```
/ (App Router: app/(dashboard)/)
├── dashboard/page.tsx             ← Dashboard Admin (layout fisso, no drag&drop)
├── clienti/
│   ├── page.tsx                   ← Lista clienti
│   └── [id]/page.tsx              ← Dettaglio cliente
├── progetti/page.tsx              ← Tutti i progetti
├── le-mie-attivita/page.tsx       ← Admin view delle proprie task
├── commerciale/
│   ├── page.tsx                   ← Pipeline deal
│   └── preventivi/page.tsx
├── controllo-gestione/page.tsx    ← FOUNDER/SUPERADMIN ONLY
├── team/
│   ├── page.tsx                   ← Lista risorse
│   ├── hr/page.tsx                ← Richieste HR da approvare
│   └── performance/page.tsx
├── direzione/
│   ├── okr/page.tsx               ← FOUNDER/SUPERADMIN ONLY
│   ├── roadmap/page.tsx
│   └── decision-center/page.tsx
└── sistema/
    ├── workspace/page.tsx         ← Configurazione Workspace (SUPERADMIN ONLY)
    ├── partner-portal/page.tsx
    └── impostazioni/page.tsx
```

---

## 6. Navigazione Workspace — struttura App Router

```
app/(workspace)/
├── layout.tsx                     ← Shell workspace (sidebar diversa)
├── workspace/page.tsx             ← Dashboard workspace
├── workspace/attivita/page.tsx    ← Le mie attività (port)
├── workspace/progetti/page.tsx    ← Progetti assegnati
├── workspace/calendario/page.tsx  ← Calendario personale
├── workspace/chat/page.tsx        ← Chat operativa
├── workspace/documenti/page.tsx   ← Documenti filtrati
├── workspace/hr/page.tsx          ← Richieste HR
└── workspace/profilo/page.tsx     ← Profilo (phase 2)
```

---

## 7. Navigazione Partner

```
app/(partner)/
├── layout.tsx
├── partner/page.tsx               ← Dashboard partner
├── partner/progetti/page.tsx
├── partner/task/page.tsx
├── partner/documenti/page.tsx
├── partner/chat/page.tsx
└── partner/consegne/page.tsx
```

---

## 8. Navigazione Cliente

```
app/(portale)/
├── portale/page.tsx               ← Dashboard cliente (invariata + estesa)
├── portale/progetti/[id]/page.tsx
├── portale/lead/page.tsx          ← NUOVO: Lead Generation (se attiva)
├── portale/kpi/page.tsx
├── portale/documenti/page.tsx
└── portale/fatture/page.tsx
```

---

## 9. Dati economici — visibilità per ruolo (dettaglio)

### Sezione "Andamento TwoBee" nel Workspace
Visibile a tutti i ruoli workspace se `workspace_sections.is_active = true` per la sezione `andamento_twobee`.
Mostra **esclusivamente**:
```
MRR Luglio 2026: 32.000 €
MRR Giugno 2026: 30.500 €
Fatturato mensile: 32.000 €
Fatturato annuale: 187.000 €
Obiettivo 2026: 350.000 €
Avanzamento: 53% ████████░░░░░░░░
```
Non mostra mai: cliente, progetto, risorsa, margine, costo.

### Manager — dati economici intermedi
Aggiuntivi rispetto agli operatori base:
- MRR per progetto (senza nome cliente → "Progetto Growth A", "Progetto Digital B")
- Stato incassi macro (fatturato emesso vs. incassato, aggregato)
- Obiettivi di reparto con progress

Ottenuti via: `profile_permissions.permission = 'can_view_manager_economics'` (permesso dedicato).

---

## 10. RLS Strategy

### Helper functions (create quando la tabella è pronta)

```sql
-- Quando profile_permissions è pronta:
CREATE OR REPLACE FUNCTION is_founder()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT app_role IN ('founder', 'super_admin')
  FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION is_workspace_user()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT app_role IN ('manager', 'senior', 'junior', 'stage', 'freelance')
  FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION is_partner_user()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT app_role = 'partner'
  FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION can_view_full_financials()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profile_permissions
    WHERE profile_id = auth.uid()
      AND permission = 'can_view_full_financials'
      AND granted = true
  ) OR get_my_app_role() IN ('super_admin', 'founder')
$$;

CREATE OR REPLACE FUNCTION can_view_macro_revenue()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT get_my_app_role() NOT IN ('partner', 'client', 'guest')
$$;
```

### RLS per tabelle critiche

```sql
-- documents: RLS per visibility
CREATE POLICY "documents_visibility" ON public.documents FOR SELECT
USING (
  CASE visibility
    WHEN 'private_founder'     THEN is_founder()
    WHEN 'private_admin'       THEN get_my_role() = 'admin' OR is_founder()
    WHEN 'internal'            THEN get_my_role() IN ('admin', 'team')
    WHEN 'operations_visible'  THEN is_workspace_user() OR get_my_role() = 'admin' OR is_founder()
    WHEN 'partner_visible'     THEN is_partner_user() OR get_my_role() IN ('admin', 'team') OR is_founder()
    WHEN 'client_visible'      THEN client_id IN (
      SELECT client_id FROM public.client_accounts WHERE profile_id = auth.uid()
    ) OR get_my_role() = 'admin' OR is_founder()
    WHEN 'shared_in_report'    THEN true
    WHEN 'draft'               THEN get_my_role() = 'admin' OR is_founder()
    ELSE false
  END
);

-- hr_requests: solo la propria richiesta o admin/founder
CREATE POLICY "hr_requests_own" ON public.hr_requests FOR SELECT
USING (
  profile_id = auth.uid()
  OR get_my_role() = 'admin'
  OR is_founder()
);

-- lead_contacts: solo cliente owner o admin/founder
CREATE POLICY "lead_contacts_client" ON public.lead_contacts FOR SELECT
USING (
  get_my_role() IN ('admin', 'team')
  OR is_founder()
  OR client_id IN (
    SELECT client_id FROM public.client_accounts WHERE profile_id = auth.uid()
  )
);

-- workspace_section_permissions: solo super_admin può scrivere
CREATE POLICY "workspace_sections_admin_only" ON public.workspace_sections FOR ALL
USING (get_my_app_role() = 'super_admin');

CREATE POLICY "workspace_sections_read" ON public.workspace_sections FOR SELECT
USING (true); -- tutti leggono, filtro lato app
```

---

## 11. Dashboard per ruolo

### Dashboard Admin / Founder (`/dashboard`)
Layout fisso (no drag&drop). Grid 3 colonne:

```
Row 1: [MRR Totale] [Fatturato Mese] [Clienti Attivi]
Row 2: [Revenue Chart 12m] . . . . . [Clienti a Rischio]
Row 3: [Progetti in Ritardo] [Task Critiche] [Deal Pipeline]
Row 4: [Controllo Gestione Widget*] [HR Requests pending] [AI Executive Brief]
* solo founder/super_admin
```

### Dashboard Workspace (`/workspace`)
```
Row 1: [Task di oggi] [Scadute] [In scadenza 7gg]
Row 2: [Le mie task (lista)] . . . . . [Calendario mini]
Row 3: [Progetti assegnati cards]
Row 4: [Chat ultimi messaggi] [Documenti recenti]
Row 5: [Andamento TwoBee*] [AI "Cosa fare oggi?"*]
* solo se sezione attiva
```

### Dashboard Partner (`/partner`)
```
Row 1: [Task aperte] [Consegne attese] [Scadute]
Row 2: [Progetti assegnati]
Row 3: [Chat] [Documenti recenti]
```

### Dashboard Cliente (`/portale`)
```
Row 1: [Stato servizio] [Aggiornamenti recenti]
Row 2: [Progetti attivi cards]
Row 3: [Lead ultimi contatti*] [KPI principali]
Row 4: [Fatture] [Documenti] [Chat customer care]
* solo se progetto lead gen attivo
```

---

## 12. Lead Generation — flusso dati

I contatti arrivano da API esterne (Meta, Google, sito). Due opzioni:

**Opzione A (consigliata MVP):** Webhook → `app/api/leads/inbound/route.ts` → INSERT su `lead_contacts`.
**Opzione B (phase 2):** Integrazione diretta via n8n / Zapier → stesso endpoint.

Campi `metadata` JSONB raccolgono tutto il resto (campagna, adset, landing, UTM).

Il cliente vede i propri lead filtrati da `lead_contacts.client_id`.
L'admin vede tutti i lead.

---

## 13. Chat — canali e visibilità

### Tipo canale nuovo: `partner_customer_care`
Quando un partner può chattare con il cliente, si crea un canale:
```
type: 'partner_customer_care'
client_id: UUID
project_id: UUID
```
Partecipanti: team TwoBee assegnato + partner assegnato + cliente.

Questo evita di passare messaggi cliente nei canali interni senza controllo.

---

## 14. Piano di implementazione — 23 giorni (8–31 Luglio)

### Fase 1 — Foundation (8–12 Luglio) ← 5 giorni
| # | Migrazione | Priorità |
|---|---|---|
| 077 | `app_role` update + `profiles.resource_type`, `seniority` | 🔴 |
| 078 | `profile_permissions` table + RLS | 🔴 |
| 079 | `workspace_sections` + `workspace_section_permissions` + seed | 🔴 |
| 080 | `documents.visibility` + RLS documenti | 🔴 |
| 081 | `projects.manager_id` | 🟡 |
| 082 | `hr_requests` table + RLS | 🔴 |
| 083 | `lead_contacts` table + RLS | 🟡 |
| 084 | `task_block_reports` table + RLS | 🟡 |

### Fase 2 — Portale Workspace (13–20 Luglio) ← 8 giorni
| Feature | Componente | Note |
|---|---|---|
| Layout `/workspace` | `app/(workspace)/layout.tsx` | Shell con sidebar workspace |
| Redirect per ruolo | `middleware.ts` update | workspace → /workspace se ruolo risorsa |
| Dashboard workspace | `WorkspaceDashboard` | KPI personali + AI |
| Port Le mie attività | `/workspace/attivita` | Riuso di MieAttivitaClient |
| Progetti assegnati | `/workspace/progetti` | Filtro RLS per assegnazione |
| Calendario workspace | `/workspace/calendario` | Port + filtri personali |
| Chat workspace | `/workspace/chat` | Canali team/progetto, no customer care |
| Documenti filtrati | `/workspace/documenti` | RLS visibility |
| Richieste HR | `/workspace/hr` | Form ferie/permessi/spese |

### Fase 3 — Admin refactor + Partner + Cliente esteso (21–27 Luglio) ← 7 giorni
| Feature | Note |
|---|---|
| Dashboard Admin layout fisso | Sostituisce drag&drop |
| Integrazione Controllo di Gestione in dashboard | Widget margin + costi |
| Portale Partner `/partner` | Nuovo layout |
| Sezione Lead Generation nel portale cliente | `/portale/lead` |
| Workspace Configurator (SuperAdmin) | UI per `workspace_sections` |
| Canale `partner_customer_care` | Tipo canale nuovo |

### Fase 4 — AI + RLS + Polish (28–31 Luglio) ← 4 giorni
| Feature | Note |
|---|---|
| AI Brief automatico progetto | Groq, visibile a workspace |
| AI "Cosa devo fare oggi?" | Dashboard workspace |
| Helper RLS `is_founder()`, `can_view_full_financials()` ecc. | |
| QA permessi + test RLS | Verifica con utenti test |

---

## 15. Rischi di sicurezza

| Rischio | Severità | Mitigazione |
|---|---|---|
| Workspace accede a API admin senza RLS | 🔴 CRITICO | RLS su ogni tabella sensibile prima del deploy |
| Partner vede messaggi chat cliente non filtrati | 🔴 CRITICO | Tipo canale dedicato `partner_customer_care` |
| Lead contacts GDPR | 🟠 ALTO | `metadata` JSONB, no PII in log, retention policy |
| Document visibility solo front-end | 🔴 CRITICO | RLS row-level obbligatoria su `documents` |
| Manager escalation via `profile_permissions` self-grant | 🟠 ALTO | RLS su `profile_permissions`: solo super_admin può scrivere |
| `can_view_full_financials` bypass via API diretta | 🔴 CRITICO | RLS su `invoices`, `quotes`, `resource_costs`, `business_costs` |
| Workspace fetcha task di altri utenti | 🟡 MEDIO | RLS task: solo task assegnate a `auth.uid()` per ruolo workspace |

---

## 16. Contraddizioni rilevate — richiedo conferma

1. **Q20 vs Q64**: Q20 dice "hardcoded" per navigazione Workspace, Q64 dice tabelle `workspace_sections` "MVP requirement". **Ho scelto dinamica da DB** (Q64 è più esplicito). Confermo?

2. **Manager dati economici**: Confermato che vede più degli operatori ma meno del founder. Ho proposto: MRR per progetto **anonimizzato** + fatturato macro + nessun compenso. Va bene, o vuoi definire più precisamente cosa vede il manager?

3. **Q14 sezioni MVP**: Non hai elencato esplicitamente le sezioni. Ho interpretato "1-2-3-4-5-6-7" (da Q73) come le prime 7 sezioni della lista di Q14. Confermo che le restanti (Profilo, Performance, Knowledge, AI, Andamento TwoBee) sono Phase 2?

4. **Routing di redirect**: Gli utenti workspace che entrano su `/` devono essere redirectati a `/workspace`? O possono accedere a entrambi? Ho pianificato un redirect in `middleware.ts`.

5. **`partner_customer_care` chat**: Il partner che chatta con il cliente usa un canale condiviso a 3 (Team TwoBee + Partner + Cliente). Il cliente vede solo i messaggi del suo canale. Confermo architettura?

---

## 17. Stato codebase attuale — cosa esiste già

| Feature | Stato | Note |
|---|---|---|
| `task_assignees` bridge table | ✅ | Migration 069+072 |
| `documents` table | ✅ | Manca campo `visibility` |
| `profiles.app_role` | ✅ | Manca `founder`, `stage`, `freelance`, `partner` |
| `resource_profiles` con `can_*` | ✅ | Utilizzabile per WorkspaceAuthorization |
| `/portale` cliente | ✅ | Invariato, da estendere con Lead |
| `/le-mie-attivita` | ✅ | Da portare su `/workspace/attivita` |
| `chat_channels` con tipi | ✅ | Da aggiungere `partner_customer_care` |
| `controllo-gestione/` | 🔄 WIP | Da integrare in dashboard Admin |
| Drag&drop dashboard | ✅ | Da sostituire con layout fisso |
| `task_deletion_requests` | ✅ | Da esporre nel Workspace |
| `deals` pipeline | ✅ | Dati ci sono, widget Admin da costruire |
| `objectives` OKR | ✅ | Dati ci sono, da filtrare per visibility |
