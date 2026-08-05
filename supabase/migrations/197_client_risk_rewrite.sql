-- ═══════════════════════════════════════════════════════════════════════════
-- §197 — Il rischio cliente si calcola, non si conserva
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `compute_client_risk` (migration 014) leggeva `invoices`, `client_kpis` e
-- `tickets`. La **146** l'ha droppata nel reset insieme alla tabella `invoices`,
-- e le altre due sono rimaste vuote. Da allora nessuno ha più scritto
-- `clients.risk_score`: tutti gli undici clienti erano fermi a `0` con
-- `risk_factors = '{}'`, compresi i quattro con `payment_status = 'scaduto'`.
--
-- Il badge in lista mostrava «0 — Basso rischio» a chi non paga da mesi. Uno
-- zero che nessuno aggiorna è peggio di un campo vuoto: un campo vuoto lo si
-- nota, uno zero lo si crede. E ordinare la colonna «AI Risk» metteva tutti in
-- pari, quindi nessuno se ne accorgeva.
--
-- Il motore nuovo è `lib/risk.ts`, e **non scrive in tabella**:
--
--   * Le sorgenti sono già caricate dalle pagine che mostrano il rischio
--     (righe di conto economico, rate, contratti, `paused_at`, etichetta):
--     nessuna query in più, e nessun punteggio che invecchia fra due ricalcoli.
--   * Il motore è puro e prende **la data come parametro**, quindi «sta
--     peggiorando?» si risponde rieseguendolo trenta giorni indietro sugli
--     stessi dati, invece di confrontare il punteggio di oggi con un numero
--     rimasto in colonna da quando qualcuno lo scrisse.
--   * Un ricalcolo notturno su `clients` avrebbe scritto in `activity_log` a
--     ogni oscillazione (§179), riempiendo la cronologia di modifiche che
--     nessuna persona ha fatto.
--
-- Quindi le cinque colonne se ne vanno. Restano nel repo come storia, non come
-- lavoro arretrato: la stessa scelta della 187 sui pacchetti. Chi legge la
-- cronologia vede ancora le voci vecchie — `CronologiaClient` tiene l'etichetta
-- «risk score» per i diff già scritti, che non si riscrivono.
--
-- Idempotente. Nessun dato utile perso: i valori droppati erano tutti zero.

BEGIN;

-- Se un database non ha mai eseguito la 146, la funzione morta è ancora lì.
DROP FUNCTION IF EXISTS public.compute_client_risk(UUID) CASCADE;

-- CREATE OR REPLACE VIEW non permette di togliere colonne dall'elenco: la view
-- va ricreata. Identica alla 187, meno le cinque colonne di rischio.
DROP VIEW IF EXISTS public.clients_workspace;

CREATE VIEW public.clients_workspace WITH (security_invoker = false) AS
SELECT
  id, company_name, display_name,
  contract_start, contract_end, payment_status,
  active_channels, status, client_type, client_label, is_internal, created_at, created_by,
  industry, market_area,
  target_leads_monthly, target_roas, target_followers_monthly, target_ctr, target_conv_rate,
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

/* I quattro trigger della 014 (`trg_risk_clients`, `trg_risk_kpis`,
   `trg_risk_invoices`, `trg_risk_tickets`): già caduti col CASCADE della 146,
   ma su un database che l'ha saltata restano appesi. Il controllo sulla tabella
   serve perché `invoices` non esiste più, e `DROP TRIGGER ... ON` una tabella
   assente interrompe la transazione. */
DO $$
DECLARE t RECORD;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('trg_risk_clients',  'clients'),
      ('trg_risk_kpis',     'client_kpis'),
      ('trg_risk_invoices', 'invoices'),
      ('trg_risk_tickets',  'tickets')
    ) AS v(trg, tbl)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t.tbl
    ) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t.trg, t.tbl);
    END IF;
  END LOOP;
END $$;

-- Il wrapper che i trigger chiamavano, se è sopravvissuto al reset
DROP FUNCTION IF EXISTS public.trigger_update_risk() CASCADE;

ALTER TABLE public.clients
  DROP COLUMN IF EXISTS risk_score,
  DROP COLUMN IF EXISTS prev_risk_score,
  DROP COLUMN IF EXISTS risk_factors,
  DROP COLUMN IF EXISTS risk_trend,
  DROP COLUMN IF EXISTS risk_updated_at;

COMMIT;

NOTIFY pgrst, 'reload schema';
