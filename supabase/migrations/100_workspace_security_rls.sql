-- FASE 0 — Fondamenta di sicurezza Workspace (D1/D2/D3).
-- Additiva + idempotente. Porta le barriere economiche dal solo layer UI al layer RLS.
-- Da eseguire INSIEME al deploy del codice che ripunta le pagine workspace a clients_workspace.

-- ── 0a) Commerciale + fatture → SOLO admin (era is_staff = admin OR team) ──────
DROP POLICY IF EXISTS "deals_staff" ON public.deals;
DROP POLICY IF EXISTS "deals_admin" ON public.deals;
CREATE POLICY "deals_admin" ON public.deals
  FOR ALL USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "deal_activities_staff" ON public.deal_activities;
DROP POLICY IF EXISTS "deal_activities_admin" ON public.deal_activities;
CREATE POLICY "deal_activities_admin" ON public.deal_activities
  FOR ALL USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "quotes_staff" ON public.quotes;
DROP POLICY IF EXISTS "quotes_admin" ON public.quotes;
CREATE POLICY "quotes_admin" ON public.quotes
  FOR ALL USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "proposals_staff" ON public.proposal_documents;
DROP POLICY IF EXISTS "proposals_admin" ON public.proposal_documents;
CREATE POLICY "proposals_admin" ON public.proposal_documents
  FOR ALL USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

-- invoices: via il read del team; restano invoices_admin (admin) + invoices_client_read (cliente)
DROP POLICY IF EXISTS "invoices_team_read" ON public.invoices;

-- ── 0b) clients: il team legge solo colonne operative via VIEW ────────────────
-- L'RLS è row-level e non può nascondere mrr/fiscali. La VIEW espone una shape
-- Client completa con le colonne economiche/fiscali AZZERATE (mrr=0, resto NULL).
-- security_invoker=false (definer) + WHERE is_staff() → team+admin vedono le righe,
-- client/guest no. Tenuti operativi: package/contratto/payment_status/KPI/risk/contatti.
CREATE OR REPLACE VIEW public.clients_workspace WITH (security_invoker = false) AS
SELECT
  id, company_name, package, contract_start, contract_end, payment_status,
  active_channels, status, client_type, client_label, is_internal, created_at, created_by,
  industry, market_area,
  target_leads_monthly, target_roas, target_followers_monthly, target_ctr, target_conv_rate,
  risk_score, prev_risk_score, risk_factors, risk_trend, risk_updated_at,
  phone, website,
  -- AZZERATI: economico/fiscale, non visibile al workspace (D2/D3)
  0::numeric               AS mrr,
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

-- Il team non legge più la tabella clients direttamente (mrr/fiscali chiusi).
-- Restano clients_admin_all (admin) e clients_client_own (cliente sul proprio).
DROP POLICY IF EXISTS "clients_team_all" ON public.clients;

-- ── Rollback (se servisse) ───────────────────────────────────────────────────
-- Ricreare: clients_team_all (092), deals_staff/quotes_staff/... (059/065),
-- invoices_team_read (002); DROP VIEW public.clients_workspace.
