-- Portfolio personalizzati
CREATE TABLE IF NOT EXISTS public.portfolios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#F5C800',
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth can manage portfolios" ON public.portfolios FOR ALL USING (auth.uid() IS NOT NULL);

-- Portfolio → Clienti (M:M)
CREATE TABLE IF NOT EXISTS public.portfolio_clients (
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  PRIMARY KEY (portfolio_id, client_id)
);
ALTER TABLE public.portfolio_clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth can manage portfolio_clients" ON public.portfolio_clients FOR ALL USING (auth.uid() IS NOT NULL);
