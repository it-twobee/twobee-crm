-- Migration 077: Estendi app_role con nuovi ruoli + resource_type + seniority su profiles

-- ─── Aggiorna CHECK constraint app_role ──────────────────────────────────────
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_app_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_app_role_check
    CHECK (app_role IN (
      'super_admin', 'founder', 'admin', 'manager',
      'senior', 'junior', 'stage', 'freelance',
      'partner', 'viewer', 'client', 'guest'
    ));

-- ─── resource_type: tipo contrattuale della risorsa ──────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS resource_type TEXT
    CHECK (resource_type IN (
      'dipendente', 'piva', 'freelance_continuativo',
      'collaboratore_una_tantum', 'partner_aziendale'
    ));

-- ─── seniority: livello seniority della risorsa ──────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS seniority TEXT
    CHECK (seniority IN ('lead', 'senior', 'mid', 'junior', 'stage'));
