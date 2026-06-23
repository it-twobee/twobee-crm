-- Trigger: quando client_label diventa 'perso', archivia tutti i canali
CREATE OR REPLACE FUNCTION archive_channels_on_perso()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.client_label = 'perso' AND (OLD.client_label IS DISTINCT FROM 'perso') THEN
    UPDATE public.chat_channels
    SET is_archived = true, is_read_only = true
    WHERE client_id = NEW.id;
  END IF;
  -- Se il cliente torna attivo, riattiva i canali
  IF OLD.client_label = 'perso' AND NEW.client_label != 'perso' THEN
    UPDATE public.chat_channels
    SET is_archived = false, is_read_only = false
    WHERE client_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_archive_channels_on_perso ON public.clients;
CREATE TRIGGER trg_archive_channels_on_perso
  AFTER UPDATE OF client_label ON public.clients
  FOR EACH ROW EXECUTE FUNCTION archive_channels_on_perso();
