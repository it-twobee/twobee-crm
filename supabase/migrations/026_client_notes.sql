-- Note interne per cliente, visibili a tutto il team TwoBee
CREATE TABLE public.client_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  author_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.client_notes ENABLE ROW LEVEL SECURITY;

-- Tutto il team autenticato può leggere le note
CREATE POLICY "client_notes_view" ON public.client_notes
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "client_notes_insert" ON public.client_notes
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND author_id = auth.uid());

-- Solo l'autore può modificare o cancellare la propria nota
CREATE POLICY "client_notes_update" ON public.client_notes
  FOR UPDATE USING (author_id = auth.uid());

CREATE POLICY "client_notes_delete" ON public.client_notes
  FOR DELETE USING (author_id = auth.uid());

-- Trigger aggiorna updated_at
CREATE OR REPLACE FUNCTION update_client_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_client_notes_updated_at
  BEFORE UPDATE ON public.client_notes
  FOR EACH ROW EXECUTE FUNCTION update_client_notes_updated_at();
