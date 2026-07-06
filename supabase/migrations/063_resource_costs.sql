-- ─── Costo operativo risorse (interne, freelance, partner, fornitori) ────────
-- Additiva: nessuna tabella esistente copre i costi risorsa (profiles non ha
-- campi costo; RATES in DeptToolbox e MARGIN_BY_PACKAGE in MarginRadar sono
-- hardcoded e verranno sostituiti da questi dati).

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

-- RLS: dati sensibili — SOLO admin (role='admin'). Team, client e guest esclusi.
ALTER TABLE public.resource_costs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "resource_costs_admin" ON public.resource_costs;
CREATE POLICY "resource_costs_admin" ON public.resource_costs
  FOR ALL USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');
