-- FASE 4b — Integrazioni per cliente: stato e segreti, separati.
-- Additiva + idempotente.
--
-- DUE TABELLE, NON UNA. È la lezione della 091 (google_credentials): un token
-- non deve stare dove la UI legge. `client_integrations` porta lo stato — la
-- pagina deve poter dire «collegato, ultima sincronizzazione 2 ore fa» — e
-- `client_integration_secrets` porta i token, con RLS deny-all e accesso solo
-- via service role. Se domani qualcuno scrive un `select('*')` di troppo sulla
-- prima tabella, non espone nulla.
--
-- NESSUNA TABELLA DATI NUOVA: i lead vanno in `lead_contacts` (083, mai usata:
-- ha già source ∈ meta_ads|google_ads|website…), le metriche in `client_kpis`
-- (che ha già orders_count, avg_order_value, cart_abandonment, ad_spend, cpl,
-- cpa, ctr, roas). Le integrazioni portano dati, non modelli.

CREATE TABLE IF NOT EXISTS public.client_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  provider TEXT NOT NULL
    CHECK (provider IN ('shopify','meta_ads','google_ads','web_form')),
  status TEXT NOT NULL DEFAULT 'non_configurata'
    CHECK (status IN ('non_configurata','attiva','errore','scaduta')),
  /** Dominio del negozio, ad account id, customer id: identifica l'account remoto. */
  external_account_id TEXT,
  label TEXT,
  /** Impostazioni NON segrete: nomi campo del form, valuta, fuso… */
  config JSONB NOT NULL DEFAULT '{}',
  last_sync_at TIMESTAMPTZ,
  last_error TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Un solo collegamento per provider su ogni progetto (o sul cliente se project_id è nullo).
  CONSTRAINT ci_unique UNIQUE (client_id, project_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_ci_client ON public.client_integrations(client_id);
CREATE INDEX IF NOT EXISTS idx_ci_project ON public.client_integrations(project_id);
CREATE INDEX IF NOT EXISTS idx_ci_provider ON public.client_integrations(provider, status);

ALTER TABLE public.client_integrations ENABLE ROW LEVEL SECURITY;

-- Lo staff vede lo STATO (serve alla UI). Scrive solo l'admin.
DROP POLICY IF EXISTS "ci_staff_read" ON public.client_integrations;
CREATE POLICY "ci_staff_read" ON public.client_integrations
  FOR SELECT USING (public.is_staff());
DROP POLICY IF EXISTS "ci_admin_write" ON public.client_integrations;
CREATE POLICY "ci_admin_write" ON public.client_integrations
  FOR ALL USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- ─── I segreti, invisibili a chiunque non sia service role ──────────────────

CREATE TABLE IF NOT EXISTS public.client_integration_secrets (
  integration_id UUID PRIMARY KEY REFERENCES public.client_integrations(id) ON DELETE CASCADE,
  access_token TEXT,
  refresh_token TEXT,
  expiry TIMESTAMPTZ,
  /** developer_token, customer_id, app_secret… ciò che varia per provider. */
  extra JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.client_integration_secrets ENABLE ROW LEVEL SECURITY;
-- NESSUNA POLICY: deny-all. Non aggiungerne — se serve sapere "è collegato?",
-- si legge client_integrations.status.
REVOKE ALL ON public.client_integration_secrets FROM anon, authenticated;

-- Il token in ingresso dei form: lo cerca l'endpoint pubblico, quindi serve
-- un indice. Vive fra i segreti perché chi lo possiede può scrivere lead.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cis_access_token
  ON public.client_integration_secrets(access_token)
  WHERE access_token IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_ci_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS ci_updated_at ON public.client_integrations;
CREATE TRIGGER ci_updated_at BEFORE UPDATE ON public.client_integrations
  FOR EACH ROW EXECUTE FUNCTION public.set_ci_updated_at();

DROP TRIGGER IF EXISTS cis_updated_at ON public.client_integration_secrets;
CREATE TRIGGER cis_updated_at BEFORE UPDATE ON public.client_integration_secrets
  FOR EACH ROW EXECUTE FUNCTION public.set_ci_updated_at();

-- ─── lead_contacts: tracciabilità della provenienza ─────────────────────────
-- La tabella esiste dalla 083 e non è mai stata usata (0 righe). Serve sapere
-- da quale collegamento è arrivato un lead, per diagnosticare i doppioni.

ALTER TABLE public.lead_contacts
  ADD COLUMN IF NOT EXISTS integration_id UUID REFERENCES public.client_integrations(id) ON DELETE SET NULL,
  /** id del lead sulla piattaforma di origine: evita reinserimenti a ogni sync. */
  ADD COLUMN IF NOT EXISTS external_id TEXT;

CREATE INDEX IF NOT EXISTS idx_lc_client_created
  ON public.lead_contacts(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lc_project ON public.lead_contacts(project_id);

-- Idempotenza delle sincronizzazioni: lo stesso lead remoto non entra due volte.
CREATE UNIQUE INDEX IF NOT EXISTS uq_lc_external
  ON public.lead_contacts(integration_id, external_id);

-- Verifica
SELECT 'client_integrations' AS t, COUNT(*) FROM public.client_integrations
UNION ALL SELECT 'lead_contacts', COUNT(*) FROM public.lead_contacts;

-- Rollback:
--   ALTER TABLE public.lead_contacts DROP COLUMN integration_id, DROP COLUMN external_id;
--   DROP TABLE public.client_integration_secrets, public.client_integrations;
