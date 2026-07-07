-- Extend task_assignees: add id PK + is_primary_owner flag
-- Additive: keeps (task_id, profile_id) as unique constraint

ALTER TABLE public.task_assignees
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();

ALTER TABLE public.task_assignees
  ADD COLUMN IF NOT EXISTS is_primary_owner BOOLEAN NOT NULL DEFAULT false;

-- Replace composite PK with id PK + unique constraint
ALTER TABLE public.task_assignees
  DROP CONSTRAINT IF EXISTS task_assignees_pkey;

ALTER TABLE public.task_assignees
  ADD PRIMARY KEY (id);

ALTER TABLE public.task_assignees
  ADD CONSTRAINT task_assignees_task_profile_unique UNIQUE (task_id, profile_id);

-- ── task_deletion_requests ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.task_deletion_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES public.profiles(id),
  reason      TEXT,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.task_deletion_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_read_deletion_requests"
  ON public.task_deletion_requests FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'team')));

CREATE POLICY "own_deletion_requests"
  ON public.task_deletion_requests FOR INSERT
  WITH CHECK (requested_by = auth.uid());

CREATE POLICY "admin_manage_deletion_requests"
  ON public.task_deletion_requests FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE INDEX idx_task_deletion_requests_task ON public.task_deletion_requests(task_id);
CREATE INDEX idx_task_deletion_requests_status ON public.task_deletion_requests(status) WHERE status = 'pending';
