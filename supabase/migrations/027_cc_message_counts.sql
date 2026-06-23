-- Totale messaggi per canale CC per cliente
CREATE OR REPLACE FUNCTION get_cc_message_counts(p_client_ids UUID[])
RETURNS TABLE(channel_id UUID, count BIGINT) AS $$
  SELECT cm.id AS channel_id, COUNT(msg.id) AS count
  FROM public.chat_channels cm
  LEFT JOIN public.chat_messages msg ON msg.channel_id = cm.id AND msg.is_deleted = false
  WHERE cm.client_id = ANY(p_client_ids)
    AND cm.type = 'customer_care'
  GROUP BY cm.id;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Messaggi ultimi 7 giorni per indicatore velocità
CREATE OR REPLACE FUNCTION get_cc_recent_message_counts(p_client_ids UUID[])
RETURNS TABLE(channel_id UUID, count BIGINT) AS $$
  SELECT cm.id AS channel_id, COUNT(msg.id) AS count
  FROM public.chat_channels cm
  LEFT JOIN public.chat_messages msg
    ON msg.channel_id = cm.id
   AND msg.is_deleted = false
   AND msg.created_at > NOW() - INTERVAL '7 days'
  WHERE cm.client_id = ANY(p_client_ids)
    AND cm.type = 'customer_care'
  GROUP BY cm.id;
$$ LANGUAGE sql STABLE SECURITY DEFINER;
