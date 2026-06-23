-- Storico chat AI per reparto (persistente per utente)
CREATE TABLE IF NOT EXISTS public.dept_ai_chats (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  dept        TEXT        NOT NULL CHECK (dept IN ('growth','marketing','digital','ai')),
  title       TEXT,
  messages    JSONB       NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dept_ai_chats_user_dept ON public.dept_ai_chats(user_id, dept);

ALTER TABLE public.dept_ai_chats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own chats"
  ON public.dept_ai_chats FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
