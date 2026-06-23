CREATE TYPE public.lead_status AS ENUM ('nuovo', 'contattato', 'qualificato', 'convertito', 'perso');
CREATE TYPE public.lead_source AS ENUM ('facebook', 'google', 'linkedin', 'organic', 'referral', 'email', 'evento', 'altro');

CREATE TABLE IF NOT EXISTS public.leads (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  client_id    UUID          NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  project_id   UUID          REFERENCES public.projects(id) ON DELETE SET NULL,
  name         TEXT          NOT NULL,
  company      TEXT,
  email        TEXT,
  phone        TEXT,
  source       lead_source   NOT NULL DEFAULT 'altro',
  status       lead_status   NOT NULL DEFAULT 'nuovo',
  notes        TEXT,
  value        NUMERIC(10,2),
  assigned_to  UUID          REFERENCES public.profiles(id) ON DELETE SET NULL,
  converted_at TIMESTAMPTZ
);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team read leads" ON public.leads FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND app_role IN ('admin','manager','team','super_admin'))
);
CREATE POLICY "admin write leads" ON public.leads FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND app_role IN ('admin','manager','super_admin'))
);

CREATE INDEX IF NOT EXISTS idx_leads_client_id   ON public.leads(client_id);
CREATE INDEX IF NOT EXISTS idx_leads_project_id  ON public.leads(project_id);
CREATE INDEX IF NOT EXISTS idx_leads_status      ON public.leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_created_at  ON public.leads(created_at DESC);

CREATE OR REPLACE FUNCTION public.set_leads_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.set_leads_updated_at();
