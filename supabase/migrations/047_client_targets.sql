-- Aggiunge colonne target KPI alla tabella clients (idempotente)
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS target_leads_monthly INT,
  ADD COLUMN IF NOT EXISTS target_roas NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS target_revenue_monthly NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS target_cpa NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS target_followers_monthly INT,
  ADD COLUMN IF NOT EXISTS target_ctr NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS target_conv_rate NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS industry TEXT,
  ADD COLUMN IF NOT EXISTS market_area TEXT,
  ADD COLUMN IF NOT EXISTS goals_notes TEXT,
  ADD COLUMN IF NOT EXISTS ad_budget_monthly NUMERIC(12,2);
