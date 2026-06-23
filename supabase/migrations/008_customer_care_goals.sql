-- Customer Care: account esterni del cliente (max 5 per cliente)
CREATE TABLE IF NOT EXISTS public.client_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT,
  invite_token TEXT UNIQUE DEFAULT gen_random_uuid()::text,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(client_id, email)
);
ALTER TABLE public.client_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth can manage client_accounts" ON public.client_accounts FOR ALL USING (auth.uid() IS NOT NULL);

-- Aggiungi tipo canale customer_care
ALTER TYPE public.channel_type ADD VALUE IF NOT EXISTS 'customer_care';

-- Obiettivi cliente (crescita / performance)
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS industry TEXT,
  ADD COLUMN IF NOT EXISTS market_area TEXT,
  ADD COLUMN IF NOT EXISTS target_leads_monthly INT,
  ADD COLUMN IF NOT EXISTS target_roas NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS target_revenue_monthly NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS target_cpa NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS target_followers_monthly INT,
  ADD COLUMN IF NOT EXISTS target_ctr NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS target_conv_rate NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS goals_notes TEXT,
  ADD COLUMN IF NOT EXISTS ad_budget_monthly NUMERIC(12,2);
