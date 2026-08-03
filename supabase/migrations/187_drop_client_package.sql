-- 187 — Via i pacchetti: «Hive Basic», «Worker Bee Start», «Partner Quota».
--
-- Erano nomi commerciali di listino, e come tali sono invecchiati: nelle fatture
-- del 2026 non compaiono più, i clienti comprano servizi (lead generation,
-- social, e-commerce, CRM) e li comprano a quote. Un'etichetta che nessuno
-- aggiorna più diventa una bugia ordinata: si legge «Hive Basic» e si pensa di
-- sapere cosa fa quel cliente.
--
-- La colonna era anche un ostacolo pratico: `NOT NULL` con un CHECK su valori
-- fissi, quindi caricare un cliente nuovo obbligava a scegliere un pacchetto
-- che non esiste più.
--
-- Cosa dice adesso cosa compra un cliente: i **progetti** (uno per servizio, col
-- suo `service_type` dal catalogo) e i **contratti** (`revenue_streams`, uno per
-- progetto, col suo importo). Sono due cose che si aggiornano da sole quando il
-- lavoro cambia, e non c'è nessuna etichetta da tenere sincronizzata.
--
-- La VIEW `clients_workspace` esponeva `package`: va ricreata, perché
-- CREATE OR REPLACE VIEW non permette di togliere una colonna dall'elenco.

BEGIN;

DROP VIEW IF EXISTS public.clients_workspace;

-- Identica alla 160, meno `package`. Restano azzerati i campi economici e
-- fiscali (D2/D3) e resta il filtro sugli esterni, che vedono solo i clienti
-- dei progetti di cui sono membri.
CREATE VIEW public.clients_workspace WITH (security_invoker = false) AS
SELECT
  id, company_name, display_name,
  contract_start, contract_end, payment_status,
  active_channels, status, client_type, client_label, is_internal, created_at, created_by,
  industry, market_area,
  target_leads_monthly, target_roas, target_followers_monthly, target_ctr, target_conv_rate,
  risk_score, prev_risk_score, risk_factors, risk_trend, risk_updated_at,
  phone, website,
  -- AZZERATI: economico/fiscale, non visibile al workspace
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

-- Il vincolo prima della colonna: senza, il DROP su un CHECK con quel nome
-- resterebbe orfano in alcune installazioni.
ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_package_check;
ALTER TABLE public.clients DROP COLUMN IF EXISTS package;

COMMIT;

NOTIFY pgrst, 'reload schema';
