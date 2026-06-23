CREATE TABLE IF NOT EXISTS public.decisions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  context TEXT,
  status TEXT NOT NULL DEFAULT 'aperta'
    CHECK (status IN ('aperta', 'in_revisione', 'decisa', 'archiviata')),
  priority TEXT NOT NULL DEFAULT 'media'
    CHECK (priority IN ('bassa', 'media', 'alta', 'critica')),
  outcome TEXT,
  decided_at TIMESTAMPTZ,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.decisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "decisions_rls" ON public.decisions;
CREATE POLICY "decisions_rls" ON public.decisions
  FOR ALL USING (public.get_my_role() IN ('admin', 'team'));
