-- Aggiunge tipo 'cliente_interno': canale interno per cliente (solo team + sub)
ALTER TABLE public.chat_channels
  DROP CONSTRAINT IF EXISTS chat_channels_type_check;
ALTER TABLE public.chat_channels
  ADD CONSTRAINT chat_channels_type_check
    CHECK (type IN ('cliente', 'interno', 'task', 'customer_care', 'cliente_interno'));
