-- ─── Quote Builder: estensione additiva della tabella quotes esistente ───────
-- La tabella quotes (011) esisteva senza UI. Si aggiungono i campi per il
-- calcolo margini; items JSONB viene riusato con shape strutturata
-- (righe risorsa con resource_cost_id, ore, markup). Stati esistenti invariati.

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS external_costs    JSONB        NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS total_cost        NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS target_margin     NUMERIC(4,3)  NOT NULL DEFAULT 0.6,
  ADD COLUMN IF NOT EXISTS final_price       NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS margin_amount     NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS margin_percentage NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_quotes_client ON public.quotes(client_id);
CREATE INDEX IF NOT EXISTS idx_quotes_deal   ON public.quotes(deal_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON public.quotes(status);

CREATE OR REPLACE FUNCTION public.set_quotes_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS quotes_updated_at ON public.quotes;
CREATE TRIGGER quotes_updated_at
  BEFORE UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.set_quotes_updated_at();

-- RLS: resta quella esistente (quotes_staff da 059 — solo staff, mai client).
