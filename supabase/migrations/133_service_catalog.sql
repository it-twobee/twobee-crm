-- FASE 1 (project engine) — Service Catalog.
-- Additiva + idempotente.
--
-- Oggi il catalogo vive dentro un componente React: 6 template hardcoded in
-- `components/progetti/ProgettiClient.tsx:864`, usati da 1 form su 8. E uno è
-- già classificato male — il template "E-commerce" è marcato `kind: 'growth'`
-- ma le sue milestone sono un progetto Digital (Architettura & tech stack,
-- Sviluppo frontend, Backend & integrazioni, Go-Live). È la confusione fra
-- categoria commerciale e motore operativo, già in produzione.
--
-- `task_templates` (011) esiste, è vuota e ha `service_type` + `tasks JSONB`,
-- ma il suo modello è "lista di task": qui serve un'entità di catalogo con
-- fasi, routine, KPI e deliverable. Tabella nuova (decisione A3); la vecchia
-- resta e verrà dismessa quando non la legge più nessuno.

-- NB: CREATE TABLE minimale + ALTER separati. Il SQL Editor di Supabase ha
-- troncato ripetutamente gli incolli lunghi (blocchi da ~25 caratteri persi):
-- statement corti rendono il problema visibile subito invece che silenzioso.

CREATE TABLE IF NOT EXISTS public.service_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  service_line TEXT NOT NULL,
  delivery_engine TEXT NOT NULL,
  default_revenue_model TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.service_catalog
  ADD COLUMN IF NOT EXISTS growth_vertical TEXT,
  ADD COLUMN IF NOT EXISTS suggested_duration_days INT,
  ADD COLUMN IF NOT EXISTS suggested_frequency TEXT,
  ADD COLUMN IF NOT EXISTS default_billing_frequency TEXT,
  ADD COLUMN IF NOT EXISTS department TEXT,
  ADD COLUMN IF NOT EXISTS icon TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS position INT NOT NULL DEFAULT 0;

-- JSONB perché la forma varia per motore: un digital_project ha fasi,
-- un growth_program ha routine e task di startup.
ALTER TABLE public.service_catalog
  ADD COLUMN IF NOT EXISTS phases JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS routines JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS startup_tasks JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS deliverables JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS kpi_keys JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS suggested_roles JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS required_fields JSONB NOT NULL DEFAULT '[]';

ALTER TABLE public.service_catalog DROP CONSTRAINT IF EXISTS sc_line_chk;
ALTER TABLE public.service_catalog ADD CONSTRAINT sc_line_chk
  CHECK (service_line IN ('growth','digital','marketing','ai','consulting','hybrid','other'));

ALTER TABLE public.service_catalog DROP CONSTRAINT IF EXISTS sc_engine_chk;
ALTER TABLE public.service_catalog ADD CONSTRAINT sc_engine_chk
  CHECK (delivery_engine IN ('growth_program','digital_project','recurring_service','structured_one_off','hybrid_delivery'));

ALTER TABLE public.service_catalog DROP CONSTRAINT IF EXISTS sc_revenue_chk;
ALTER TABLE public.service_catalog ADD CONSTRAINT sc_revenue_chk
  CHECK (default_revenue_model IN ('recurring','one_off','milestone_based','maintenance','retainer','usage_based','non_billable'));

ALTER TABLE public.service_catalog DROP CONSTRAINT IF EXISTS sc_vertical_chk;
ALTER TABLE public.service_catalog ADD CONSTRAINT sc_vertical_chk
  CHECK (growth_vertical IN ('ecommerce','lead_gen'));

CREATE INDEX IF NOT EXISTS idx_sc_line ON public.service_catalog(service_line, is_active);
CREATE INDEX IF NOT EXISTS idx_sc_position ON public.service_catalog(position);

ALTER TABLE public.service_catalog ENABLE ROW LEVEL SECURITY;

