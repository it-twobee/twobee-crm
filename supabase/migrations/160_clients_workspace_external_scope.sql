-- 160 — La VIEW del workspace smette di mostrare tutti i clienti alle risorse esterne.
--
-- `clients_workspace` (100/105) è WITH (security_invoker = false): gira con i diritti
-- del creatore, quindi la RLS di `clients` non la tocca. L'unico filtro è is_staff(),
-- cioè get_my_role() IN ('admin','team') — e freelance e partner hanno role='team'.
-- Risultato: un esterno che apre /workspace/clienti vede l'elenco completo dei clienti
-- (nome, pacchetto, canali, target, telefono, sito, risk score), anche di clienti su
-- cui non ha mai lavorato.
--
-- La 106 aveva lo scoping giusto sulla tabella base (`clients_external`), ma la 146 ha
-- droppato `get_my_project_ids()` con CASCADE portandosela via — deliberatamente, in
-- attesa del nuovo modello progetto. Il nuovo modello c'è (148): l'appartenenza a un
-- progetto ora è `project_members`, via get_my_v2_project_ids().
--
-- Qui rimettiamo il confine dove serve davvero, nella view: team interno invariato,
-- esterni solo i clienti dei progetti di cui sono membri. Colonne identiche alla 105,
-- cambia solo la WHERE — nessun impatto sulle query dell'app.

CREATE OR REPLACE VIEW public.clients_workspace WITH (security_invoker = false) AS
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
FROM public.clients c
WHERE public.is_staff()
  AND (
    NOT public.is_external_resource()
    OR c.id IN (
      SELECT p.client_id FROM public.projects p
      WHERE p.id = ANY (public.get_my_v2_project_ids()) AND p.client_id IS NOT NULL
    )
  );

GRANT SELECT ON public.clients_workspace TO authenticated;
