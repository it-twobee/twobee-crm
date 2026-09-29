-- 267 — L'ID misurazione GA4 (G-XXXXXXX) nella configurazione tracking.
-- Prerequisiti: 217 (tracking).
-- Additiva. È un'altra cosa rispetto a `ga4_property_id`: la property (numero)
-- serve alla Data API per i report, l'ID misurazione è quello che il tag
-- installa sul sito, e la verifica lo confronta con quello che trova.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.client_tracking
  ADD COLUMN IF NOT EXISTS ga4_measurement_id TEXT NOT NULL DEFAULT '';

COMMIT;
