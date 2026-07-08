-- Migration 083: lead_contacts — contatti Lead Generation per portale cliente

CREATE TABLE IF NOT EXISTS public.lead_contacts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  project_id  UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  source      TEXT
    CHECK (source IN (
      'meta_ads', 'google_ads', 'website', 'organic',
      'whatsapp', 'email', 'referral', 'other'
    )),
  full_name   TEXT,
  email       TEXT,
  phone       TEXT,
  status      TEXT NOT NULL DEFAULT 'nuovo'
    CHECK (status IN (
      'nuovo', 'contattato', 'qualificato',
      'in_trattativa', 'convertito', 'perso'
    )),
  notes       TEXT,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_contacts_client  ON public.lead_contacts(client_id);
CREATE INDEX IF NOT EXISTS idx_lead_contacts_project ON public.lead_contacts(project_id);
CREATE INDEX IF NOT EXISTS idx_lead_contacts_source  ON public.lead_contacts(source);
CREATE INDEX IF NOT EXISTS idx_lead_contacts_status  ON public.lead_contacts(status);

ALTER TABLE public.lead_contacts ENABLE ROW LEVEL SECURITY;

-- Admin/founder: tutto
CREATE POLICY "lead_contacts_admin" ON public.lead_contacts
  FOR ALL USING (
    public.get_my_role() = 'admin' OR public.is_founder()
  );

-- Cliente: vede solo i propri lead
CREATE POLICY "lead_contacts_client_read" ON public.lead_contacts
  FOR SELECT USING (
    client_id = public.get_my_client_id_as_client()
  );

-- API inbound (service role) può inserire via admin client — non serve policy aggiuntiva
-- perché il webhook usa createAdminClient() che bypassa RLS
