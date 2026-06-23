-- Aggiunge campi CTR e followers_gained a client_kpis
ALTER TABLE client_kpis
  ADD COLUMN IF NOT EXISTS ctr NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS followers_gained INTEGER;
