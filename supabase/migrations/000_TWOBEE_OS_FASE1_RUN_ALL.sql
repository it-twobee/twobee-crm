-- =============================================================================
-- TWOBEE OS — FASE 1 FOUNDATION
-- Esegui questo script intero nel Supabase Dashboard → SQL Editor
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1: Helper functions senza dipendenze da tabelle
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_my_app_role()
RETURNS TEXT LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT app_role FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.is_founder()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT public.get_my_app_role() IN ('founder', 'super_admin')
$$;

CREATE OR REPLACE FUNCTION public.is_workspace_user()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT public.get_my_app_role() IN ('manager', 'senior', 'junior', 'stage', 'freelance')
$$;

CREATE OR REPLACE FUNCTION public.is_partner_user()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT public.get_my_app_role() = 'partner'
$$;

CREATE OR REPLACE FUNCTION public.can_view_macro_revenue()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT public.get_my_app_role() NOT IN ('partner', 'client', 'guest')
$$;

-- NOTA: has_permission() e can_view_full_financials() vengono create
-- DOPO profile_permissions (STEP 3b), perché SQL valida i riferimenti
-- alle tabelle a parse time.


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2: 077 — Estendi app_role + resource_type + seniority su profiles
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_app_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_app_role_check
    CHECK (app_role IN (
      'super_admin', 'founder', 'admin', 'manager',
      'senior', 'junior', 'stage', 'freelance',
      'partner', 'viewer', 'client', 'guest'
    ));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS resource_type TEXT
    CHECK (resource_type IN (
      'dipendente', 'piva', 'freelance_continuativo',
      'collaboratore_una_tantum', 'partner_aziendale'
    ));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS seniority TEXT
    CHECK (seniority IN ('lead', 'senior', 'mid', 'junior', 'stage'));


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3: 078 — profile_permissions (ora le funzioni esistono già)
-- ─────────────────────────────────────────────────────────────────────────────

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

ALTER TABLE public.profile_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profile_permissions_read" ON public.profile_permissions
  FOR SELECT USING (
    profile_id = auth.uid()
    OR public.get_my_role() = 'admin'
    OR public.get_my_app_role() IN ('super_admin', 'founder')
  );

CREATE POLICY "profile_permissions_write" ON public.profile_permissions
  FOR ALL USING (public.get_my_app_role() = 'super_admin');

-- STEP 3b: funzioni che dipendono da profile_permissions (ora la tabella esiste)
CREATE OR REPLACE FUNCTION public.has_permission(perm TEXT)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profile_permissions
    WHERE profile_id = auth.uid()
      AND permission = perm
      AND granted = true
  )
$$;

