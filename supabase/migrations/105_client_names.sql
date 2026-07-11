-- Fase 4a (§24) — Sdoppia il nome cliente: nome visualizzato vs ragione sociale.
-- Oggi `company_name` è l'unico campo e viene mostrato come "Ragione Sociale", ma di
-- fatto è il nome con cui chiamiamo il cliente. Additiva + idempotente.
--
--   display_name → nome con cui il cliente è chiamato ovunque nell'app (backfill da company_name)
--   legal_name   → ragione sociale legale (nuovo, opzionale: fatture/preventivi/documenti fiscali)
--
-- `company_name` resta la colonna storica (NOT NULL, usata da mille query): non la
-- tocchiamo. Le letture usano COALESCE(display_name, company_name).

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS legal_name   TEXT;

-- Backfill: il nome attuale diventa il nome visualizzato. La ragione sociale resta
-- vuota e si compila a mano solo dove differisce.
UPDATE public.clients SET display_name = company_name WHERE display_name IS NULL;

CREATE INDEX IF NOT EXISTS idx_clients_display_name ON public.clients(display_name);

-- La VIEW del workspace (mig. 100) deve esporre il nome visualizzato, altrimenti nel
-- Workspace il nome cliente sparirebbe. `legal_name` NON è esposto: è dato fiscale (D3).
-- DROP + CREATE: CREATE OR REPLACE non consente di inserire colonne nuove in mezzo
-- (rinominerebbe le colonne posizionali → errore 42P16). La VIEW non contiene dati.
DROP VIEW IF EXISTS public.clients_workspace;
CREATE VIEW public.clients_workspace WITH (security_invoker = false) AS
SELECT
  id, company_name, display_name,
  package, contract_start, contract_end, payment_status,
  active_channels, status, client_type, client_label, is_internal, created_at, created_by,
  industry, market_area,
  target_leads_monthly, target_roas, target_followers_monthly, target_ctr, target_conv_rate,
  risk_score, prev_risk_score, risk_factors, risk_trend, risk_updated_at,
  phone, website,
  -- AZZERATI: economico/fiscale, non visibile al workspace (D2/D3)
  0::numeric               AS mrr,
  NULL::text               AS legal_name,
  NULL::numeric            AS target_revenue_monthly,
  NULL::numeric            AS target_cpa,
  NULL::numeric            AS ad_budget_monthly,
  NULL::text               AS piva,
  NULL::text               AS fiscal_code,
  NULL::text               AS address,
  NULL::text               AS city,
  NULL::text               AS cap,
  NULL::text               AS country,
  NULL::text               AS sdi_code,
  NULL::text               AS pec,
  NULL::text               AS email_pec,
  NULL::text               AS notes,
  NULL::text               AS goals_notes
FROM public.clients
WHERE public.is_staff();

GRANT SELECT ON public.clients_workspace TO authenticated;
