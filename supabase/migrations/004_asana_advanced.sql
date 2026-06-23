-- === TASK ENHANCEMENTS ===

-- Extra columns on tasks
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS is_milestone BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS estimated_hours NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS logged_hours NUMERIC(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recurrence TEXT,            -- 'daily'|'weekly'|'monthly'|null
  ADD COLUMN IF NOT EXISTS recurrence_end_date DATE,
  ADD COLUMN IF NOT EXISTS template_name TEXT,         -- non-null = è un template
  ADD COLUMN IF NOT EXISTS section TEXT;               -- sotto-sezione nel progetto

-- Task comments
CREATE TABLE IF NOT EXISTS public.task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  author_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_at TIMESTAMPTZ
);
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth can manage task_comments" ON public.task_comments
  FOR ALL USING (auth.uid() IS NOT NULL);

-- Task dependencies
CREATE TABLE IF NOT EXISTS public.task_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  depends_on_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'blocking', -- 'blocking' | 'waiting_on'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(task_id, depends_on_id)
);
ALTER TABLE public.task_dependencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth can manage task_dependencies" ON public.task_dependencies
  FOR ALL USING (auth.uid() IS NOT NULL);

-- Time logs
CREATE TABLE IF NOT EXISTS public.task_time_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  hours NUMERIC(5,2) NOT NULL,
  note TEXT,
  logged_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.task_time_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth can manage task_time_logs" ON public.task_time_logs
  FOR ALL USING (auth.uid() IS NOT NULL);

-- Task followers (watchers)
CREATE TABLE IF NOT EXISTS public.task_followers (
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (task_id, profile_id)
);
ALTER TABLE public.task_followers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth can manage task_followers" ON public.task_followers
  FOR ALL USING (auth.uid() IS NOT NULL);

-- Task attachments (separate from chat)
CREATE TABLE IF NOT EXISTS public.task_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.task_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth can manage task_attachments" ON public.task_attachments
  FOR ALL USING (auth.uid() IS NOT NULL);

-- Trigger: aggiorna logged_hours sul task quando si logga tempo
CREATE OR REPLACE FUNCTION update_task_logged_hours()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.tasks
  SET logged_hours = (SELECT COALESCE(SUM(hours), 0) FROM public.task_time_logs WHERE task_id = NEW.task_id)
  WHERE id = NEW.task_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_logged_hours ON public.task_time_logs;
CREATE TRIGGER trg_update_logged_hours
  AFTER INSERT OR UPDATE OR DELETE ON public.task_time_logs
  FOR EACH ROW EXECUTE FUNCTION update_task_logged_hours();
