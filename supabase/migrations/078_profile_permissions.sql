-- Migration 078: profile_permissions — permessi granulari per profilo + helper functions

-- ─── Tabella permessi per profilo ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profile_permissions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  permission  TEXT NOT NULL,
  granted     BOOLEAN NOT NULL DEFAULT false,
  granted_by  UUID REFERENCES public.profiles(id),
  created_at  TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT profile_permissions_permission_check CHECK (permission IN (
    'can_view_full_financials',
    'can_view_macro_revenue',
    'can_view_manager_economics',
    'can_view_deals',
    'can_view_team_data',
    'can_view_strategy',
    'can_approve_hr',
    'can_configure_workspace',
    'can_manage_partners'
  )),
  UNIQUE(profile_id, permission)
);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.profile_permissions ENABLE ROW LEVEL SECURITY;

-- Lettura: ognuno vede solo i propri permessi, admin/founder vedono tutti
CREATE POLICY "profile_permissions_read" ON public.profile_permissions
  FOR SELECT USING (
    profile_id = auth.uid()
    OR public.get_my_role() = 'admin'
    OR public.get_my_app_role() IN ('super_admin', 'founder')
  );

-- Scrittura: solo super_admin può modificare
CREATE POLICY "profile_permissions_write" ON public.profile_permissions
  FOR ALL USING (public.get_my_app_role() = 'super_admin');

-- ─── Helper functions ─────────────────────────────────────────────────────────

-- get_my_app_role: legge app_role dal profilo corrente
CREATE OR REPLACE FUNCTION public.get_my_app_role()
RETURNS TEXT LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT app_role FROM public.profiles WHERE id = auth.uid()
$$;

-- has_permission: verifica un permesso specifico
CREATE OR REPLACE FUNCTION public.has_permission(perm TEXT)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profile_permissions
    WHERE profile_id = auth.uid()
      AND permission = perm
      AND granted = true
  )
$$;

-- is_founder: founder o super_admin
CREATE OR REPLACE FUNCTION public.is_founder()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT public.get_my_app_role() IN ('founder', 'super_admin')
$$;

-- is_workspace_user: ruoli del portale workspace
CREATE OR REPLACE FUNCTION public.is_workspace_user()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT public.get_my_app_role() IN ('manager', 'senior', 'junior', 'stage', 'freelance')
$$;

-- is_partner_user
CREATE OR REPLACE FUNCTION public.is_partner_user()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT public.get_my_app_role() = 'partner'
$$;

-- can_view_full_financials: founder/super_admin O permesso esplicito
CREATE OR REPLACE FUNCTION public.can_view_full_financials()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT public.is_founder() OR public.has_permission('can_view_full_financials')
$$;

-- can_view_macro_revenue: tutti tranne partner, client, guest
CREATE OR REPLACE FUNCTION public.can_view_macro_revenue()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT public.get_my_app_role() NOT IN ('partner', 'client', 'guest')
$$;
