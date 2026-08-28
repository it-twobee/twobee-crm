-- Assistente AI agentico: conversazioni, audit dei tool e azioni in attesa di conferma.
--
-- Tre tabelle con tre scopi diversi:
--  · ai_conversations / ai_assistant_messages → la cronologia che l'utente rilegge (own-only)
--  · ai_tool_calls   → traccia di CHI ha chiesto cosa e quale tool è partito. Non è
--    telemetria opzionale: un agente che scrive sul DB deve lasciare una scia leggibile.
--  · ai_pending_actions → le azioni rischiose (elimina, riassegna, piano) parcheggiate
--    in attesa del click di conferma. RLS deny-all: gli argomenti NON tornano mai dal
--    client, altrimenti si manometterebbero nei devtools e la conferma non varrebbe nulla.

-- ─── Conversazioni ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  surface     TEXT NOT NULL DEFAULT 'dashboard' CHECK (surface IN ('dashboard','workspace')),
  title       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_profile
  ON public.ai_conversations(profile_id, updated_at DESC);

ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_conversations_own ON public.ai_conversations;
CREATE POLICY ai_conversations_own ON public.ai_conversations
  FOR ALL USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());

-- ─── Messaggi ────────────────────────────────────────────────────────────────
-- `tool_calls` conserva la struttura OpenAI-compatibile così il turno successivo
-- può essere ricostruito e rimandato al modello senza reinventarlo.
CREATE TABLE IF NOT EXISTS public.ai_assistant_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user','assistant','tool','system')),
  content         TEXT,
  tool_calls      JSONB,
  tool_call_id    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_assistant_messages_conv
  ON public.ai_assistant_messages(conversation_id, created_at);

ALTER TABLE public.ai_assistant_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_assistant_messages_own ON public.ai_assistant_messages;
CREATE POLICY ai_assistant_messages_own ON public.ai_assistant_messages
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.ai_conversations c
            WHERE c.id = conversation_id AND c.profile_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.ai_conversations c
            WHERE c.id = conversation_id AND c.profile_id = auth.uid())
  );

-- ─── Audit dei tool ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_tool_calls (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.ai_conversations(id) ON DELETE SET NULL,
  tool_name       TEXT NOT NULL,
  args            JSONB,
  mutating        BOOLEAN NOT NULL DEFAULT false,
  ok              BOOLEAN NOT NULL DEFAULT true,
  error           TEXT,
  latency_ms      INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_tool_calls_profile ON public.ai_tool_calls(profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_tool_calls_created ON public.ai_tool_calls(created_at DESC);

ALTER TABLE public.ai_tool_calls ENABLE ROW LEVEL SECURITY;

-- Ognuno rilegge le proprie chiamate; lo staff vede tutto (serve per capire un
-- comportamento anomalo dell'agente senza dover aprire il DB).
DROP POLICY IF EXISTS ai_tool_calls_read ON public.ai_tool_calls;
CREATE POLICY ai_tool_calls_read ON public.ai_tool_calls
  FOR SELECT USING (profile_id = auth.uid() OR public.is_staff());

-- ─── Azioni in attesa di conferma ────────────────────────────────────────────
-- Nessuna policy = nessun accesso via anon/authenticated. Solo il service role.
CREATE TABLE IF NOT EXISTS public.ai_pending_actions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  tool_name       TEXT NOT NULL,
  args            JSONB NOT NULL,
  summary         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '5 minutes',
  consumed_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ai_pending_profile ON public.ai_pending_actions(profile_id, created_at DESC);

ALTER TABLE public.ai_pending_actions ENABLE ROW LEVEL SECURITY;

-- ─── ai_logs: sapere chi ha speso i token ────────────────────────────────────
ALTER TABLE public.ai_logs ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_ai_logs_profile ON public.ai_logs(profile_id, created_at DESC);
