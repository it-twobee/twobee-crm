-- 107 — Knowledge cliente strutturata (§26, Fase 5).
--
-- Oggi client_knowledge (066) è un record piatto di campi TEXT. La spec chiede un
-- centro di conoscenza: Mercato, Competitor (lista), Brand, SWOT, Offerta, Idee
-- (lista con priorità/stato/autore), Informazioni strategiche e — riservata —
-- Marginalità.
--
-- Additiva e idempotente: nessun campo esistente viene rimosso o rinominato, la UI
-- vecchia continua a funzionare. I nuovi campi mono-valore stanno su client_knowledge;
-- competitor e idee diventano tabelle dedicate (liste vere, con autore e stato).
--
-- SICUREZZA: l'area Marginalità è economica → visibile SOLO ad admin (founder/
-- super_admin/admin), mai alle risorse workspace. Sta in una tabella separata con
-- RLS admin-only: tenerla come colonna di client_knowledge (RLS is_staff) l'avrebbe
-- esposta a tutto il team.

-- ── Campi mono-valore aggiuntivi su client_knowledge ─────────────────────────
ALTER TABLE public.client_knowledge
  -- Mercato
  ADD COLUMN IF NOT EXISTS market_sector       TEXT,
  ADD COLUMN IF NOT EXISTS market_scenario     TEXT,
  ADD COLUMN IF NOT EXISTS market_size         TEXT,
  ADD COLUMN IF NOT EXISTS market_trends       TEXT,
  ADD COLUMN IF NOT EXISTS market_geography    TEXT,
  ADD COLUMN IF NOT EXISTS market_seasonality  TEXT,
  ADD COLUMN IF NOT EXISTS market_regulations  TEXT,
  -- Brand
  ADD COLUMN IF NOT EXISTS brand_values        TEXT,
  ADD COLUMN IF NOT EXISTS brand_mission       TEXT,
  ADD COLUMN IF NOT EXISTS brand_vision        TEXT,
  ADD COLUMN IF NOT EXISTS brand_distinctive   TEXT,
  ADD COLUMN IF NOT EXISTS brand_perception    TEXT,
  ADD COLUMN IF NOT EXISTS brand_promises      TEXT,
  -- SWOT
  ADD COLUMN IF NOT EXISTS swot_strengths      TEXT,
  ADD COLUMN IF NOT EXISTS swot_weaknesses     TEXT,
  ADD COLUMN IF NOT EXISTS swot_opportunities  TEXT,
  ADD COLUMN IF NOT EXISTS swot_threats        TEXT,
  -- Offerta
  ADD COLUMN IF NOT EXISTS offer_value_prop    TEXT,
  ADD COLUMN IF NOT EXISTS offer_pricing       TEXT,
  ADD COLUMN IF NOT EXISTS offer_objections    TEXT,
  ADD COLUMN IF NOT EXISTS offer_differentiators TEXT,
  -- Informazioni strategiche
  ADD COLUMN IF NOT EXISTS strat_objectives    TEXT,
  ADD COLUMN IF NOT EXISTS strat_risks         TEXT,
  ADD COLUMN IF NOT EXISTS strat_dependencies  TEXT,
  ADD COLUMN IF NOT EXISTS strat_next_steps    TEXT;

-- ── Competitor (lista) ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.client_competitors (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  website      TEXT,
  positioning  TEXT,
  strengths    TEXT,
  weaknesses   TEXT,
  pricing      TEXT,
  channels     TEXT,
  notes        TEXT,
  links        TEXT,
  position     INT NOT NULL DEFAULT 0,
  created_by   UUID REFERENCES public.profiles(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS client_competitors_client_idx ON public.client_competitors(client_id);

ALTER TABLE public.client_competitors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "client_competitors_staff" ON public.client_competitors;
CREATE POLICY "client_competitors_staff" ON public.client_competitors
  FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());

-- ── Idee (lista) ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.client_ideas (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT,
  category     TEXT NOT NULL DEFAULT 'growth'
               CHECK (category IN ('growth','digital','ai','contenuti','advertising','prodotto','altro')),
  priority     TEXT NOT NULL DEFAULT 'media' CHECK (priority IN ('alta','media','bassa')),
  status       TEXT NOT NULL DEFAULT 'proposta'
               CHECK (status IN ('proposta','in_valutazione','approvata','scartata','realizzata')),
  position     INT NOT NULL DEFAULT 0,
  created_by   UUID REFERENCES public.profiles(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS client_ideas_client_idx ON public.client_ideas(client_id);

ALTER TABLE public.client_ideas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "client_ideas_staff" ON public.client_ideas;
CREATE POLICY "client_ideas_staff" ON public.client_ideas
  FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());

-- ── Marginalità / economia — RISERVATA ADMIN (§26 area protetta) ─────────────
CREATE TABLE IF NOT EXISTS public.client_economics (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,
  margin_notes  TEXT,
  cost_notes    TEXT,
  pricing_notes TEXT,
  founder_notes TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.client_economics ENABLE ROW LEVEL SECURITY;
-- NON is_staff(): solo role='admin' (founder/super_admin/admin via coarseRole).
DROP POLICY IF EXISTS "client_economics_admin" ON public.client_economics;
CREATE POLICY "client_economics_admin" ON public.client_economics
  FOR ALL USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

-- ── updated_at ───────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS client_competitors_updated_at ON public.client_competitors;
CREATE TRIGGER client_competitors_updated_at
  BEFORE UPDATE ON public.client_competitors
  FOR EACH ROW EXECUTE FUNCTION public.set_client_knowledge_updated_at();

DROP TRIGGER IF EXISTS client_ideas_updated_at ON public.client_ideas;
CREATE TRIGGER client_ideas_updated_at
  BEFORE UPDATE ON public.client_ideas
  FOR EACH ROW EXECUTE FUNCTION public.set_client_knowledge_updated_at();

DROP TRIGGER IF EXISTS client_economics_updated_at ON public.client_economics;
CREATE TRIGGER client_economics_updated_at
  BEFORE UPDATE ON public.client_economics
  FOR EACH ROW EXECUTE FUNCTION public.set_client_knowledge_updated_at();

-- Rollback: DROP TABLE client_competitors, client_ideas, client_economics;
-- ALTER TABLE client_knowledge DROP COLUMN market_*, brand_*, swot_*, offer_*, strat_*.
