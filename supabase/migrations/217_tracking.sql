-- §316 — Modulo Tracking: stato tracking, checklist, verifica sito, QA
-- giornaliero, report GA4/Klaviyo/Meta, chiavi e accessi cifrati.
--
-- Nasce dal port di «arealavoro», l'app sviluppata a parte su SQLite. Qui
-- entra solo il dominio nuovo: clienti, utenti e sessioni restano quelli del
-- CRM. Il database di partenza era vuoto, quindi nessun travaso di dati.
--
-- Due famiglie di tabelle, con due regole diverse:
--
-- 1. Non segrete (`client_tracking`, checklist, verifiche, QA, report): le
--    legge e le scrive tutto lo staff via RLS `is_staff()`, da entrambi i
--    portali. `client_tracking` è una tabella satellite 1:1 e non colonne su
--    `clients`, perché `clients_workspace` è una VIEW con l'elenco esplicito
--    delle colonne (160): ogni campo nuovo lì obbligherebbe a rifarla.
--
-- 2. Segrete (`client_platform_keys`, `client_logins`, `agency_platform_keys`):
--    RLS attiva e NESSUNA policy, più REVOKE — stesso schema della 091 e della
--    115. Ci arriva solo il service role, sempre dentro una server action che
--    decide chi può vedere cosa (`TRACKING_SECRET_ROLES` in lib/permissions).
--    I valori sono cifrati AES-256-GCM con la chiave in `VAULT_KEY` (env):
--    `blob` è base64 di iv(12) | authTag(16) | ciphertext. Chi legge la tabella
--    senza la chiave non legge nulla; chi perde la chiave perde i segreti, che
--    si rigenerano dalle piattaforme. Non c'è rekey per scelta.

BEGIN;

-- ── Stato tracking del cliente (1:1) ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.client_tracking (
  client_id         UUID PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  archetype         TEXT CHECK (archetype IS NULL OR archetype IN ('ecommerce','leadgen-b2b','hospitality')),
  cms               TEXT NOT NULL DEFAULT '',
  gtm_container_id  TEXT NOT NULL DEFAULT '',
  meta_pixel_id     TEXT NOT NULL DEFAULT '',
  ga4_property_id   TEXT NOT NULL DEFAULT '',
  -- evento del funnel B2B; vuoto = generate_lead
  lead_event        TEXT NOT NULL DEFAULT '',
  status_gtm        TEXT NOT NULL DEFAULT 'todo' CHECK (status_gtm        IN ('active','partial','todo','na')),
  status_ga4        TEXT NOT NULL DEFAULT 'todo' CHECK (status_ga4        IN ('active','partial','todo','na')),
  status_meta_pixel TEXT NOT NULL DEFAULT 'todo' CHECK (status_meta_pixel IN ('active','partial','todo','na')),
  status_klaviyo    TEXT NOT NULL DEFAULT 'todo' CHECK (status_klaviyo    IN ('active','partial','todo','na')),
  -- Search Console: SEO, non tracking. Sta qui ma non entra nel badge.
  status_gsc        TEXT NOT NULL DEFAULT 'todo' CHECK (status_gsc        IN ('active','partial','todo','na')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by        UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

ALTER TABLE public.client_tracking ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS client_tracking_staff ON public.client_tracking;
CREATE POLICY client_tracking_staff ON public.client_tracking
  FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());

-- ── Checklist: solo l'avanzamento. Le voci stanno nei JSON del codice. ─────
-- Gli id delle voci sono chiavi: rinominarne uno nel template perde la spunta.

CREATE TABLE IF NOT EXISTS public.tracking_checklist_state (
  client_id  UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  item_id    TEXT NOT NULL,
  done       BOOLEAN NOT NULL DEFAULT false,
  note       TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, item_id)
);

ALTER TABLE public.tracking_checklist_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tracking_checklist_state_staff ON public.tracking_checklist_state;
CREATE POLICY tracking_checklist_state_staff ON public.tracking_checklist_state
  FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());

-- ── Verifiche del sito (storico) ───────────────────────────────────────────
-- Una riga per esecuzione: distingue «mai controllato» da «controllato e non
-- trovato». `changes` = [{field, from, to, reason}].

