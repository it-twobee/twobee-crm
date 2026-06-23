-- ── TABELLA INTERAZIONI COMMERCIALI ──────────────────────────────
-- Registra ogni touchpoint con il cliente: call, meeting, email, demo, etc.

CREATE TYPE interaction_type AS ENUM (
  'call', 'meeting', 'email', 'demo', 'visit', 'slack', 'proposta', 'altro'
);

CREATE TYPE interaction_outcome AS ENUM (
  'positivo', 'neutro', 'negativo', 'da_seguire'
);

CREATE TABLE IF NOT EXISTS public.client_interactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  type          interaction_type NOT NULL DEFAULT 'call',
  date          TIMESTAMPTZ NOT NULL DEFAULT now(),
  title         TEXT NOT NULL,
  summary       TEXT,
  outcome       interaction_outcome NOT NULL DEFAULT 'neutro',
  is_milestone  BOOLEAN NOT NULL DEFAULT false,
  conducted_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indice per fetch per cliente ordinata per data
CREATE INDEX IF NOT EXISTS idx_client_interactions_client_date
  ON public.client_interactions(client_id, date DESC);

-- RLS
ALTER TABLE public.client_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can do everything on client_interactions"
  ON public.client_interactions FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
