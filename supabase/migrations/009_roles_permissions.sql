-- ============================================================
-- Migration 009: Ruoli estesi, permessi configurabili, GOD MODE
-- ============================================================

-- 1. Estendi profiles con nuovi campi
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS app_role TEXT NOT NULL DEFAULT 'junior'
    CHECK (app_role IN ('super_admin','admin','manager','senior','junior','viewer','client')),
  ADD COLUMN IF NOT EXISTS area TEXT,           -- 'growth' | 'digital' | 'ops' | null
  ADD COLUMN IF NOT EXISTS competencies TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS job_title TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

-- Super admin hardcoded su email (GOD MODE)
-- Non può essere cambiato via UI, solo via migration
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT email = 'm.lucci@twobee.it' FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_app_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT CASE
    WHEN email = 'm.lucci@twobee.it' THEN 'super_admin'
    ELSE app_role
  END FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_above()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT public.get_app_role() IN ('super_admin','admin');
$$;

-- 2. Tabella permessi configurabili per ruolo
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role TEXT NOT NULL CHECK (role IN ('admin','manager','senior','junior','viewer','client')),
  section TEXT NOT NULL,     -- 'clienti','fatturazione','task','chat','report','customer_care','impostazioni'
  action TEXT NOT NULL,      -- 'view','create','edit','delete'
  allowed BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES public.profiles(id),
  UNIQUE(role, section, action)
);

-- Seed permessi di default
INSERT INTO public.role_permissions (role, section, action, allowed) VALUES
  -- ADMIN
  ('admin','clienti','view',true),('admin','clienti','create',true),('admin','clienti','edit',true),('admin','clienti','delete',true),
  ('admin','fatturazione','view',true),('admin','fatturazione','create',true),('admin','fatturazione','edit',true),('admin','fatturazione','delete',true),
  ('admin','task','view',true),('admin','task','create',true),('admin','task','edit',true),('admin','task','delete',true),
  ('admin','chat','view',true),('admin','chat','create',true),('admin','chat','edit',true),('admin','chat','delete',true),
  ('admin','report','view',true),('admin','report','create',true),('admin','report','edit',true),('admin','report','delete',true),
  ('admin','customer_care','view',true),('admin','customer_care','create',true),('admin','customer_care','edit',true),('admin','customer_care','delete',true),
  ('admin','impostazioni','view',true),('admin','impostazioni','create',true),('admin','impostazioni','edit',true),('admin','impostazioni','delete',true),
  ('admin','mrr','view',true),('admin','anagrafica_fiscale','view',true),
  -- MANAGER
  ('manager','clienti','view',true),('manager','clienti','create',true),('manager','clienti','edit',true),('manager','clienti','delete',false),
  ('manager','fatturazione','view',true),('manager','fatturazione','create',true),('manager','fatturazione','edit',true),('manager','fatturazione','delete',false),
  ('manager','task','view',true),('manager','task','create',true),('manager','task','edit',true),('manager','task','delete',true),
  ('manager','chat','view',true),('manager','chat','create',true),('manager','chat','edit',true),('manager','chat','delete',false),
  ('manager','report','view',true),('manager','report','create',true),('manager','report','edit',false),('manager','report','delete',false),
  ('manager','customer_care','view',true),('manager','customer_care','create',true),('manager','customer_care','edit',true),('manager','customer_care','delete',false),
  ('manager','impostazioni','view',false),('manager','impostazioni','create',false),('manager','impostazioni','edit',false),('manager','impostazioni','delete',false),
  ('manager','mrr','view',true),('manager','anagrafica_fiscale','view',false),
  -- SENIOR
  ('senior','clienti','view',true),('senior','clienti','create',false),('senior','clienti','edit',true),('senior','clienti','delete',false),
  ('senior','fatturazione','view',false),('senior','fatturazione','create',false),('senior','fatturazione','edit',false),('senior','fatturazione','delete',false),
  ('senior','task','view',true),('senior','task','create',true),('senior','task','edit',true),('senior','task','delete',false),
  ('senior','chat','view',true),('senior','chat','create',true),('senior','chat','edit',false),('senior','chat','delete',false),
  ('senior','report','view',true),('senior','report','create',false),('senior','report','edit',false),('senior','report','delete',false),
  ('senior','customer_care','view',true),('senior','customer_care','create',false),('senior','customer_care','edit',false),('senior','customer_care','delete',false),
  ('senior','impostazioni','view',false),('senior','impostazioni','create',false),('senior','impostazioni','edit',false),('senior','impostazioni','delete',false),
  ('senior','mrr','view',false),('senior','anagrafica_fiscale','view',false),
  -- JUNIOR
  ('junior','clienti','view',true),('junior','clienti','create',false),('junior','clienti','edit',false),('junior','clienti','delete',false),
  ('junior','fatturazione','view',false),('junior','fatturazione','create',false),('junior','fatturazione','edit',false),('junior','fatturazione','delete',false),
  ('junior','task','view',true),('junior','task','create',false),('junior','task','edit',true),('junior','task','delete',false),
  ('junior','chat','view',true),('junior','chat','create',true),('junior','chat','edit',false),('junior','chat','delete',false),
  ('junior','report','view',false),('junior','report','create',false),('junior','report','edit',false),('junior','report','delete',false),
  ('junior','customer_care','view',false),('junior','customer_care','create',false),('junior','customer_care','edit',false),('junior','customer_care','delete',false),
  ('junior','impostazioni','view',false),('junior','impostazioni','create',false),('junior','impostazioni','edit',false),('junior','impostazioni','delete',false),
  ('junior','mrr','view',false),('junior','anagrafica_fiscale','view',false),
  -- VIEWER
  ('viewer','clienti','view',true),('viewer','clienti','create',false),('viewer','clienti','edit',false),('viewer','clienti','delete',false),
  ('viewer','fatturazione','view',false),('viewer','fatturazione','create',false),('viewer','fatturazione','edit',false),('viewer','fatturazione','delete',false),
  ('viewer','task','view',true),('viewer','task','create',false),('viewer','task','edit',false),('viewer','task','delete',false),
  ('viewer','chat','view',true),('viewer','chat','create',false),('viewer','chat','edit',false),('viewer','chat','delete',false),
  ('viewer','report','view',false),('viewer','report','create',false),('viewer','report','edit',false),('viewer','report','delete',false),
  ('viewer','customer_care','view',false),('viewer','customer_care','create',false),('viewer','customer_care','edit',false),('viewer','customer_care','delete',false),
  ('viewer','impostazioni','view',false),('viewer','impostazioni','create',false),('viewer','impostazioni','edit',false),('viewer','impostazioni','delete',false),
  ('viewer','mrr','view',false),('viewer','anagrafica_fiscale','view',false),
  -- CLIENT
  ('client','clienti','view',true),('client','clienti','create',false),('client','clienti','edit',false),('client','clienti','delete',false),
  ('client','fatturazione','view',false),('client','fatturazione','create',false),('client','fatturazione','edit',false),('client','fatturazione','delete',false),
  ('client','task','view',true),('client','task','create',false),('client','task','edit',false),('client','task','delete',false),
  ('client','chat','view',true),('client','chat','create',true),('client','chat','edit',false),('client','chat','delete',false),
  ('client','report','view',false),('client','report','create',false),('client','report','edit',false),('client','report','delete',false),
  ('client','customer_care','view',true),('client','customer_care','create',false),('client','customer_care','edit',false),('client','customer_care','delete',false),
  ('client','impostazioni','view',false),('client','impostazioni','create',false),('client','impostazioni','edit',false),('client','impostazioni','delete',false),
  ('client','mrr','view',false),('client','anagrafica_fiscale','view',false)
