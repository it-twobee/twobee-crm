CREATE TABLE IF NOT EXISTS public.ai_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  call_type   TEXT        NOT NULL,
  model       TEXT        NOT NULL DEFAULT 'llama-3.3-70b-versatile',
  latency_ms  INTEGER,
  success     BOOLEAN     NOT NULL DEFAULT true,
  tokens_used INTEGER,
  error_message TEXT
);

ALTER TABLE public.ai_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin read ai_logs" ON public.ai_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND (app_role IN ('admin','manager','super_admin') OR email = 'm.lucci@twobee.it')
    )
  );

CREATE INDEX IF NOT EXISTS idx_ai_logs_created_at ON public.ai_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_logs_call_type  ON public.ai_logs(call_type);
