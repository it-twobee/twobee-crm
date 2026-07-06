-- ─── Proposte commerciali (white label) generate da preventivo/deal ──────────
-- Additiva. Le sezioni vivono in content_json (JSONB); nessuna tabella
-- proposal_sections/templates finché non servono davvero.

CREATE TABLE IF NOT EXISTS public.proposal_documents (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id                 UUID REFERENCES public.quotes(id)   ON DELETE SET NULL,
  client_id                UUID REFERENCES public.clients(id)  ON DELETE SET NULL,
  deal_id                  UUID REFERENCES public.deals(id)    ON DELETE SET NULL,
  title                    TEXT NOT NULL,
  brand_mode               TEXT NOT NULL DEFAULT 'twobee'
    CHECK (brand_mode IN ('twobee','white_label','partner_branded','neutral')),
  white_label_partner_name TEXT,
  status                   TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','ready','sent','accepted','rejected')),
  content_json             JSONB NOT NULL DEFAULT '{}',
  html_content             TEXT,
  pdf_url                  TEXT,
  created_by               UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proposals_quote  ON public.proposal_documents(quote_id);
CREATE INDEX IF NOT EXISTS idx_proposals_client ON public.proposal_documents(client_id);

CREATE OR REPLACE FUNCTION public.set_proposals_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS proposals_updated_at ON public.proposal_documents;
CREATE TRIGGER proposals_updated_at
  BEFORE UPDATE ON public.proposal_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_proposals_updated_at();

-- RLS: documento commerciale interno — solo staff, mai client/guest.
ALTER TABLE public.proposal_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "proposals_staff" ON public.proposal_documents;
CREATE POLICY "proposals_staff" ON public.proposal_documents
  FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());