-- Lettura a tutto lo staff: il wizard serve anche al manager.
-- Scrittura solo admin (§5: configurabile da Admin e SuperAdmin).
DROP POLICY IF EXISTS "sc_staff_read" ON public.service_catalog;
CREATE POLICY "sc_staff_read" ON public.service_catalog
  FOR SELECT USING (public.is_staff());
DROP POLICY IF EXISTS "sc_admin_write" ON public.service_catalog;
CREATE POLICY "sc_admin_write" ON public.service_catalog
  FOR ALL USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

DROP TRIGGER IF EXISTS sc_updated_at ON public.service_catalog;
CREATE TRIGGER sc_updated_at BEFORE UPDATE ON public.service_catalog
  FOR EACH ROW EXECUTE FUNCTION public.set_growth_updated_at();

-- Il progetto sa da quale servizio è nato.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS service_key TEXT REFERENCES public.service_catalog(key);

CREATE INDEX IF NOT EXISTS idx_projects_service_key ON public.projects(service_key);

-- ─── I 13 servizi (§5) ──────────────────────────────────────────────────────
-- Idempotente: ON CONFLICT sulla key non sovrascrive le personalizzazioni.

INSERT INTO public.service_catalog
  (key, name, service_line, delivery_engine, default_revenue_model, growth_vertical,
   suggested_duration_days, default_billing_frequency, icon, position, description)
VALUES
  ('growth_ecommerce','Growth E-commerce','growth','growth_program','recurring','ecommerce',
   NULL,'mensile','🛒',1,'Programma continuativo di crescita per negozi online.'),
  ('growth_lead_gen','Growth Lead Generation','growth','growth_program','recurring','lead_gen',
   NULL,'mensile','🎯',2,'Programma continuativo di generazione contatti.'),

  ('brand_identity','Brand Identity','marketing','structured_one_off','one_off',NULL,
   45,'una_tantum','🎨',10,'Identità di marca: dal brief al brand system.'),
  ('continuing_designer','Continuing Designer','marketing','recurring_service','recurring',NULL,
   NULL,'mensile','✏️',11,'Designer a disposizione con canone e richieste ricorrenti.'),
  ('analisi_mercato','Analisi di mercato','marketing','structured_one_off','one_off',NULL,
   30,'una_tantum','📊',12,'Ricerca, competitor, benchmark e presentazione.'),
  ('creazione_evento','Creazione evento','marketing','structured_one_off','one_off',NULL,
   60,'una_tantum','🎪',13,'Dal concept al follow-up post evento.'),
  ('marketing_automation','Marketing Automation','marketing','structured_one_off','one_off',NULL,
   30,'una_tantum','⚙️',14,'Progettazione e messa a terra dei flussi automatici.'),

  ('sito_web','Sito web','digital','digital_project','one_off',NULL,
   60,'una_tantum','🌐',20,'Sito vetrina o istituzionale.'),
  ('sito_ecommerce','Sito e-commerce','digital','digital_project','milestone_based',NULL,
   90,'una_tantum','🛍️',21,'Negozio online, a stati di avanzamento.'),
  ('crm','CRM','digital','digital_project','milestone_based',NULL,
   120,'una_tantum','🗂️',22,'CRM su misura.'),
  ('gestionale','Gestionale','digital','digital_project','milestone_based',NULL,
   120,'una_tantum','🏗️',23,'Applicativo gestionale su misura.'),

  ('ai_automation','AI Automation','ai','digital_project','milestone_based',NULL,
   60,'una_tantum','🤖',30,'Automazioni e prodotti basati su AI.'),
  ('consulenza_strategica','Consulenza strategica','consulting','recurring_service','retainer',NULL,
   NULL,'mensile','🧭',40,'Affiancamento strategico continuativo.')
ON CONFLICT (key) DO NOTHING;

-- Verifica: 13 righe, ognuna con motore e ricavo coerenti
SELECT service_line, delivery_engine, default_revenue_model, COUNT(*)
FROM public.service_catalog
GROUP BY 1,2,3 ORDER BY 1,2;

-- Rollback:
--   ALTER TABLE public.projects DROP COLUMN service_key;
--   DROP TABLE public.service_catalog;
