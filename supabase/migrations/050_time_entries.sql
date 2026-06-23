CREATE TABLE IF NOT EXISTS public.time_entries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id  UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  client_id   UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  task_id     UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  hours       NUMERIC(5,2) NOT NULL CHECK (hours > 0 AND hours <= 24),
  category    TEXT NOT NULL DEFAULT 'sviluppo',
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth can manage time_entries" ON public.time_entries
  FOR ALL USING (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_time_entries_profile ON public.time_entries(profile_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_date    ON public.time_entries(date);
CREATE INDEX IF NOT EXISTS idx_time_entries_project ON public.time_entries(project_id);
