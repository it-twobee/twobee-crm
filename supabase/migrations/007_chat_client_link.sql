-- Collega canali chat ai clienti
ALTER TABLE public.chat_channels
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS chat_channels_client_id_idx ON public.chat_channels(client_id);
