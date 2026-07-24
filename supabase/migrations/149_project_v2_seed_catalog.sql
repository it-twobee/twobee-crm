-- 149 — Project V2: seed tassonomia servizi (service_catalog)
--
-- Configurabile: da qui in poi servizi/sottotipi si aggiungono da UI super_admin.
-- Idempotente: ON CONFLICT DO NOTHING sull'UNIQUE (area, service_type, subtype).

BEGIN;

INSERT INTO public.service_catalog (area, service_type, service_subtype, label, sort_order) VALUES
  -- Marketing
  ('marketing', 'branding',                NULL, 'Branding',                10),
  ('marketing', 'social_media_management', NULL, 'Social Media Management', 20),
  ('marketing', 'audit',                   NULL, 'Audit',                   30),
  ('marketing', 'continuing_design',       NULL, 'Continuing Design',       40),
  ('marketing', 'event',                   NULL, 'Evento',                  50),
  -- Growth
  ('growth',    'lead_generation',         NULL, 'Lead Generation',         10),
  ('growth',    'saas',                    NULL, 'SaaS',                    20),
  ('growth',    'ecommerce',               NULL, 'E-commerce',              30),
  -- Digital
  ('digital',   'ai_project',              NULL,                  'AI Project',             10),
  ('digital',   'digital_transformation',  'crm',                 'Digitalizzazione — CRM', 20),
  ('digital',   'digital_transformation',  'management_software', 'Digitalizzazione — Gestionale', 30),
  ('digital',   'digital_transformation',  'custom_application',  'Digitalizzazione — Applicativo ad hoc', 40)
ON CONFLICT (area, service_type, COALESCE(service_subtype, '')) DO NOTHING;

COMMIT;

-- verifica: 12 righe di catalogo
SELECT area, count(*) FROM public.service_catalog GROUP BY area ORDER BY area;
