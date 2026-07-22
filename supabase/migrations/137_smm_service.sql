-- Social Media Management nel catalogo servizi.
--
-- Linea `marketing` (decisione presa in Fase 1: il SMM è un servizio vendibile
-- a sé, non parte dell'offerta Growth) e modello `recurring`: è un canone, e
-- come tale entra nell'MRR insieme al Growth.
--
-- Motore `recurring_service`, lo stesso del Continuing Designer: produzione
-- continuativa a cicli, senza Startup né Planning Cycle. Se un cliente vuole il
-- SMM *dentro* un programma Growth, non serve questo servizio — basta una
-- routine in più sul progetto Growth.

INSERT INTO public.service_catalog
  (key, name, service_line, delivery_engine, default_revenue_model, growth_vertical,
   suggested_duration_days, default_billing_frequency, icon, position, description)
VALUES
  ('social_media_management','Social Media Management','marketing','recurring_service','recurring',NULL,
   NULL,'mensile','📱',15,
   'Piano editoriale, produzione contenuti, pubblicazione e community management a canone.')
ON CONFLICT (key) DO NOTHING;

SELECT key, name, service_line, delivery_engine, default_revenue_model
FROM public.service_catalog
WHERE service_line = 'marketing'
ORDER BY position;
