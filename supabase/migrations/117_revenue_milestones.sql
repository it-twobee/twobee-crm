-- FASE 1c — `revenue_milestones`: acconto / SAL / saldo di uno stream.
-- Additiva + idempotente.
--
-- `trigger_task_id` è il ponte fra delivery ed economia: quando la milestone di
-- progetto (tasks.is_milestone) viene chiusa, il SAL diventa fatturabile. È
-- l'UNICO punto in cui il project management tocca il denaro, ed è read-only
-- per il Workspace (tabella admin-only).

CREATE TABLE IF NOT EXISTS public.revenue_milestones (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id       UUID NOT NULL REFERENCES public.revenue_streams(id) ON DELETE CASCADE,
  label           TEXT NOT NULL,                       -- 'Acconto 30%', 'SAL 1', 'Saldo'
  amount          NUMERIC(12,2) NOT NULL,              -- imponibile
  due_on          DATE,
  trigger_task_id UUID REFERENCES public.tasks(id)    ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'previsto'
    CHECK (status IN ('previsto','maturato','fatturato','incassato','annullato')),
  invoice_id      UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  position        INT  NOT NULL DEFAULT 0,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rm_stream  ON public.revenue_milestones(stream_id);
CREATE INDEX IF NOT EXISTS idx_rm_task    ON public.revenue_milestones(trigger_task_id);
CREATE INDEX IF NOT EXISTS idx_rm_invoice ON public.revenue_milestones(invoice_id);
-- "SAL completati non fatturati" = il denaro dimenticato. Indice dedicato.
CREATE INDEX IF NOT EXISTS idx_rm_unbilled
  ON public.revenue_milestones(status) WHERE invoice_id IS NULL;

CREATE OR REPLACE FUNCTION public.set_rm_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS rm_updated_at ON public.revenue_milestones;
CREATE TRIGGER rm_updated_at BEFORE UPDATE ON public.revenue_milestones
  FOR EACH ROW EXECUTE FUNCTION public.set_rm_updated_at();

ALTER TABLE public.revenue_milestones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rm_admin" ON public.revenue_milestones;
CREATE POLICY "rm_admin" ON public.revenue_milestones
  FOR ALL USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- Rollback: DROP TABLE public.revenue_milestones;
