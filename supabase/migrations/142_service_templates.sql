-- 142 — Catalogo: servizi mancanti, template di Workstream/Milestone, label cliente.
-- Additiva + idempotente. Dipende dalla 138/139.
--
-- COSA NON RINOMINO
-- service_catalog.phases resta "phases" anche se ora la struttura si chiama
-- Workstream. È la chiave del payload letto da ProjectWizard.tsx e da
-- create_project_from_wizard(): si rinomina nello stesso commit in cui il
-- wizard viene riscritto (fase 6), non prima, per non toccare un flusso
-- funzionante solo per coerenza di nome.

-- ─── 1. Template di milestone + label per il cliente (§18) ──────────────────
ALTER TABLE public.service_catalog
  ADD COLUMN IF NOT EXISTS milestone_templates JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS client_workstream_label TEXT NOT NULL DEFAULT 'Aree di lavoro';

COMMENT ON COLUMN public.service_catalog.client_workstream_label IS
  'Come il cliente chiama il Workstream nel suo portale. Interno: sempre "Area di lavoro".';

-- ─── 2. Vincoli da estendere per i servizi nuovi ────────────────────────────
ALTER TABLE public.service_catalog DROP CONSTRAINT IF EXISTS sc_vertical_chk;
ALTER TABLE public.service_catalog ADD CONSTRAINT sc_vertical_chk
  CHECK (growth_vertical IN ('ecommerce','lead_gen','saas'));

ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_growth_vertical_check;
ALTER TABLE public.projects ADD CONSTRAINT projects_growth_vertical_check
  CHECK (growth_vertical IN ('ecommerce','lead_gen','saas'));

-- ─── 3. Servizi mancanti rispetto al §4 del brief ───────────────────────────
INSERT INTO public.service_catalog
  (key, name, service_line, delivery_engine, default_revenue_model, growth_vertical,
   default_billing_frequency, icon, position, description)
VALUES
  ('growth_saas','Growth SaaS','growth','growth_program','recurring','saas',
   'mensile','🚀',16,
   'Acquisition, activation, onboarding, retention e CRO per prodotti SaaS.'),
  ('custom_application','Applicativo ad hoc','digital','digital_project','milestone_based',NULL,
   NULL,'🧩',17,
   'Software su misura non riconducibile a CRM o gestionale.'),
  ('integration','Integrazione','digital','digital_project','milestone_based',NULL,
   NULL,'🔗',18,
   'Collegamento fra sistemi esistenti, API, sincronizzazioni.')
ON CONFLICT (key) DO NOTHING;

-- ─── 4. Label cliente per servizio (§18) ────────────────────────────────────
UPDATE public.service_catalog SET client_workstream_label = 'Iniziative'
WHERE key IN ('growth_lead_gen','growth_ecommerce','growth_saas');

UPDATE public.service_catalog SET client_workstream_label = 'Fasi'
WHERE key IN ('brand_identity','analisi_mercato');

UPDATE public.service_catalog SET client_workstream_label = 'Moduli'
WHERE key IN ('crm','gestionale','sito_web','sito_ecommerce','custom_application','integration','ai_automation');

UPDATE public.service_catalog SET client_workstream_label = 'Aree organizzative'
WHERE key = 'creazione_evento';

-- ─── 5. Template pilota: Social Media Management (decisione D-4) ────────────
-- Il catalogo propone, il progetto dispone: questo contenuto viene COPIATO sul
-- progetto alla creazione e da lì diverge liberamente. Cambiare il default
-- aziendale non aggiorna i progetti già creati — è voluto.
UPDATE public.service_catalog SET
  phases = '[
    {"key":"strategia","name":"Strategia editoriale","position":0},
    {"key":"piano","name":"Piano editoriale","position":1},
    {"key":"produzione","name":"Produzione contenuti","position":2},
    {"key":"approvazione","name":"Approvazione cliente","position":3,"requires_client_approval":true},
    {"key":"pubblicazione","name":"Pubblicazione","position":4},
    {"key":"community","name":"Community management","position":5},
    {"key":"report","name":"Analisi e report","position":6}
  ]'::jsonb,
  milestone_templates = '[
    {"workstream_key":"strategia","title":"Strategia approvata","milestone_type":"approval","approval_required":true,"visibility":"client"},
    {"workstream_key":"piano","title":"Piano editoriale del mese","milestone_type":"recurring_cycle","visibility":"client"},
    {"workstream_key":"approvazione","title":"Contenuti approvati","milestone_type":"approval","approval_required":true,"visibility":"client"},
    {"workstream_key":"report","title":"Report mensile consegnato","milestone_type":"delivery","visibility":"client"}
  ]'::jsonb
WHERE key = 'social_media_management';

-- ─── Verifica ───────────────────────────────────────────────────────────────
SELECT key, service_line, delivery_engine, client_workstream_label,
       jsonb_array_length(phases) AS workstream,
       jsonb_array_length(milestone_templates) AS milestone
FROM public.service_catalog ORDER BY service_line, position;
