-- last_message_at su chat_channels per sort per ultima interazione
ALTER TABLE public.chat_channels
  ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ;

-- Valori iniziali
UPDATE public.chat_channels cc
SET last_message_at = (
  SELECT MAX(created_at)
  FROM public.chat_messages
  WHERE channel_id = cc.id AND is_deleted = false
);

-- Trigger: aggiorna last_message_at ad ogni nuovo messaggio
CREATE OR REPLACE FUNCTION update_channel_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.chat_channels
  SET last_message_at = NEW.created_at
  WHERE id = NEW.channel_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_channel_last_message ON public.chat_messages;
CREATE TRIGGER trg_update_channel_last_message
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION update_channel_last_message();

-- RPC: conta messaggi non letti per utente
CREATE OR REPLACE FUNCTION get_unread_counts(p_user_id UUID)
RETURNS TABLE(channel_id UUID, unread_count BIGINT) AS $$
  SELECT
    cm.channel_id,
    COUNT(m.id)::BIGINT AS unread_count
  FROM public.channel_members cm
  LEFT JOIN public.chat_messages m ON
    m.channel_id = cm.channel_id AND
    m.created_at > COALESCE(cm.last_read_at, '1970-01-01'::TIMESTAMPTZ) AND
    m.is_deleted = false AND
    m.sender_id != p_user_id
  WHERE cm.profile_id = p_user_id
  GROUP BY cm.channel_id;
$$ LANGUAGE sql SECURITY DEFINER;