CREATE TABLE IF NOT EXISTS public.tracking_checks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  checked_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  url         TEXT NOT NULL,
  ok          BOOLEAN NOT NULL,
  http_status INTEGER,
  error       TEXT,
  gtm_ids     JSONB NOT NULL DEFAULT '[]'::jsonb,
  ga4_ids     JSONB NOT NULL DEFAULT '[]'::jsonb,
  meta_ids    JSONB NOT NULL DEFAULT '[]'::jsonb,
  klaviyo     BOOLEAN NOT NULL DEFAULT false,
  changes     JSONB NOT NULL DEFAULT '[]'::jsonb,
  bytes       INTEGER,
  duration_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_tracking_checks_client ON public.tracking_checks (client_id, checked_at DESC);

ALTER TABLE public.tracking_checks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tracking_checks_staff ON public.tracking_checks;
CREATE POLICY tracking_checks_staff ON public.tracking_checks
  FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());

-- ── QA giornaliero ─────────────────────────────────────────────────────────
-- `tracking_qa_results` tiene solo l'ultimo esito per (cliente, controllo):
-- il blocco nella scheda mostra l'ultimo esito, non una verifica dal vivo.

CREATE TABLE IF NOT EXISTS public.tracking_qa_results (
  client_id  UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  check_key  TEXT NOT NULL CHECK (check_key IN ('gtm','ga4','meta_pixel')),
  status     TEXT NOT NULL CHECK (status IN ('ok','indeterminato','problema','na')),
  detail     TEXT NOT NULL DEFAULT '',
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, check_key)
);

ALTER TABLE public.tracking_qa_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tracking_qa_results_staff ON public.tracking_qa_results;
CREATE POLICY tracking_qa_results_staff ON public.tracking_qa_results
  FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());

CREATE TABLE IF NOT EXISTS public.tracking_qa_runs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  origin      TEXT NOT NULL CHECK (origin IN ('cron','manuale','cliente')),
  clients     INTEGER NOT NULL DEFAULT 0,
  problems    INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER,
  error       TEXT
);

CREATE INDEX IF NOT EXISTS idx_tracking_qa_runs_started ON public.tracking_qa_runs (started_at DESC);

ALTER TABLE public.tracking_qa_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tracking_qa_runs_staff ON public.tracking_qa_runs;
CREATE POLICY tracking_qa_runs_staff ON public.tracking_qa_runs
  FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());

-- ── Report (GA4, Klaviyo, Meta) ────────────────────────────────────────────
-- La definizione usata viene congelata dentro il run: i file JSON cambiano, e
-- un report di due mesi fa deve restare leggibile con le colonne che aveva.
-- Anche i run falliti restano, con l'errore: «mai generato» e «ho provato e
-- GA4 ha risposto male» sono due cose diverse.

CREATE TABLE IF NOT EXISTS public.tracking_report_runs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  source         TEXT NOT NULL CHECK (source IN ('ga4','klaviyo','meta')),
  definition     JSONB NOT NULL,
  definition_ver INTEGER,
  period_start   DATE NOT NULL,
  period_end     DATE NOT NULL,
  compare_start  DATE,
  compare_end    DATE,
  ok             BOOLEAN NOT NULL,
  error          TEXT,
  row_count      INTEGER NOT NULL DEFAULT 0,
  duration_ms    INTEGER,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_tracking_report_runs_client ON public.tracking_report_runs (client_id, created_at DESC);

ALTER TABLE public.tracking_report_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tracking_report_runs_staff ON public.tracking_report_runs;
CREATE POLICY tracking_report_runs_staff ON public.tracking_report_runs
  FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());

-- Le righe si rileggono nell'ordine in cui sono state scritte: identity, non uuid.
CREATE TABLE IF NOT EXISTS public.tracking_report_rows (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id     UUID NOT NULL REFERENCES public.tracking_report_runs(id) ON DELETE CASCADE,
  period     TEXT NOT NULL CHECK (period IN ('current','previous')),
  scope      TEXT NOT NULL CHECK (scope IN ('total','breakdown')),
  breakdown  TEXT,
  dimensions JSONB NOT NULL DEFAULT '{}'::jsonb,
  metrics    JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_tracking_report_rows_run ON public.tracking_report_rows (run_id, id);

ALTER TABLE public.tracking_report_rows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tracking_report_rows_staff ON public.tracking_report_rows;
CREATE POLICY tracking_report_rows_staff ON public.tracking_report_rows
  FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());

