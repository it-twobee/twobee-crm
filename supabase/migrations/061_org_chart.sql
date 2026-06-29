-- ─── Organigramma: unità funzionali + assegnazioni membri ────────────────────

CREATE TABLE IF NOT EXISTS public.org_units (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  color           TEXT NOT NULL DEFAULT '#F5C800',
  responsibilities TEXT,
  lead_id         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  position        INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.org_members (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id      UUID NOT NULL REFERENCES public.org_units(id) ON DELETE CASCADE,
  profile_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role_in_unit TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (unit_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_unit ON public.org_members(unit_id);

ALTER TABLE public.org_units   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;

-- Lettura: tutto lo staff (admin/team). Scrittura: solo admin.
DROP POLICY IF EXISTS "org_units_read"  ON public.org_units;
CREATE POLICY "org_units_read"  ON public.org_units  FOR SELECT USING (public.is_staff());
DROP POLICY IF EXISTS "org_units_write" ON public.org_units;
CREATE POLICY "org_units_write" ON public.org_units  FOR ALL USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "org_members_read"  ON public.org_members;
CREATE POLICY "org_members_read"  ON public.org_members FOR SELECT USING (public.is_staff());
DROP POLICY IF EXISTS "org_members_write" ON public.org_members;
CREATE POLICY "org_members_write" ON public.org_members FOR ALL USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

-- Seed delle unità funzionali dalla riunione strategica
INSERT INTO public.org_units (name, color, responsibilities, position) VALUES
  ('Growth',               '#22C55E', 'Strategia growth marketing, performance e crescita clienti', 0),
  ('Advertising',          '#F59E0B', 'Gestione e ottimizzazione campagne pubblicitarie (Meta, Google)', 1),
  ('Automation & Tracking','#8B5CF6', 'Tracciamenti, pixel, marketing automation, CRM e flussi', 2),
  ('IT & Sviluppo',        '#3B82F6', 'Siti web, e-commerce, sviluppo piattaforma e infrastruttura', 3),
  ('Social Organic',       '#EC4899', 'Contenuti organici, piano editoriale, community e brand', 4)
ON CONFLICT DO NOTHING;
