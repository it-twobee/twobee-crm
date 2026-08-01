-- 171 — I costi hanno un piano, non solo un consuntivo.
--
-- Oggi le uscite esistono solo dentro un mese di conto economico: si copiano
-- dal mese prima e si correggono a mano. Va bene per registrare, non per
-- governare. Non si sa quanto una divisione può spendere, non si vede se
-- l'ha sforato, e la stessa spesa va riscritta dodici volte l'anno.
--
-- Tre pezzi:
--
--   cost_centers   le aree su cui si spende (Struttura, Persone, Marketing…).
--                  È il livello a cui si decide: un budget si dà a un'area,
--                  non a una singola licenza software.
--
--   cost_items     il piano delle spese ricorrenti — l'anagrafica. Ognuna sa
--                  quanto costa, ogni quanto torna, se è fissa o variabile.
--                  Da qui il mese si popola da solo.
--
--   cost_budgets   il budget di un'area per un mese preciso, quando il tetto
--                  ordinario non vale (dicembre, un lancio, un investimento).
--
-- Il conto economico resta la fonte del consuntivo: `pl_cost_lines` guadagna
-- il riferimento all'area e alla voce di piano, così ogni euro speso sa da
-- quale budget esce. Gli importi restano copiati nel mese — un mese chiuso non
-- si riscrive perché domani cambia il canone di un software.

CREATE TABLE IF NOT EXISTS public.cost_centers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  description    TEXT,
  -- il tetto ordinario del mese: `cost_budgets` lo scavalca dove serve
  monthly_budget NUMERIC(12,2) NOT NULL DEFAULT 0,
  sort_order     INT NOT NULL DEFAULT 0,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cost_centers_name ON public.cost_centers (lower(name));

CREATE TABLE IF NOT EXISTS public.cost_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id   UUID REFERENCES public.cost_centers(id) ON DELETE SET NULL,
  category    TEXT NOT NULL,
  label       TEXT NOT NULL,
  -- F = fisso (c'è comunque), V = variabile (segue il lavoro venduto)
  cost_type   TEXT NOT NULL DEFAULT 'F' CHECK (cost_type IN ('F', 'V')),
  -- quanto costa OGNI VOLTA che torna, non quanto costa al mese: un canone
  -- annuale da 1.200 pesa 1.200 nel mese in cui si paga, non 100 al mese
  amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  frequency   TEXT NOT NULL DEFAULT 'mensile'
              CHECK (frequency IN ('mensile', 'bimestrale', 'trimestrale', 'semestrale', 'annuale', 'una_tantum')),
  vat_applied BOOLEAN NOT NULL DEFAULT false,
  vat_rate    NUMERIC(5,4) NOT NULL DEFAULT 0.22,
  supplier    TEXT,
  -- da quando e fino a quando la spesa esiste (primo giorno del mese)
  start_month DATE,
  end_month   DATE,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  note        TEXT,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cost_items_center ON public.cost_items(center_id);
CREATE INDEX IF NOT EXISTS idx_cost_items_active ON public.cost_items(is_active);

CREATE TABLE IF NOT EXISTS public.cost_budgets (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id  UUID NOT NULL REFERENCES public.cost_centers(id) ON DELETE CASCADE,
  month      DATE NOT NULL,
  amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (center_id, month)
);

CREATE INDEX IF NOT EXISTS idx_cost_budgets_month ON public.cost_budgets(month);

-- ── Il consuntivo sa da quale budget esce ───────────────────────────────────
ALTER TABLE public.pl_cost_lines
  ADD COLUMN IF NOT EXISTS center_id UUID REFERENCES public.cost_centers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cost_item_id UUID REFERENCES public.cost_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pl_cost_center ON public.pl_cost_lines(center_id);
-- una voce di piano entra una volta sola per mese: rilanciare la generazione
-- aggiunge quello che manca invece di duplicare
CREATE UNIQUE INDEX IF NOT EXISTS idx_pl_cost_item_month
  ON public.pl_cost_lines(month_id, cost_item_id) WHERE cost_item_id IS NOT NULL;

-- ── RLS: dati economici, admin e basta ──────────────────────────────────────
ALTER TABLE public.cost_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_budgets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cost_centers_admin ON public.cost_centers;
CREATE POLICY cost_centers_admin ON public.cost_centers FOR ALL
  USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS cost_items_admin ON public.cost_items;
CREATE POLICY cost_items_admin ON public.cost_items FOR ALL
  USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS cost_budgets_admin ON public.cost_budgets;
CREATE POLICY cost_budgets_admin ON public.cost_budgets FOR ALL
  USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

-- ── Aree di partenza ────────────────────────────────────────────────────────
-- Ricalcano le categorie che il conto economico usa già: senza, la prima
-- schermata sarebbe vuota e ogni riga esistente resterebbe senza area.
INSERT INTO public.cost_centers (name, description, sort_order) VALUES
  ('Struttura & Software', 'Licenze, tool, hosting: quello che tiene accesa l''azienda', 10),
  ('Persone',              'Compensi, collaboratori, formazione', 20),
  ('Delivery & Fornitori', 'Chi eroga per conto nostro: freelance, agenzie, produzione', 30),
  ('Marketing TwoBee',     'Quello che spendiamo per farci trovare noi', 40),
  ('Amministrazione',      'Commercialista, legale, banca, assicurazioni', 50),
  ('Sede & Overhead',      'Coworking, trasferte, imprevisti', 60)
ON CONFLICT DO NOTHING;

-- ── Le uscite già registrate trovano la loro area ───────────────────────────
UPDATE public.pl_cost_lines l
SET center_id = c.id
FROM public.cost_centers c
WHERE l.center_id IS NULL AND c.name = CASE l.category
  WHEN 'Software & Tool'  THEN 'Struttura & Software'
  WHEN 'HR'               THEN 'Persone'
  WHEN 'Outsourcing'      THEN 'Delivery & Fornitori'
  WHEN 'Marketing TwoBee' THEN 'Marketing TwoBee'
  WHEN 'Professionali'    THEN 'Amministrazione'
  WHEN 'Banca'            THEN 'Amministrazione'
  WHEN 'Overhead'         THEN 'Sede & Overhead'
  ELSE NULL END;

NOTIFY pgrst, 'reload schema';
