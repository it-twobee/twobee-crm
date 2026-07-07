-- Multi-owner tasks: bridge table additiva
-- assignee_id resta owner primario per backward compat
CREATE TABLE IF NOT EXISTS public.task_assignees (
  task_id    UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'collaborator' CHECK (role IN ('owner', 'collaborator', 'reviewer')),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by UUID REFERENCES public.profiles(id),
  PRIMARY KEY (task_id, profile_id)
);

ALTER TABLE public.task_assignees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_read_task_assignees"
  ON public.task_assignees FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'team')));

CREATE POLICY "admin_manage_task_assignees"
  ON public.task_assignees FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "own_task_assignees"
  ON public.task_assignees FOR SELECT
  USING (profile_id = auth.uid());

CREATE INDEX idx_task_assignees_profile ON public.task_assignees(profile_id);
CREATE INDEX idx_task_assignees_task ON public.task_assignees(task_id);
