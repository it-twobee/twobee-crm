# 07 — Piano di modifica database

Numerazione: il prossimo libero è **115** (`114_tasks_parent_id_fix.sql` è
l'ultima). Tutte le migration proposte sono **additive e idempotenti**.

---

## Perché NON basta aggiungere campi a `projects`

Il §5 del brief propone `projects.service_line` / `delivery_model` /
`revenue_model` / `lifecycle_status`.

`service_line` e `delivery_model` **servono** — descrivono il progetto.
`revenue_model` su `projects` **no**, e va rifiutato, per tre motivi:

1. `projects` non porta importi. Un `revenue_model='recurring'` su un progetto
   senza `amount` né date non permette di calcolare nulla.
2. Un cliente può avere un canone Growth **senza** progetto associato — è il caso
   di **tutti e 9** i clienti con MRR oggi in produzione. Il ricavo appeso al
   progetto sarebbe invisibile.
3. Un progetto Digital può avere ricavo misto (progetto una tantum + canone di
   manutenzione successivo). Un solo `revenue_model` per progetto non lo copre.

Il ricavo va su un'entità propria.

---

## 115 — Classificazione progetti (additiva)

```sql
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS service_line TEXT NOT NULL DEFAULT 'digital'
    CHECK (service_line IN ('growth','digital','ai','hybrid','consulting','other')),
  ADD COLUMN IF NOT EXISTS delivery_model TEXT NOT NULL DEFAULT 'structured_project'
    CHECK (delivery_model IN ('recurring_operations','structured_project','hybrid')),
  ADD COLUMN IF NOT EXISTS lifecycle_status TEXT NOT NULL DEFAULT 'active'
    CHECK (lifecycle_status IN ('draft','startup','active','paused','closed','archived'));

CREATE INDEX IF NOT EXISTS idx_projects_service_line ON public.projects(service_line);
```

**`project_kind` va deprecato, non duplicato.** `project_kind ∈ (growth, marketing,
digital, ai)` copre già ~80% di `service_line`. Con `projects` a 0 righe non c'è
backfill: si aggiunge `service_line`, si aggiorna il codice che legge
`project_kind` (`WorkloadClient`, `ProgettiWidget`, `lib/workload.ts`,
`ProgettiClient`) e si lascia `project_kind` in tabella come colonna morta,
rimossa in una migration successiva. Tenerle entrambe vive è il "non duplicare
colonne" del §5 violato.

`project_type ∈ (ecommerce, lead_gen, sito_web, app_ai, campagna, custom)` resta:
è la **tipologia tecnica**, ortogonale alla linea di servizio, e alimenta il campo
"Tipologia Digital" del wizard (§11).

---

## 116 — Ricavi: `revenue_streams` (nuova, il cuore)

Verificato prima di proporla: `quotes` ha i margini ma non date né ricorrenza né
link a progetto/fattura; `deals` è pipeline pre-vendita; `invoices` è il documento
emesso; `clients.mrr` è un numero senza contesto. **Nessuna struttura equivalente
esiste.**

```sql
CREATE TABLE IF NOT EXISTS public.revenue_streams (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  project_id    UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  quote_id      UUID REFERENCES public.quotes(id)   ON DELETE SET NULL,
  label         TEXT NOT NULL,
  service_line  TEXT NOT NULL
    CHECK (service_line IN ('growth','digital','ai','hybrid','consulting','other')),
  revenue_model TEXT NOT NULL
    CHECK (revenue_model IN ('recurring','one_off','milestone_based','maintenance','usage_based','non_billable')),
  amount            NUMERIC(12,2) NOT NULL DEFAULT 0,   -- per periodo se ricorrente, totale se one-off
  currency          TEXT NOT NULL DEFAULT 'EUR',
  billing_frequency TEXT
    CHECK (billing_frequency IN ('mensile','bimestrale','trimestrale','semestrale','annuale','una_tantum')),
  start_date        DATE NOT NULL,
  end_date          DATE,                    -- NULL = indeterminato
  competence_start  DATE,
  competence_end    DATE,
  status            TEXT NOT NULL DEFAULT 'attivo'
    CHECK (status IN ('bozza','attivo','sospeso','cessato')),
  payment_terms     TEXT,
  source            TEXT,                    -- 'quote' | 'manuale' | 'import'
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rs_client  ON public.revenue_streams(client_id);
CREATE INDEX IF NOT EXISTS idx_rs_project ON public.revenue_streams(project_id);
CREATE INDEX IF NOT EXISTS idx_rs_active  ON public.revenue_streams(status, service_line);

ALTER TABLE public.revenue_streams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rs_admin" ON public.revenue_streams
  FOR ALL USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');
```

**`clients.mrr` diventa derivato.** Non si cancella (troppe letture, doc 01 §1),
ma smette di essere la fonte: un trigger su `revenue_streams` lo ricalcola come
Σ degli stream `recurring`/`maintenance` attivi normalizzati a mese. Le 6
`reduce` esistenti continuano a funzionare e diventano automaticamente corrette.
È il modo per non riscrivere 6 componenti nella stessa PR.

Il campo va poi reso read-only in UI (`NewClientModal`, `AnagraficaTab`) —
altrimenti si riapre la divergenza.

---

## 117 — SAL e piano di fatturazione

```sql
CREATE TABLE IF NOT EXISTS public.revenue_milestones (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id       UUID NOT NULL REFERENCES public.revenue_streams(id) ON DELETE CASCADE,
  label           TEXT NOT NULL,             -- 'Acconto 30%', 'SAL 1', 'Saldo'
  amount          NUMERIC(12,2) NOT NULL,
  due_on          DATE,
  trigger_task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,  -- milestone di progetto
  status          TEXT NOT NULL DEFAULT 'previsto'
    CHECK (status IN ('previsto','maturato','fatturato','incassato','annullato')),
  invoice_id      UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  position        INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Admin-only, stessa policy.

---

## 118 — `invoices`: i due fix bloccanti

```sql
-- 1) rimuovere il vincolo che impedisce Growth+Digital nello stesso mese
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_client_id_month_key;

