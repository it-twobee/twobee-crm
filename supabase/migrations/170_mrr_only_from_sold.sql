-- 170 — Una bozza non è un contratto: non deve riscrivere l'anagrafica.
--
-- Correzione della 169. Lì l'MRR passava a «derivato dai contratti» appena
-- esisteva una riga in `revenue_streams`, quale che fosse il suo stato. Ma una
-- riga appena creata nasce in bozza a 0 €: aprire l'economics e cominciare a
-- quotare azzerava il canone che il cliente sta pagando davvero, e il valore
-- storico d'anagrafica spariva senza che nessuno avesse deciso niente.
--
-- Successo davvero: Affinity - SofiA, 1.800 → 0 alla prima bozza (audit
-- 2026-08-01 10:37).
--
-- Regola nuova: il conteggio guarda solo i contratti **venduti** (status
-- diverso da 'bozza').
--
--   almeno un venduto  → mrr = somma dei canoni attivi, mrr_source='contratti'
--   nessun venduto, mrr_source='anagrafica' → non si tocca niente: si può
--                       quotare in pace, l'anagrafica resta quella che era
--   nessun venduto, mrr_source='contratti'  → il venduto è stato cancellato o
--                       riportato in bozza: il derivato non ha più fondamento,
--                       torna 0 e l'etichetta torna 'anagrafica'
--
-- Stessa cosa per le date: le calcola solo chi ha qualcosa di venduto.

CREATE OR REPLACE FUNCTION public.sync_client_mrr(p_client UUID)
RETURNS VOID AS $$
DECLARE
  v_sold  INT;
  v_open  INT;
  v_start DATE;
  v_end   DATE;
BEGIN
  IF p_client IS NULL THEN RETURN; END IF;

  SELECT count(*) INTO v_sold
  FROM public.revenue_streams
  WHERE client_id = p_client AND status <> 'bozza';

  IF v_sold = 0 THEN
    UPDATE public.clients
    SET mrr = 0, mrr_source = 'anagrafica'
    WHERE id = p_client AND mrr_source = 'contratti';
    RETURN;
  END IF;

  -- un canone senza fine è a tempo indeterminato: il contratto del cliente non
  -- ha una scadenza da mostrare, e mettere la data più lontana sarebbe falso
  SELECT
    min(s.start_date) FILTER (WHERE s.status <> 'bozza'),
    max(s.end_date)   FILTER (WHERE s.status <> 'bozza'),
    count(*) FILTER (WHERE s.status = 'attivo' AND s.billing = 'recurring' AND s.end_date IS NULL)
  INTO v_start, v_end, v_open
  FROM public.revenue_streams s WHERE s.client_id = p_client;

  UPDATE public.clients c
  SET mrr = COALESCE((
        SELECT sum(s.amount) FROM public.revenue_streams s
        WHERE s.client_id = p_client
          AND s.billing = 'recurring'
          AND s.status = 'attivo'
          AND (s.start_date IS NULL OR s.start_date <= CURRENT_DATE)
          AND (s.end_date IS NULL OR s.end_date >= CURRENT_DATE)
      ), 0),
      mrr_source = 'contratti',
      contract_start = COALESCE(v_start, c.contract_start),
      contract_end = CASE WHEN v_open > 0 THEN NULL ELSE COALESCE(v_end, c.contract_end) END
  WHERE c.id = p_client;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Riparazione del danno già fatto: il valore lo dice l'audit
-- (activity_log, diff {"mrr":{"old":1800,"new":0}}, 2026-08-01T10:37:17Z).
-- Guardata: tocca solo se il campo è ancora a zero e senza contratti venduti,
-- così rilanciarla dopo aver messo il contratto vero non rovina niente.
UPDATE public.clients
SET mrr = 1800, mrr_source = 'anagrafica'
WHERE company_name = 'Affinity - SofiA'
  AND mrr = 0
  AND NOT EXISTS (
    SELECT 1 FROM public.revenue_streams s
    WHERE s.client_id = clients.id AND s.status <> 'bozza'
  );

NOTIFY pgrst, 'reload schema';
