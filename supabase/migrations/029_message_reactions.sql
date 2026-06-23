-- Reactions ai messaggi chat
CREATE TABLE IF NOT EXISTS public.message_reactions (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id  UUID NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  profile_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji       TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT message_reactions_unique UNIQUE (message_id, profile_id, emoji)
);

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

-- Tutti i membri autenticati possono leggere le reactions
CREATE POLICY "reactions_select" ON public.message_reactions
  FOR SELECT TO authenticated USING (true);

-- Ognuno può aggiungere le proprie reactions
CREATE POLICY "reactions_insert" ON public.message_reactions
  FOR INSERT TO authenticated WITH CHECK (profile_id = auth.uid());

-- Ognuno può eliminare solo le proprie reactions
CREATE POLICY "reactions_delete" ON public.message_reactions
  FOR DELETE TO authenticated USING (profile_id = auth.uid());

-- Indice per performance
CREATE INDEX IF NOT EXISTS idx_message_reactions_message ON public.message_reactions(message_id);