-- ── Segreti: deny-all, solo service role ───────────────────────────────────
-- Nessuna policy su queste tre tabelle. Non aggiungerne: una policy renderebbe
-- i blob leggibili dal browser, e il blob senza VAULT_KEY è comunque opaco, ma
-- il punto è che il «chi può vedere» lo decide la server action, non la RLS.

-- Chiavi API per piattaforma, una per (cliente, piattaforma).
-- `meta` qui contiene l'Ad Account ID del cliente: il token è d'agenzia.
CREATE TABLE IF NOT EXISTS public.client_platform_keys (
  client_id  UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  platform   TEXT NOT NULL CHECK (platform IN ('ga4','google_ads','meta','klaviyo')),
  blob       TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (client_id, platform)
);

ALTER TABLE public.client_platform_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_platform_keys FROM anon, authenticated;

-- Accessi ad account umani (Instagram, posta, registrar…): utente + password.
-- Un cliente può averne quanti vuole per lo stesso servizio. Solo `secret_blob`
-- è cifrato; il resto serve a leggere e cercare l'elenco.
CREATE TABLE IF NOT EXISTS public.client_logins (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  service     TEXT NOT NULL,
  label       TEXT NOT NULL DEFAULT '',
  username    TEXT NOT NULL DEFAULT '',
  url         TEXT NOT NULL DEFAULT '',
  note        TEXT NOT NULL DEFAULT '',
  secret_blob TEXT,
  sort        INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_client_logins_client ON public.client_logins (client_id, sort, created_at);

ALTER TABLE public.client_logins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_logins FROM anon, authenticated;

-- Segreti d'agenzia: service account GA4 (JSON), token System User Meta.
CREATE TABLE IF NOT EXISTS public.agency_platform_keys (
  platform   TEXT PRIMARY KEY CHECK (platform IN ('ga4','google_ads','meta')),
  blob       TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

ALTER TABLE public.agency_platform_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agency_platform_keys FROM anon, authenticated;

-- ── Voce «Tracking» nel portale Workspace ──────────────────────────────────
-- Gruppo 'clienti', in coda. La RLS decide cosa vede ognuno: la voce di menu
-- non allarga nessun permesso.

INSERT INTO public.workspace_sections
  (key, label, description, route, icon, sort_order, group_key, group_order, is_active)
SELECT
  'tracking', 'Tracking', 'Stato tracking e controllo giornaliero, per tutti i clienti',
  '/workspace/tracking', 'Radar',
  COALESCE((SELECT max(sort_order) + 1 FROM public.workspace_sections WHERE group_key = 'clienti'), 2),
  'clienti',
  COALESCE((SELECT min(group_order) FROM public.workspace_sections WHERE group_key = 'clienti'), 2),
  true
ON CONFLICT (key) DO UPDATE SET
  label       = EXCLUDED.label,
  description = EXCLUDED.description,
  route       = EXCLUDED.route,
  icon        = EXCLUDED.icon,
  group_key   = EXCLUDED.group_key,
  is_active   = true;

INSERT INTO public.workspace_section_permissions
  (section_id, app_role, can_view, can_create, can_edit, can_delete)
SELECT s.id, r.app_role, true, true, true, false
FROM public.workspace_sections AS s
CROSS JOIN (VALUES ('manager'),('senior'),('junior'),('stage'),('freelance'),('partner')) AS r(app_role)
WHERE s.key = 'tracking'
  AND NOT EXISTS (
    SELECT 1 FROM public.workspace_section_permissions AS p
    WHERE p.section_id = s.id AND p.app_role = r.app_role
  );

COMMIT;

-- verifica
SELECT key, label, route, sort_order, group_key, is_active
FROM public.workspace_sections
WHERE group_key = 'clienti'
ORDER BY sort_order;

SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('client_tracking','tracking_checklist_state','tracking_checks',
                    'tracking_qa_results','tracking_qa_runs','tracking_report_runs',
                    'tracking_report_rows','client_platform_keys','client_logins',
                    'agency_platform_keys')
ORDER BY tablename;