ON CONFLICT (role, section, action) DO NOTHING;

-- 3. Assegnazione clienti a utenti (data isolation tra colleghi stesso ruolo)
CREATE TABLE IF NOT EXISTS public.user_client_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES public.profiles(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, client_id)
);

-- 4. Approvazioni (approval requests)
CREATE TABLE IF NOT EXISTS public.approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL, -- 'task_delete','client_edit','invoice_create','custom'
  title TEXT NOT NULL,
  description TEXT,
  requested_by UUID NOT NULL REFERENCES public.profiles(id),
  approver_id UUID REFERENCES public.profiles(id), -- null = qualunque admin/manager
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  entity_type TEXT,  -- 'task','client','invoice'
  entity_id UUID,
  payload JSONB,     -- dati dell'azione da eseguire una volta approvata
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES public.profiles(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Estendi tabella notifications esistente (usa profile_id già presente)
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS entity_type TEXT,
  ADD COLUMN IF NOT EXISTS entity_id UUID;

-- Sincronizza user_id con profile_id per le righe esistenti
UPDATE public.notifications SET user_id = profile_id WHERE user_id IS NULL AND profile_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON public.notifications(user_id, read, created_at DESC);

-- 6. Inviti pendenti
CREATE TABLE IF NOT EXISTS public.invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  app_role TEXT NOT NULL DEFAULT 'junior',
  area TEXT,
  job_title TEXT,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  invited_by UUID REFERENCES public.profiles(id),
  accepted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_client_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- Permessi: tutti possono leggere (serve per il frontend), solo admin/super_admin modificano
CREATE POLICY "rp_read_all" ON public.role_permissions FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "rp_write_admin" ON public.role_permissions FOR ALL USING (public.is_admin_or_above());

-- Assegnazioni clienti
CREATE POLICY "uca_read" ON public.user_client_assignments FOR SELECT USING (
  user_id = auth.uid() OR public.is_admin_or_above()
  OR public.get_app_role() = 'manager'
);
CREATE POLICY "uca_write" ON public.user_client_assignments FOR ALL USING (public.is_admin_or_above());

-- Approvazioni
CREATE POLICY "approvals_read" ON public.approvals FOR SELECT USING (
  requested_by = auth.uid() OR approver_id = auth.uid() OR public.is_admin_or_above()
  OR (approver_id IS NULL AND public.get_app_role() IN ('super_admin','admin','manager'))
);
CREATE POLICY "approvals_insert" ON public.approvals FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "approvals_update" ON public.approvals FOR UPDATE USING (
  approver_id = auth.uid() OR public.is_admin_or_above()
  OR (approver_id IS NULL AND public.get_app_role() IN ('super_admin','admin','manager'))
);

-- Notifiche (DROP prima di ricreare per evitare conflitti con policy esistenti)
DROP POLICY IF EXISTS "notifications_own" ON public.notifications;
DROP POLICY IF EXISTS "notif_read_own" ON public.notifications;
DROP POLICY IF EXISTS "notif_update_own" ON public.notifications;
DROP POLICY IF EXISTS "notif_insert_admin" ON public.notifications;

CREATE POLICY "notif_read_own" ON public.notifications FOR SELECT
  USING (profile_id = auth.uid() OR user_id = auth.uid());
CREATE POLICY "notif_update_own" ON public.notifications FOR UPDATE
  USING (profile_id = auth.uid() OR user_id = auth.uid());
CREATE POLICY "notif_insert_all" ON public.notifications FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Inviti
CREATE POLICY "invit_read_admin" ON public.invitations FOR SELECT USING (public.is_admin_or_above());
CREATE POLICY "invit_all_admin" ON public.invitations FOR ALL USING (public.is_admin_or_above());
