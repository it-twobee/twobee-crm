-- Migration 084: task_block_reports — segnalazione blocco su una task

CREATE TABLE IF NOT EXISTS public.task_block_reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id      UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  reported_by  UUID NOT NULL REFERENCES public.profiles(id),
  reason       TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'acknowledged', 'resolved')),
  resolved_by  UUID REFERENCES public.profiles(id),
  resolved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_block_reports_task   ON public.task_block_reports(task_id);
CREATE INDEX IF NOT EXISTS idx_task_block_reports_status ON public.task_block_reports(status);

ALTER TABLE public.task_block_reports ENABLE ROW LEVEL SECURITY;

-- Chiunque può segnalare un blocco (su task a cui ha accesso)
CREATE POLICY "task_block_reports_insert" ON public.task_block_reports
  FOR INSERT WITH CHECK (reported_by = auth.uid());

-- Chi ha segnalato vede la propria segnalazione; admin/founder vedono tutte
CREATE POLICY "task_block_reports_read" ON public.task_block_reports
  FOR SELECT USING (
    reported_by = auth.uid()
    OR public.get_my_role() = 'admin'
    OR public.is_founder()
    OR public.get_my_app_role() = 'manager'
  );

-- Solo admin/founder/manager può aggiornare lo status
CREATE POLICY "task_block_reports_update" ON public.task_block_reports
  FOR UPDATE USING (
    public.get_my_role() = 'admin'
    OR public.is_founder()
    OR public.get_my_app_role() = 'manager'
  );
