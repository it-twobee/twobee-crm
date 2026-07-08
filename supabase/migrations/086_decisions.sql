-- Decision Center: registro decisioni strategiche (founder/super_admin only)
CREATE TABLE IF NOT EXISTS public.decisions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  context     TEXT,
  options     JSONB NOT NULL DEFAULT '[]',
  decision    TEXT,
  rationale   TEXT,
  status      TEXT NOT NULL DEFAULT 'aperta' CHECK (status IN ('aperta', 'decisa', 'archiviata')),
  impact      TEXT NOT NULL DEFAULT 'medio' CHECK (impact IN ('alto', 'medio', 'basso')),
  area        TEXT,
  due_date    DATE,
  decided_at  TIMESTAMPTZ,
  created_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_decisions_status ON public.decisions(status);

ALTER TABLE public.decisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS decisions_admin_all ON public.decisions;
CREATE POLICY decisions_admin_all ON public.decisions
  FOR ALL USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');
