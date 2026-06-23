-- Aggiunge controlli admin ai canali chat
ALTER TABLE public.chat_channels
  ADD COLUMN IF NOT EXISTS is_archived  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_read_only BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS created_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS topic        TEXT,
  ADD COLUMN IF NOT EXISTS pinned_message_ids UUID[] DEFAULT '{}';

-- Aggiunge campo pin ai messaggi
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE;

-- Aggiorna type check per supportare customer_care
ALTER TABLE public.chat_channels
  DROP CONSTRAINT IF EXISTS chat_channels_type_check;
ALTER TABLE public.chat_channels
  ADD CONSTRAINT chat_channels_type_check
    CHECK (type IN ('cliente', 'interno', 'task', 'customer_care'));
