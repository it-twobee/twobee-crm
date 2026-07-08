-- ─── 1. resource_costs (dalla migration 063, mai applicata in prod) ────────

CREATE TABLE IF NOT EXISTS public.resource_costs (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id                  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  name                        TEXT NOT NULL,
  resource_type               TEXT NOT NULL DEFAULT 'internal_employee'
    CHECK (resource_type IN ('internal_employee','external_freelancer','partner','agency_supplier','consultant','contractor')),
  role_title                  TEXT,
  department                  TEXT,
  seniority                   TEXT,
  cost_type                   TEXT NOT NULL DEFAULT 'monthly_salary'
    CHECK (cost_type IN ('monthly_salary','hourly','daily','project_fee','retainer','partner_percentage')),
  monthly_cost                NUMERIC(10,2),
  hourly_cost                 NUMERIC(10,2),
  daily_cost                  NUMERIC(10,2),
  project_fee                 NUMERIC(10,2),
  partner_percentage          NUMERIC(5,2),
  tools_cost_monthly          NUMERIC(10,2) NOT NULL DEFAULT 0,
  overhead_percentage         NUMERIC(5,2)  NOT NULL DEFAULT 0,
  availability_hours_month    NUMERIC(6,2)  NOT NULL DEFAULT 160,
  billable_target_hours_month NUMERIC(6,2)  NOT NULL DEFAULT 120,
  calculated_hourly_cost      NUMERIC(10,2),
  markup_default              NUMERIC(5,2)  NOT NULL DEFAULT 2,
  is_active                   BOOLEAN NOT NULL DEFAULT true,
  notes                       TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_resource_costs_profile ON public.resource_costs(profile_id);
CREATE INDEX IF NOT EXISTS idx_resource_costs_active  ON public.resource_costs(is_active);

CREATE OR REPLACE FUNCTION public.set_resource_costs_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS resource_costs_updated_at ON public.resource_costs;
CREATE TRIGGER resource_costs_updated_at
  BEFORE UPDATE ON public.resource_costs
  FOR EACH ROW EXECUTE FUNCTION public.set_resource_costs_updated_at();

ALTER TABLE public.resource_costs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "resource_costs_admin" ON public.resource_costs;
CREATE POLICY "resource_costs_admin" ON public.resource_costs
  FOR ALL USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- ─── 2. project_cost_entries ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.project_cost_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  client_id       UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  category        TEXT NOT NULL DEFAULT 'risorsa'
    CHECK (category IN ('risorsa','software','provvigione','cac','produzione','indiretto','altro')),
  description     TEXT NOT NULL,
  amount          NUMERIC(12,2) NOT NULL DEFAULT 0,
  resource_cost_id UUID REFERENCES public.resource_costs(id) ON DELETE SET NULL,
  hours           NUMERIC(8,2),
  hourly_rate     NUMERIC(8,2),
  month           DATE,
  is_recurring    BOOLEAN NOT NULL DEFAULT false,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pce_project  ON public.project_cost_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_pce_client   ON public.project_cost_entries(client_id);
CREATE INDEX IF NOT EXISTS idx_pce_month    ON public.project_cost_entries(month);
CREATE INDEX IF NOT EXISTS idx_pce_resource ON public.project_cost_entries(resource_cost_id);

CREATE OR REPLACE FUNCTION public.set_pce_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS pce_updated_at ON public.project_cost_entries;
CREATE TRIGGER pce_updated_at
  BEFORE UPDATE ON public.project_cost_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_pce_updated_at();

ALTER TABLE public.project_cost_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pce_admin" ON public.project_cost_entries;
CREATE POLICY "pce_admin" ON public.project_cost_entries
  FOR ALL USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- ─── 3. business_costs ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.business_costs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category        TEXT NOT NULL DEFAULT 'altro'
    CHECK (category IN ('affitto','software','amministrazione','marketing','personale','formazione','altro')),
  description     TEXT NOT NULL,
  monthly_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.set_bc_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS bc_updated_at ON public.business_costs;
CREATE TRIGGER bc_updated_at
  BEFORE UPDATE ON public.business_costs
  FOR EACH ROW EXECUTE FUNCTION public.set_bc_updated_at();

ALTER TABLE public.business_costs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bc_admin" ON public.business_costs;
CREATE POLICY "bc_admin" ON public.business_costs
  FOR ALL USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');
