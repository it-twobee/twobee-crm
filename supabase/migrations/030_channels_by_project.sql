-- Collega i canali chat ai progetti
ALTER TABLE public.chat_channels
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_chat_channels_project ON public.chat_channels(project_id);

-- Funzione trigger: crea canali automatici alla creazione di un progetto
CREATE OR REPLACE FUNCTION public.create_project_channels()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  base_name TEXT;
  next_pos  INT;
BEGIN
  -- Slug dal nome progetto
  base_name := regexp_replace(lower(trim(NEW.name)), '[^a-z0-9]+', '-', 'g');
  base_name := regexp_replace(base_name, '^-+|-+$', '', 'g');
  IF base_name = '' THEN base_name := 'progetto'; END IF;

  -- Posizione dopo i canali esistenti del cliente
  SELECT COALESCE(MAX(position) + 1, 0) INTO next_pos
  FROM public.chat_channels WHERE client_id = NEW.client_id;

  -- Canale customer care (cliente ↔ team)
  INSERT INTO public.chat_channels
    (name, type, client_id, project_id, position, created_by, is_archived, is_read_only)
  VALUES
    ('cc-' || base_name, 'customer_care', NEW.client_id, NEW.id, next_pos, NEW.created_by, false, false);

  -- Canale chat interna del team
  INSERT INTO public.chat_channels
    (name, type, client_id, project_id, position, created_by, is_archived, is_read_only)
  VALUES
    ('team-' || base_name, 'cliente_interno', NEW.client_id, NEW.id, next_pos + 1, NEW.created_by, false, false);

  RETURN NEW;
END;
$$;

-- Attiva il trigger su ogni nuovo progetto
DROP TRIGGER IF EXISTS on_project_created ON public.projects;
CREATE TRIGGER on_project_created
  AFTER INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.create_project_channels();
