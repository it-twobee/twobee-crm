-- ─── TwoBee OS — Project Management Roadmap ────────────────────────────────

CREATE TABLE IF NOT EXISTS public.os_phases (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_number  INTEGER NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  description   TEXT,
  duration_weeks INTEGER NOT NULL DEFAULT 1,
  status        TEXT NOT NULL DEFAULT 'non_iniziata'
    CHECK (status IN ('non_iniziata', 'in_corso', 'completata', 'bloccata')),
  progress      INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  start_date    DATE,
  end_date      DATE,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.os_backlog_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id           UUID REFERENCES public.os_backlog_items(id) ON DELETE CASCADE,
  phase_id            UUID REFERENCES public.os_phases(id) ON DELETE SET NULL,
  level               TEXT NOT NULL
    CHECK (level IN ('initiative', 'epic', 'feature', 'story', 'task')),
  title               TEXT NOT NULL,
  description         TEXT,
  status              TEXT NOT NULL DEFAULT 'aperta'
    CHECK (status IN ('aperta', 'in_corso', 'completata', 'bloccata', 'scartata')),
  priority            TEXT NOT NULL DEFAULT 'media'
    CHECK (priority IN ('critica', 'alta', 'media', 'bassa')),
  sprint_target       INTEGER,
  owner               TEXT,
  effort_days         NUMERIC(5,1),
  acceptance_criteria TEXT,
  created_by          UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.os_ideas (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  problem          TEXT,
  user_type        TEXT,
  impact           INTEGER NOT NULL DEFAULT 3 CHECK (impact BETWEEN 1 AND 5),
  frequency        INTEGER NOT NULL DEFAULT 3 CHECK (frequency BETWEEN 1 AND 5),
  confidence       INTEGER NOT NULL DEFAULT 3 CHECK (confidence BETWEEN 1 AND 5),
  effort           INTEGER NOT NULL DEFAULT 3 CHECK (effort BETWEEN 1 AND 5),
  priority_release TEXT,
  notes            TEXT,
  status           TEXT NOT NULL DEFAULT 'in_valutazione'
    CHECK (status IN ('in_valutazione', 'approvata', 'nel_backlog', 'scartata', 'rimandata')),
  created_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: solo super_admin (gestito lato app, ma policy di sicurezza)
ALTER TABLE public.os_phases        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.os_backlog_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.os_ideas         ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "os_admin" ON public.os_phases;
DROP POLICY IF EXISTS "os_admin" ON public.os_backlog_items;
DROP POLICY IF EXISTS "os_admin" ON public.os_ideas;
CREATE POLICY "os_admin" ON public.os_phases        FOR ALL USING (public.get_my_role() = 'admin');
CREATE POLICY "os_admin" ON public.os_backlog_items FOR ALL USING (public.get_my_role() = 'admin');
CREATE POLICY "os_admin" ON public.os_ideas         FOR ALL USING (public.get_my_role() = 'admin');

-- ─── Seed: 8 fasi della roadmap ─────────────────────────────────────────────
INSERT INTO public.os_phases (phase_number, name, description, duration_weeks) VALUES
(0, 'Product Charter',
 'Definire cosa è TwoBee OS e, soprattutto, cosa non è. Product Vision, utenti, perimetro, KPI di successo.',
 1),
(1, 'Discovery e Process Mapping',
 'Capire come lavora realmente TwoBee prima di digitalizzare. Mappare i 6 processi core e intervistarei ruoli.',
 2),
(2, 'Architettura dati e UX',
 'La fase più importante. Entity Relationship Diagram, Data Dictionary, Sitemap, Wireframe, Permission Matrix.',
 2),
(3, 'Core Operational MVP',
 'Sprint 1: autenticazione, clienti, engagement. Sprint 2: obiettivi, progetti, milestone, task, kanban.',
 4),
(4, 'Controllo economico',
 'Timesheet, costi risorse, budget engagement, marginalità, forecast. Qui il tool diventa gestionale.',
 2),
(5, 'Controllo strategico',
 'Company Pulse, Client Health Score, Decision Center, Risk Center, Strategic Objectives / OKR.',
 2),
(6, 'Automation e AI',
 'Onboarding automatico, meeting automation, reporting automation, AI Executive Brief, AI Query.',
 2),
(7, 'Pilot e Rollout',
 'Test su 3 clienti campione, bug fixing, formazione, migrazione dati, rollout per ruolo.',
 1)
ON CONFLICT (phase_number) DO NOTHING;
