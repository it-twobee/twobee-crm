-- 161 — Data della prima perdita, per notificare una volta sola.
--
-- Un cliente perso esce da statistiche e avvisi (lato app: countsInStats), ma la
-- perdita va segnalata quando succede. Serve un segno persistente: senza, la
-- dashboard rifarebbe l'avviso a ogni caricamento — ed è esattamente il rumore
-- che si vuole togliere.
--
-- `lost_at` si scrive la prima volta che il label diventa 'perso' e NON si azzera
-- se il cliente torna attivo: una seconda perdita non rinotifica.
--
-- Backfill: i clienti già persi ereditano una data (created_at) così da non
-- generare notifiche retroattive alla prima modifica.
--
-- Additiva e idempotente.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS lost_at TIMESTAMPTZ;

UPDATE public.clients
SET lost_at = COALESCE(created_at, now())
WHERE client_label = 'perso' AND lost_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_clients_lost_at ON public.clients(lost_at) WHERE lost_at IS NOT NULL;
