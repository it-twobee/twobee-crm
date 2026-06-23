CREATE TABLE IF NOT EXISTS public.project_appointments (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id  UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  client_id   UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  title       TEXT NOT NULL,
  date        DATE NOT NULL,
  time        TIME,
  location    TEXT,
  notes       TEXT,
  attendees   TEXT[],
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.project_appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth users" ON public.project_appointments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS project_appointments_project_id_idx ON public.project_appointments(project_id);
CREATE INDEX IF NOT EXISTS project_appointments_date_idx ON public.project_appointments(date);
