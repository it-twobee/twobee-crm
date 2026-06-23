-- ═══════════════════════════════════════════════════
-- HR & TEAM
-- ═══════════════════════════════════════════════════

-- Ferie e permessi
CREATE TABLE IF NOT EXISTS public.team_leaves (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('ferie','permesso','malattia','straordinario','altro')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days_count NUMERIC(4,1) NOT NULL DEFAULT 1,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'in_attesa' CHECK (status IN ('in_attesa','approvato','rifiutato')),
  approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance review trimestrali
CREATE TABLE IF NOT EXISTS public.performance_reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reviewee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  quarter TEXT NOT NULL, -- es. '2025-Q1'
  score_quality INTEGER CHECK (score_quality BETWEEN 1 AND 5),
  score_speed INTEGER CHECK (score_speed BETWEEN 1 AND 5),
  score_communication INTEGER CHECK (score_communication BETWEEN 1 AND 5),
  score_initiative INTEGER CHECK (score_initiative BETWEEN 1 AND 5),
  strengths TEXT,
  improvements TEXT,
  goals_next_quarter TEXT,
  overall_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(reviewee_id, quarter)
);

-- Onboarding checklist per nuovi membri
CREATE TABLE IF NOT EXISTS public.onboarding_steps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  step TEXT NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  due_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Budget per membro del team (costi aziendali)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS monthly_cost NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS contract_type TEXT CHECK (contract_type IN ('dipendente','collaboratore','partita_iva','stage')),
  ADD COLUMN IF NOT EXISTS hire_date DATE,
  ADD COLUMN IF NOT EXISTS birth_date DATE;

-- ═══════════════════════════════════════════════════
-- STRATEGIA — OKR & Roadmap
-- ═══════════════════════════════════════════════════

-- OKR: Objectives
CREATE TABLE IF NOT EXISTS public.objectives (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  quarter TEXT NOT NULL, -- es. '2025-Q2'
  owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'attivo' CHECK (status IN ('attivo','completato','abbandonato')),
  progress INTEGER DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  area TEXT, -- 'commerciale','operativa','brand','hr','tech'
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Key Results per ogni Objective
CREATE TABLE IF NOT EXISTS public.key_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  objective_id UUID NOT NULL REFERENCES public.objectives(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  target_value NUMERIC(12,2),
  current_value NUMERIC(12,2) DEFAULT 0,
  unit TEXT DEFAULT '%', -- '%', '€', 'n', 'ore'
  due_date DATE,
  status TEXT DEFAULT 'in_corso' CHECK (status IN ('in_corso','completato','a_rischio','abbandonato')),
  notes TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Roadmap milestones
CREATE TABLE IF NOT EXISTS public.roadmap_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  area TEXT NOT NULL, -- 'prodotto','commerciale','hr','tech','brand'
  status TEXT DEFAULT 'pianificato' CHECK (status IN ('pianificato','in_corso','completato','bloccato','rinviato')),
  priority TEXT DEFAULT 'media' CHECK (priority IN ('critica','alta','media','bassa')),
  start_date DATE,
  due_date DATE,
  completed_at TIMESTAMPTZ,
  owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  objective_id UUID REFERENCES public.objectives(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Note strategiche / verbali meeting
CREATE TABLE IF NOT EXISTS public.strategic_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT,
  type TEXT DEFAULT 'nota' CHECK (type IN ('nota','verbale','decisione','retrospettiva')),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  participants UUID[] DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  pinned BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════
-- RLS POLICIES
-- ═══════════════════════════════════════════════════
ALTER TABLE public.team_leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.objectives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.key_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roadmap_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strategic_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team_leaves_all" ON public.team_leaves FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "performance_reviews_all" ON public.performance_reviews FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "onboarding_steps_all" ON public.onboarding_steps FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "objectives_all" ON public.objectives FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "key_results_all" ON public.key_results FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "roadmap_items_all" ON public.roadmap_items FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "strategic_notes_all" ON public.strategic_notes FOR ALL USING (auth.uid() IS NOT NULL);
