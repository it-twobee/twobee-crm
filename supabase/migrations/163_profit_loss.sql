-- 163 — Profit & Loss mensile.
--
-- Sostituisce il foglio Excel «P&L Two Bee» (un tab per mese) con un mese per
-- riga, righe di ricavo agganciabili ai clienti e righe di costo categorizzate.
--
-- Perché le righe sono copiate e non calcolate al volo dai clienti: un mese
-- chiuso deve restare quello che era. Se domani cambia l'MRR di un cliente, o
-- il cliente si perde, maggio non si riscrive. Il mese si *genera* dai clienti
-- attivi (vedi `app/actions/pl.ts`), poi vive di vita propria.
--
-- Il piano compensi non sta qui: sta in `lib/pl.ts`, con i default in
-- `pl_config` per poterlo correggere senza deploy.
--
-- Dati economici: RLS admin-only, come deals/quotes/invoices (mig. 100).

-- ── Mesi ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pl_months (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- sempre il primo del mese: è la chiave naturale
  month       DATE NOT NULL UNIQUE,
  status      TEXT NOT NULL DEFAULT 'aperto' CHECK (status IN ('aperto', 'chiuso')),
  note        TEXT,
  closed_at   TIMESTAMPTZ,
  created_by  UUID REFERENCES public.profiles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Entrate ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pl_revenue_lines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month_id      UUID NOT NULL REFERENCES public.pl_months(id) ON DELETE CASCADE,
  -- null = riga fuori anagrafica (una tantum, cliente non ancora censito)
  client_id     UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  label         TEXT NOT NULL,
  -- il piano contrattuale, per leggere lo scostamento dal fatturato reale
  plan_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,
  invoices      NUMERIC(6,2)  NOT NULL DEFAULT 1,
  -- imponibile del mese: è la base di ogni percentuale del piano compensi
  amount_net    NUMERIC(12,2) NOT NULL DEFAULT 0,
  vat_rate      NUMERIC(5,4)  NOT NULL DEFAULT 0.22,
  invoice_sent  BOOLEAN NOT NULL DEFAULT false,
  paid          BOOLEAN NOT NULL DEFAULT false,
  -- growth e digital hanno piani compensi diversi
  kind          TEXT NOT NULL DEFAULT 'growth' CHECK (kind IN ('growth', 'digital')),
  sales_owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- il commerciale può essere esterno all'anagrafica profili
  sales_owner   TEXT,
  note          TEXT,
  sort_order    INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pl_revenue_month ON public.pl_revenue_lines(month_id);
CREATE INDEX IF NOT EXISTS idx_pl_revenue_client ON public.pl_revenue_lines(client_id);

-- ── Uscite ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pl_cost_lines (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month_id    UUID NOT NULL REFERENCES public.pl_months(id) ON DELETE CASCADE,
  category    TEXT NOT NULL,
  label       TEXT NOT NULL,
  -- F = fisso, V = variabile
  cost_type   TEXT NOT NULL DEFAULT 'F' CHECK (cost_type IN ('F', 'V')),
  budget      NUMERIC(12,2) NOT NULL DEFAULT 0,
  actual      NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid        BOOLEAN NOT NULL DEFAULT false,
  vat_applied BOOLEAN NOT NULL DEFAULT false,
  vat_rate    NUMERIC(5,4) NOT NULL DEFAULT 0.22,
  note        TEXT,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pl_cost_month ON public.pl_cost_lines(month_id);

-- ── Piano compensi ───────────────────────────────────────────────────────────
-- Riga singola (id fisso): le percentuali si correggono senza rilasciare codice.
CREATE TABLE IF NOT EXISTS public.pl_config (
  id                     BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  growth_sales_pct       NUMERIC(5,4) NOT NULL DEFAULT 0.15,
  growth_delivery_pct    NUMERIC(5,4) NOT NULL DEFAULT 0.30,
  digital_sales_pct      NUMERIC(5,4) NOT NULL DEFAULT 0.06,
  digital_delivery_pct   NUMERIC(5,4) NOT NULL DEFAULT 0,
  cost_target_pct        NUMERIC(5,4) NOT NULL DEFAULT 0.35,
  risk_fund_pct          NUMERIC(5,4) NOT NULL DEFAULT 0.10,
  -- il residuo growth resta in cassa, quello digital si divide fra i soci
  growth_residual_to_company BOOLEAN NOT NULL DEFAULT true,
  partner_share_pct      NUMERIC(5,4) NOT NULL DEFAULT 0.30,
  company_share_pct      NUMERIC(5,4) NOT NULL DEFAULT 0.10,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.pl_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- Chi prende erogato e quota del residuo. L'ordine è quello di visualizzazione.
CREATE TABLE IF NOT EXISTS public.pl_partners (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  label       TEXT NOT NULL,
  takes_delivery BOOLEAN NOT NULL DEFAULT true,
  takes_residual BOOLEAN NOT NULL DEFAULT true,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  sort_order  INT NOT NULL DEFAULT 0
);
INSERT INTO public.pl_partners (label, sort_order)
SELECT x.label, x.ord FROM (VALUES ('Marco', 0), ('Toto', 10), ('Walter', 20)) AS x(label, ord)
WHERE NOT EXISTS (SELECT 1 FROM public.pl_partners);

-- ── RLS: solo admin, sono dati economici ─────────────────────────────────────
ALTER TABLE public.pl_months        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pl_revenue_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pl_cost_lines    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pl_config        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pl_partners      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pl_months_admin        ON public.pl_months;
DROP POLICY IF EXISTS pl_revenue_admin       ON public.pl_revenue_lines;
DROP POLICY IF EXISTS pl_cost_admin          ON public.pl_cost_lines;
DROP POLICY IF EXISTS pl_config_admin        ON public.pl_config;
DROP POLICY IF EXISTS pl_partners_admin      ON public.pl_partners;

CREATE POLICY pl_months_admin   ON public.pl_months        FOR ALL
  USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');
CREATE POLICY pl_revenue_admin  ON public.pl_revenue_lines FOR ALL
  USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');
CREATE POLICY pl_cost_admin     ON public.pl_cost_lines    FOR ALL
  USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');
CREATE POLICY pl_config_admin   ON public.pl_config        FOR ALL
  USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');
CREATE POLICY pl_partners_admin ON public.pl_partners      FOR ALL
  USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

-- PostgREST tiene in cache lo schema: senza questo le tabelle appena create
-- restano invisibili all'API finché non si ricarica da sé.
NOTIFY pgrst, 'reload schema';
