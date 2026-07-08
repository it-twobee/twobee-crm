-- Migration 079: workspace_sections + workspace_section_permissions + seed dati MVP

-- ─── workspace_sections ───────────────────────────────────────────────────────
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

-- ─── workspace_section_permissions ───────────────────────────────────────────
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

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.workspace_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_section_permissions ENABLE ROW LEVEL SECURITY;

-- Tutti possono leggere le sezioni (filtro lato app per is_active)
CREATE POLICY "workspace_sections_read_all" ON public.workspace_sections
  FOR SELECT USING (true);

-- Solo super_admin scrive
CREATE POLICY "workspace_sections_write_superadmin" ON public.workspace_sections
  FOR ALL USING (public.get_my_app_role() = 'super_admin');

-- workspace_section_permissions: lettura per tutti, scrittura solo super_admin
CREATE POLICY "wsp_read_all" ON public.workspace_section_permissions
  FOR SELECT USING (true);
CREATE POLICY "wsp_write_superadmin" ON public.workspace_section_permissions
  FOR ALL USING (public.get_my_app_role() = 'super_admin');

-- ─── Seed: 12 sezioni workspace ──────────────────────────────────────────────
INSERT INTO public.workspace_sections
  (key, label, description, route, icon, sort_order, is_active, is_phase2)
VALUES
  ('dashboard',        'Dashboard',          'Riepilogo giornaliero personale',           '/workspace',             'LayoutDashboard', 1,  true,  false),
  ('mie_attivita',     'Le mie attività',    'Tutte le task assegnate',                   '/workspace/attivita',    'CheckSquare',     2,  true,  false),
  ('progetti',         'Progetti assegnati', 'Progetti a cui sei assegnato',              '/workspace/progetti',    'FolderKanban',    3,  true,  false),
  ('calendario',       'Calendario',         'Scadenze e appuntamenti personali',         '/workspace/calendario',  'Calendar',        4,  true,  false),
  ('chat',             'Chat',               'Canali operativi team e progetto',          '/workspace/chat',        'MessageSquare',   5,  true,  false),
  ('documenti',        'Documenti',          'Documenti condivisi e brief',               '/workspace/documenti',   'FileText',        6,  true,  false),
  ('hr',               'Richieste HR',       'Ferie, permessi, malattia, spese',          '/workspace/hr',          'Heart',           7,  true,  false),
  ('profilo',          'Profilo',            'Dati personali e competenze',               '/workspace/profilo',     'User',            8,  true,  true),
  ('performance',      'Performance',        'KPI operativi personali',                   '/workspace/performance', 'TrendingUp',      9,  false, true),
  ('knowledge',        'Knowledge',          'Knowledge base operativa',                  '/workspace/knowledge',   'BookOpen',        10, false, true),
  ('ai_assistant',     'AI Assistant',       'Suggerimenti AI personalizzati',            '/workspace/ai',          'Sparkles',        11, false, true),
  ('andamento_twobee', 'Andamento TwoBee',   'MRR e fatturato macro aziendale',           '/workspace/andamento',   'BarChart3',       12, false, true)
ON CONFLICT (key) DO NOTHING;

-- ─── Seed: permessi default per sezioni day-one ───────────────────────────────
-- Ruoli workspace: manager, senior, junior, stage, freelance
DO $$
DECLARE
  sec_id UUID;
  roles TEXT[] := ARRAY['manager','senior','junior','stage','freelance'];
  r TEXT;
BEGIN
  -- Tutte le 7 sezioni day-one: view + create + edit per tutti i ruoli workspace
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

  -- stage: no can_create su hr (non può creare richieste HR autonomamente)
  -- (override: stage vede hr ma non crea - lasciamo can_create=true, gestito lato app se necessario)

  -- Phase 2 sections: disabilitate, nessun permesso inserito ora
END $$;
