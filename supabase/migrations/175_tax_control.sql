-- 175 — Fiscale: le aliquote si configurano, gli accantonamenti si registrano.
--
-- Il conto economico dice quanto hai guadagnato. Le tasse su quel guadagno
-- escono mesi dopo, tutte insieme, e sono la ragione più comune per cui
-- un'azienda in utile si trova senza cassa a giugno.
--
-- Due tabelle, nessuna magia:
--
--   tax_config      le aliquote e la quota da mettere da parte. Stanno in
--                   configurazione perché cambiano con le leggi, e nessuno
--                   deve rilasciare codice per aggiornare un'IRES.
--
--   tax_provisions  quanto hai davvero accantonato, mese per mese. Senza
--                   questo il tool può solo dirti quanto dovresti mettere via,
--                   non se l'hai fatto — ed è la seconda che conta.
--
-- Le stime restano stime: l'imponibile fiscale non è il margine civilistico
-- (deducibilità parziali, ammortamenti, riprese in aumento). L'interfaccia lo
-- dice a chiare lettere invece di far finta di essere un commercialista.

CREATE TABLE IF NOT EXISTS public.tax_config (
  id             BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  -- SRL: IRES 24% sull'imponibile, IRAP 3,9% sul valore della produzione
  ires_pct       NUMERIC(5,4) NOT NULL DEFAULT 0.24,
  irap_pct       NUMERIC(5,4) NOT NULL DEFAULT 0.039,
  irap_applies   BOOLEAN NOT NULL DEFAULT true,
  -- quanto del margine mettere da parte ogni mese per IVA e imposte
  set_aside_pct  NUMERIC(5,4) NOT NULL DEFAULT 0.30,
  /* l'IRAP non ammette in deduzione il costo del personale dipendente a tempo
     indeterminato (deduzione del costo residuo): la base è più larga di quella
     IRES. Qui si tiene la quota di costi indeducibili ai fini IRAP come stima
     grossolana, dichiarata come tale. */
  irap_addback_pct NUMERIC(5,4) NOT NULL DEFAULT 0.00,
  note           TEXT,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.tax_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.tax_provisions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month      DATE NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'imposte' CHECK (kind IN ('iva', 'imposte')),
  amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tax_provisions_month ON public.tax_provisions(month);

-- ── RLS: è il dato più sensibile che c'è ────────────────────────────────────
ALTER TABLE public.tax_config     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_provisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tax_config_admin ON public.tax_config;
CREATE POLICY tax_config_admin ON public.tax_config FOR ALL
  USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS tax_provisions_admin ON public.tax_provisions;
CREATE POLICY tax_provisions_admin ON public.tax_provisions FOR ALL
  USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

NOTIFY pgrst, 'reload schema';
