-- 178 — Growth o digital non si sceglie: lo dicono i progetti.
--
-- `clients.client_type` era un'etichetta scritta a mano in anagrafica, quindi
-- poteva dire «growth» su un cliente che da mesi compra solo lavori digital.
-- Da qui è una conseguenza:
--
--   solo progetti digital            → digital
--   solo progetti growth (o marketing) → growth
--   sia gli uni che gli altri        → growth_digital
--
-- Le aree in `projects` sono tre: marketing, growth, digital. Ai fini del
-- cliente marketing sta con growth — è l'altra faccia dello stesso lavoro, e
-- la distinzione che conta nel piano compensi è digital contro il resto.
--
-- Contano i progetti non eliminati, in qualunque stato: un lavoro concluso
-- dice cos'è quel cliente esattamente come uno in corso.
--
-- Chi non ha progetti tiene il valore inserito alla creazione: è l'unico
-- momento in cui la scelta a mano ha senso, perché non c'è ancora niente da
-- cui dedurre.

CREATE OR REPLACE FUNCTION public.sync_client_type(p_client UUID)
RETURNS VOID AS $$
DECLARE
  v_digital INT;
  v_other   INT;
BEGIN
  IF p_client IS NULL THEN RETURN; END IF;

  SELECT
    count(*) FILTER (WHERE p.area = 'digital'),
    count(*) FILTER (WHERE p.area <> 'digital')
  INTO v_digital, v_other
  FROM public.projects p
  WHERE p.client_id = p_client AND p.deleted_at IS NULL;

  -- nessun progetto: non c'è niente da dedurre, resta quello che c'è
  IF v_digital + v_other = 0 THEN RETURN; END IF;

  UPDATE public.clients
  SET client_type = CASE
        WHEN v_digital > 0 AND v_other > 0 THEN 'growth_digital'
        WHEN v_digital > 0 THEN 'digital'
        ELSE 'growth' END
  WHERE id = p_client;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

/* Ogni movimento su un progetto può cambiare il tipo del cliente: crearne uno
   digital su un cliente growth lo rende growth+digital, eliminarlo lo riporta
   indietro. Anche lo spostamento fra clienti conta, e per questo si riallinea
   il vecchio proprietario. */
CREATE OR REPLACE FUNCTION public.projects_sync_client_type()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.sync_client_type(OLD.client_id);
    RETURN OLD;
  END IF;

  PERFORM public.sync_client_type(NEW.client_id);
  IF TG_OP = 'UPDATE' AND NEW.client_id IS DISTINCT FROM OLD.client_id THEN
    PERFORM public.sync_client_type(OLD.client_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_projects_sync_client_type ON public.projects;
CREATE TRIGGER trg_projects_sync_client_type
AFTER INSERT OR UPDATE OF area, client_id, deleted_at OR DELETE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.projects_sync_client_type();

-- allineamento iniziale
DO $$
DECLARE v_id UUID;
BEGIN
  FOR v_id IN SELECT id FROM public.clients LOOP
    PERFORM public.sync_client_type(v_id);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