CREATE OR REPLACE FUNCTION public.can_view_full_financials()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT public.is_founder() OR public.has_permission('can_view_full_financials')
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4: 079 — workspace_sections + workspace_section_permissions + seed
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.workspace_sections (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key                  TEXT UNIQUE NOT NULL,
  label                TEXT NOT NULL,
  description          TEXT,
  route                TEXT NOT NULL,
  icon                 TEXT,
  sort_order           INT DEFAULT 0,
  is_active            BOOLEAN DEFAULT true,
  is_beta              BOOLEAN DEFAULT false,
  is_phase2            BOOLEAN DEFAULT false,
  requires_permission  TEXT,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.workspace_section_permissions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id     UUID NOT NULL REFERENCES public.workspace_sections(id) ON DELETE CASCADE,
  app_role       TEXT,
  resource_type  TEXT,
  seniority      TEXT,
  can_view       BOOLEAN DEFAULT false,
  can_create     BOOLEAN DEFAULT false,
  can_edit       BOOLEAN DEFAULT false,
  can_delete     BOOLEAN DEFAULT false,
  created_at     TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.workspace_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_section_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_sections_read_all" ON public.workspace_sections
  FOR SELECT USING (true);
CREATE POLICY "workspace_sections_write_superadmin" ON public.workspace_sections
  FOR ALL USING (public.get_my_app_role() = 'super_admin');

CREATE POLICY "wsp_read_all" ON public.workspace_section_permissions
  FOR SELECT USING (true);
CREATE POLICY "wsp_write_superadmin" ON public.workspace_section_permissions
  FOR ALL USING (public.get_my_app_role() = 'super_admin');

-- Seed 12 sezioni
INSERT INTO public.workspace_sections
  (key, label, description, route, icon, sort_order, is_active, is_phase2)
VALUES
  ('dashboard',        'Dashboard',          'Riepilogo giornaliero personale',    '/workspace',             'LayoutDashboard', 1,  true,  false),
  ('mie_attivita',     'Le mie attività',    'Tutte le task assegnate',            '/workspace/attivita',    'CheckSquare',     2,  true,  false),
  ('progetti',         'Progetti assegnati', 'Progetti a cui sei assegnato',       '/workspace/progetti',    'FolderKanban',    3,  true,  false),
  ('calendario',       'Calendario',         'Scadenze e appuntamenti personali',  '/workspace/calendario',  'Calendar',        4,  true,  false),
  ('chat',             'Chat',               'Canali operativi team e progetto',   '/workspace/chat',        'MessageSquare',   5,  true,  false),
  ('documenti',        'Documenti',          'Documenti condivisi e brief',        '/workspace/documenti',   'FileText',        6,  true,  false),
  ('hr',               'Richieste HR',       'Ferie, permessi, malattia, spese',   '/workspace/hr',          'Heart',           7,  true,  false),
  ('profilo',          'Profilo',            'Dati personali e competenze',        '/workspace/profilo',     'User',            8,  true,  true),
  ('performance',      'Performance',        'KPI operativi personali',            '/workspace/performance', 'TrendingUp',      9,  false, true),
  ('knowledge',        'Knowledge',          'Knowledge base operativa',           '/workspace/knowledge',   'BookOpen',        10, false, true),
  ('ai_assistant',     'AI Assistant',       'Suggerimenti AI personalizzati',     '/workspace/ai',          'Sparkles',        11, false, true),
  ('andamento_twobee', 'Andamento TwoBee',   'MRR e fatturato macro aziendale',    '/workspace/andamento',   'BarChart3',       12, false, true)
ON CONFLICT (key) DO NOTHING;

-- Seed permessi default: tutte le 7 sezioni day-one per tutti i ruoli workspace
DO $$
DECLARE
  sec_id UUID;
  roles TEXT[] := ARRAY['manager','senior','junior','stage','freelance'];
  r TEXT;
BEGIN
  FOREACH r IN ARRAY roles LOOP
    FOR sec_id IN
      SELECT id FROM public.workspace_sections
      WHERE key IN ('dashboard','mie_attivita','progetti','calendario','chat','documenti','hr')
    LOOP
      INSERT INTO public.workspace_section_permissions
        (section_id, app_role, can_view, can_create, can_edit, can_delete)
      VALUES (sec_id, r, true, true, true, false)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 5: 080 — documents.visibility + RLS documenti + tipo canale partner_customer_care
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'internal'
    CHECK (visibility IN (
      'internal', 'operations_visible', 'partner_visible', 'client_visible',
      'private_admin', 'private_founder', 'shared_in_report', 'draft'
    ));

DROP POLICY IF EXISTS "documents_read"   ON public.documents;
DROP POLICY IF EXISTS "documents_select" ON public.documents;

CREATE POLICY "documents_visibility_read" ON public.documents
  FOR SELECT USING (
    CASE visibility
      WHEN 'private_founder'    THEN public.is_founder()
      WHEN 'private_admin'      THEN public.get_my_role() = 'admin' OR public.is_founder()
      WHEN 'internal'           THEN public.get_my_role() IN ('admin','team') OR public.is_founder()
      WHEN 'operations_visible' THEN
        public.is_workspace_user() OR public.get_my_role() IN ('admin','team') OR public.is_founder()
      WHEN 'partner_visible'    THEN
        public.is_partner_user() OR public.get_my_role() IN ('admin','team') OR public.is_founder()
      WHEN 'client_visible'     THEN
        client_id = public.get_my_client_id_as_client()
        OR public.get_my_role() IN ('admin','team') OR public.is_founder()
      WHEN 'shared_in_report'   THEN true
      WHEN 'draft'              THEN public.get_my_role() = 'admin' OR public.is_founder()
      ELSE false
    END
  );

DROP POLICY IF EXISTS "documents_write"  ON public.documents;
CREATE POLICY "documents_write" ON public.documents
  FOR INSERT WITH CHECK (
    public.get_my_role() IN ('admin','team')
    OR public.is_founder()
    OR public.is_workspace_user()
    OR public.is_partner_user()
  );

DROP POLICY IF EXISTS "documents_update" ON public.documents;
CREATE POLICY "documents_update" ON public.documents
  FOR UPDATE USING (
    uploaded_by = auth.uid()
    OR public.get_my_role() = 'admin'
    OR public.is_founder()
  );

ALTER TABLE public.chat_channels
  DROP CONSTRAINT IF EXISTS chat_channels_type_check;
ALTER TABLE public.chat_channels
  ADD CONSTRAINT chat_channels_type_check
    CHECK (type IN (
      'cliente', 'interno', 'task', 'customer_care',
      'cliente_interno', 'partner_customer_care'
    ));


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 6: 081 — projects.manager_id
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS manager_id UUID
    REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_projects_manager ON public.projects(manager_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 7: 082 — hr_requests
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hr_requests (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type           TEXT NOT NULL
    CHECK (type IN ('ferie', 'permesso', 'malattia', 'spesa', 'documento_hr')),
  status         TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  start_date     DATE,
  end_date       DATE,
  notes          TEXT,
  amount         DECIMAL(10,2),
  attachment_url TEXT,
  reviewed_by    UUID REFERENCES public.profiles(id),
  reviewed_at    TIMESTAMPTZ,
  review_note    TEXT,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hr_requests_profile ON public.hr_requests(profile_id);
CREATE INDEX IF NOT EXISTS idx_hr_requests_status  ON public.hr_requests(status);

ALTER TABLE public.hr_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_requests_read" ON public.hr_requests
  FOR SELECT USING (
    profile_id = auth.uid()
    OR public.get_my_role() = 'admin'
    OR public.is_founder()
    OR public.has_permission('can_approve_hr')
  );

CREATE POLICY "hr_requests_insert" ON public.hr_requests
  FOR INSERT WITH CHECK (profile_id = auth.uid());

CREATE POLICY "hr_requests_update" ON public.hr_requests
  FOR UPDATE USING (
    (profile_id = auth.uid() AND status = 'pending')
    OR public.get_my_role() = 'admin'
    OR public.is_founder()
    OR public.has_permission('can_approve_hr')
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 8: 083 — lead_contacts
-- ─────────────────────────────────────────────────────────────────────────────

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

CREATE POLICY "lead_contacts_admin" ON public.lead_contacts
  FOR ALL USING (
    public.get_my_role() = 'admin' OR public.is_founder()
  );

CREATE POLICY "lead_contacts_client_read" ON public.lead_contacts
  FOR SELECT USING (
    client_id = public.get_my_client_id_as_client()
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 9: 084 — task_block_reports
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.task_block_reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id      UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  reported_by  UUID NOT NULL REFERENCES public.profiles(id),
  reason       TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'acknowledged', 'resolved')),
  resolved_by  UUID REFERENCES public.profiles(id),
  resolved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_block_reports_task   ON public.task_block_reports(task_id);
CREATE INDEX IF NOT EXISTS idx_task_block_reports_status ON public.task_block_reports(status);

ALTER TABLE public.task_block_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_block_reports_insert" ON public.task_block_reports
  FOR INSERT WITH CHECK (reported_by = auth.uid());

CREATE POLICY "task_block_reports_read" ON public.task_block_reports
  FOR SELECT USING (
    reported_by = auth.uid()
    OR public.get_my_role() = 'admin'
    OR public.is_founder()
    OR public.get_my_app_role() = 'manager'
  );

CREATE POLICY "task_block_reports_update" ON public.task_block_reports
  FOR UPDATE USING (
    public.get_my_role() = 'admin'
    OR public.is_founder()
    OR public.get_my_app_role() = 'manager'
  );


-- =============================================================================
-- FINE — Fase 1 Foundation completata
-- =============================================================================
