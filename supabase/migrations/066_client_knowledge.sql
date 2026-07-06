-- ─── Knowledge base strutturata per cliente ──────────────────────────────────
-- Additiva. client_notes resta per le note libere; questa tabella contiene i
-- dati strutturati (offerta, target, competitor, tone of voice…) che
-- alimentano proposte commerciali, AI, report e onboarding operativo.
-- Un record per cliente (UNIQUE client_id).

CREATE TABLE IF NOT EXISTS public.client_knowledge (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        UUID NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,
  business_model   TEXT,
  main_offer       TEXT,
  target_audience  TEXT,
  competitors      TEXT,
  tone_of_voice    TEXT,
  brand_assets_url TEXT,
  access_status    TEXT,
  pain_points      TEXT,
  strategic_notes  TEXT,
  buyer_personas   TEXT,
  services_active  TEXT,
  do_not_do        TEXT,
  opportunities    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.set_client_knowledge_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS client_knowledge_updated_at ON public.client_knowledge;
CREATE TRIGGER client_knowledge_updated_at
  BEFORE UPDATE ON public.client_knowledge
  FOR EACH ROW EXECUTE FUNCTION public.set_client_knowledge_updated_at();

-- RLS: knowledge interna per lo staff operativo — mai visibile al cliente.
ALTER TABLE public.client_knowledge ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "client_knowledge_staff" ON public.client_knowledge;
CREATE POLICY "client_knowledge_staff" ON public.client_knowledge
  FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());
