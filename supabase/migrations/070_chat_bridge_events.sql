-- Chat bridge: eventi di condivisione client→internal
CREATE TABLE IF NOT EXISTS public.chat_bridge_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_message_id UUID NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  source_channel_id UUID NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  target_channel_id UUID NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  ai_summary     TEXT,
  handled_by     UUID REFERENCES public.profiles(id),
  handled_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_bridge_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_read_bridge"
  ON public.chat_bridge_events FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'team')));

CREATE POLICY "staff_manage_bridge"
  ON public.chat_bridge_events FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'team')));

CREATE INDEX idx_bridge_source ON public.chat_bridge_events(source_channel_id);
CREATE INDEX idx_bridge_target ON public.chat_bridge_events(target_channel_id);
CREATE INDEX idx_bridge_status ON public.chat_bridge_events(status) WHERE status = 'pending';
