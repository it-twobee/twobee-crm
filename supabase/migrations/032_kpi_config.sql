-- Configurazione KPI per-cliente: quali standard mostrare + KPI custom
CREATE TABLE IF NOT EXISTS public.client_kpi_config (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id   UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  -- KPI standard abilitati (array di chiavi es. ['roas','leads','revenue'])
  enabled     TEXT[] DEFAULT '{}',
  -- KPI personalizzati: [{id, name, unit, target, lower_is_better}]
  custom_kpis JSONB  DEFAULT '[]',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id)
);

ALTER TABLE public.client_kpis
  ADD COLUMN IF NOT EXISTS custom_data JSONB DEFAULT '{}';

ALTER TABLE public.client_kpi_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth users" ON public.client_kpi_config
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