-- 2) collegare la fattura alla sua fonte
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS stream_id            UUID REFERENCES public.revenue_streams(id)    ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revenue_milestone_id UUID REFERENCES public.revenue_milestones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS project_id           UUID REFERENCES public.projects(id)           ON DELETE SET NULL,
  -- 3) IVA esplicita (oggi `amount` è ambiguo)
  ADD COLUMN IF NOT EXISTS taxable_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS vat_rate       NUMERIC(5,2) DEFAULT 22,
  ADD COLUMN IF NOT EXISTS vat_amount     NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS total_gross    NUMERIC(12,2);
```

`DROP CONSTRAINT` è l'**unica modifica non additiva** dell'intero piano. Con 0
fatture in produzione è a rischio zero. Con dati reali sarebbe stata una
migrazione delicata: farlo adesso è una finestra che si chiude.

Sull'IVA: `amount` resta e continua a significare quello che significa oggi
(Q8 decide se netto o lordo); i nuovi campi lo scompongono. Il backfill è banale
perché non ci sono righe.

---

## 119 — Growth engine

```sql
CREATE TABLE IF NOT EXISTS public.growth_routines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  template_id   UUID REFERENCES public.task_templates(id) ON DELETE SET NULL,
  title         TEXT NOT NULL,
  description   TEXT,
  frequency     TEXT NOT NULL
    CHECK (frequency IN ('settimanale','quindicinale','mensile','trimestrale','custom')),
  rrule            TEXT,
  default_owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  default_estimated_hours NUMERIC(6,2),
  starts_on     DATE NOT NULL,
  ends_on       DATE,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.growth_initiatives (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  start_date  DATE,
  end_date    DATE,
  budget      NUMERIC(12,2),
  owner_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status      TEXT NOT NULL DEFAULT 'pianificata'
    CHECK (status IN ('pianificata','in_corso','completata','annullata')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

RLS: lettura staff (`is_staff()`), scrittura admin + PM del progetto —
stesso pattern di `app/actions/workload-tasks.ts`.

---

## 120 — `tasks`: scope, work_type, idempotenza

```sql
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS client_id  UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scope_type TEXT NOT NULL DEFAULT 'project'
    CHECK (scope_type IN ('project','client','personal')),
  ADD COLUMN IF NOT EXISTS work_type  TEXT NOT NULL DEFAULT 'project'
    CHECK (work_type IN ('project','startup','routine','initiative','adhoc')),
  ADD COLUMN IF NOT EXISTS routine_id    UUID REFERENCES public.growth_routines(id)    ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS initiative_id UUID REFERENCES public.growth_initiatives(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS period_key TEXT;

-- Idempotenza della generazione routine (§20.11)
CREATE UNIQUE INDEX IF NOT EXISTS uq_tasks_routine_period
  ON public.tasks(routine_id, period_key) WHERE routine_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_client ON public.tasks(client_id);
CREATE INDEX IF NOT EXISTS idx_tasks_scope  ON public.tasks(scope_type);
```

Backfill (7 righe di test): `scope_type='personal'` — oppure cancellazione (Q23).

**Attenzione**: il default `scope_type='project'` è corretto per il futuro ma
sbagliato per le 7 righe esistenti, che hanno `project_id IS NULL`. Il backfill
va nella **stessa** migration, prima del `CHECK` di coerenza, altrimenti il
constraint fallisce.

---

## 121 — RLS ad hoc (sostituisce la 094)

```sql
DROP POLICY IF EXISTS "tasks_team_read_all" ON public.tasks;
CREATE POLICY "tasks_team_read_all" ON public.tasks
  FOR SELECT USING (
    public.get_my_role() = 'team' AND scope_type IN ('project','client')
  );
```

Rollback documentato: ricreare la policy 094.

---

## 122 — `workspace_revenue_summary` (RPC)

Vedi `06-PERMISSION_MATRIX.md`. Con eventuale
`company_targets(year, revenue_target)` se Q11 = sì.

---

## 123 — Estensione `data_quality_report`

Solo dopo che le precedenti sono in produzione. Controlli in
`09-MIGRATION_AND_BACKFILL_PLAN.md`.

---

## Riepilogo

| # | Cosa | Additiva | Rischio |
|---|---|---|---|
| 115 | `projects`: service_line, delivery_model, lifecycle_status | ✅ | nullo (0 righe) |
| 116 | `revenue_streams` + trigger su `clients.mrr` | ✅ | basso |
| 117 | `revenue_milestones` | ✅ | nullo |
| 118 | `invoices`: DROP UNIQUE, link, IVA | ⚠️ un DROP CONSTRAINT | nullo **oggi** (0 righe) |
| 119 | `growth_routines`, `growth_initiatives` | ✅ | nullo |
| 120 | `tasks`: scope_type, work_type, client_id, idempotenza | ✅ | basso (7 righe di test) |
| 121 | RLS task ad hoc | policy | medio — **va testata con un utente `team` reale** |
| 122 | RPC `workspace_revenue_summary` | ✅ | basso |
| 123 | data quality | ✅ | nullo |
