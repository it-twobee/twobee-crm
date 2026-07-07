-- ─── Portale Risorsa (Fase 3): identità e permessi delle risorse ─────────────
-- resource_profiles NON è resource_costs: qui identità/accesso/permessi,
-- là il costo economico. Una risorsa esterna = profiles.role='guest'
-- (quindi NON is_staff → esclusa da deals/OKR/MRR/costi via hardening 059)
-- + un record qui che la distingue da un guest-cliente.

CREATE TABLE IF NOT EXISTS public.resource_profiles (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id               UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  resource_type            TEXT NOT NULL DEFAULT 'internal_employee'
    CHECK (resource_type IN ('internal_employee','vat_consultant','external_freelancer','partner_company','partner_user','agency_supplier','contractor','consultant')),
  company_name             TEXT,
  partner_company_id       UUID REFERENCES public.resource_profiles(id) ON DELETE SET NULL,
  is_external              BOOLEAN NOT NULL DEFAULT false,
  can_access_resource_portal BOOLEAN NOT NULL DEFAULT true,
  can_view_own_compensation  BOOLEAN NOT NULL DEFAULT false,
  can_view_project_context   BOOLEAN NOT NULL DEFAULT true,
  can_view_client_context    BOOLEAN NOT NULL DEFAULT false,
  can_log_time               BOOLEAN NOT NULL DEFAULT true,
  can_upload_documents       BOOLEAN NOT NULL DEFAULT true,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_resource_profiles_profile ON public.resource_profiles(profile_id);

CREATE OR REPLACE FUNCTION public.set_resource_profiles_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS resource_profiles_updated_at ON public.resource_profiles;
CREATE TRIGGER resource_profiles_updated_at
  BEFORE UPDATE ON public.resource_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_resource_profiles_updated_at();

ALTER TABLE public.resource_profiles ENABLE ROW LEVEL SECURITY;
-- La risorsa legge il PROPRIO record; solo admin gestisce tutti.
DROP POLICY IF EXISTS "resource_profiles_self" ON public.resource_profiles;
CREATE POLICY "resource_profiles_self" ON public.resource_profiles
  FOR SELECT USING (profile_id = auth.uid());
DROP POLICY IF EXISTS "resource_profiles_admin" ON public.resource_profiles;
CREATE POLICY "resource_profiles_admin" ON public.resource_profiles
  FOR ALL USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

-- ─── Policy additive "own": abilitano una risorsa (anche guest) a vedere solo
--     i propri dati operativi. Allargano l'accesso ai propri, non restringono. ──

-- Progetti dove ho task assegnati
DROP POLICY IF EXISTS "projects_resource_own" ON public.projects;
CREATE POLICY "projects_resource_own" ON public.projects
  FOR SELECT USING (
    id IN (SELECT project_id FROM public.tasks WHERE assignee_id = auth.uid())
  );

-- Documenti dei progetti dove ho task, o che ho caricato io
DROP POLICY IF EXISTS "documents_resource_own" ON public.documents;
CREATE POLICY "documents_resource_own" ON public.documents
  FOR SELECT USING (
    uploaded_by = auth.uid()
    OR project_id IN (SELECT project_id FROM public.tasks WHERE assignee_id = auth.uid())
  );

-- Timesheet personale (inserimento/lettura delle proprie ore) — indipendente da is_staff
DROP POLICY IF EXISTS "time_entries_own" ON public.time_entries;
CREATE POLICY "time_entries_own" ON public.time_entries
  FOR ALL USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());
