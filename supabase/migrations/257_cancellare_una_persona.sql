-- §420 — la cancellazione di una persona passa da due guardie che non la
-- conoscevano, e moriva lì.
--
-- La 256 ha reso slegabili `portal_materials.uploaded_by` e
-- `portal_events.actor_id`, e l'eliminazione di un membro continuava a fallire.
-- Due cause, tutte e due trovate solo provando davvero a cancellare — perché i
-- trigger colpevoli sono creati dentro un `DO ... EXECUTE format(...)`, e
-- cercandoli nel repository con gli occhi non si vedono.
--
-- **1) `portal_immutable`.** Sta su `portal_events` (e su altre quattro tabelle
-- di registro) e rifiuta *ogni* UPDATE. Ma `ON DELETE SET NULL` **è** un UPDATE:
-- quando la persona sparisce, la chiave esterna prova a svuotare `actor_id` e la
-- guardia alza le mani. Il registro resta immutabile per chi lo scrive; qui
-- impara l'unica modifica che non arriva da nessuno — un riferimento che si
-- svuota perché la riga puntata non c'è più.
--
-- L'eccezione è stretta di proposito: passa solo se **ogni** differenza fra la
-- riga vecchia e la nuova è una colonna di riferimento (`*_id`, `*_by`) che
-- diventa NULL. Un testo riscritto, una data spostata, un esito cambiato
-- continuano a essere rifiutati — che è tutto il motivo per cui quella guardia
-- esiste.
--
-- **2) `portal_log_event`** vuole `x-actor-id` e la server action scriveva col
-- service role: quella metà si risolve nel codice (`createActorClient`), non
-- qui. È scritta in `docs/cronologia.md` da sempre e non era stata applicata a
-- questa azione.
--
-- Rilanciabile.

BEGIN;

CREATE OR REPLACE FUNCTION public.portal_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  k        text;
  vecchio  jsonb;
  nuovo    jsonb;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    vecchio := to_jsonb(OLD);
    nuovo   := to_jsonb(NEW);
    FOR k IN SELECT jsonb_object_keys(vecchio) LOOP
      IF (vecchio -> k) IS DISTINCT FROM (nuovo -> k) THEN
        -- Ammessa una cosa sola: un riferimento a una riga che non c'è più.
        IF NOT (k LIKE '%\_id' OR k LIKE '%\_by')
          OR COALESCE(jsonb_typeof(nuovo -> k), 'assente') <> 'null'
          OR jsonb_typeof(vecchio -> k) = 'null' THEN
          RAISE EXCEPTION 'Il record di cronologia è immutabile';
        END IF;
      END IF;
    END LOOP;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Il record di cronologia è immutabile';
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- verifica: la guardia rifiuta ancora una modifica vera e lascia passare lo
-- slegamento. Gira dentro una transazione che si annulla da sé: non scrive
-- niente e non cancella niente.
DO $$
DECLARE
  v_id uuid;
  ok_rifiuto boolean := false;
  ok_slega   boolean := false;
BEGIN
  SELECT id INTO v_id FROM public.portal_events LIMIT 1;
  IF v_id IS NULL THEN
    RAISE NOTICE 'nessun evento del portale: niente da provare';
    RETURN;
  END IF;

  BEGIN
    UPDATE public.portal_events SET action = 'manomesso' WHERE id = v_id;
  EXCEPTION WHEN OTHERS THEN
    ok_rifiuto := true;
  END;

  BEGIN
    UPDATE public.portal_events SET actor_id = NULL WHERE id = v_id AND actor_id IS NOT NULL;
    ok_slega := true;
  EXCEPTION WHEN OTHERS THEN
    ok_slega := false;
  END;

  RAISE NOTICE 'rifiuta una modifica vera: %  ·  lascia slegare l''autore: %', ok_rifiuto, ok_slega;
  -- Niente resta scritto: la prova serve a sapere, non a cambiare.
  RAISE EXCEPTION 'prova finita, niente è stato scritto' USING ERRCODE = '40000';
EXCEPTION WHEN SQLSTATE '40000' THEN
  RAISE NOTICE 'verifica conclusa senza lasciare tracce';
END $$;
