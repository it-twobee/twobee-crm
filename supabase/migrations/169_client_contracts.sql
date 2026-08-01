-- 169 — Il contratto è del cliente; il progetto è dove si eroga.
--
-- La 165 aveva ancorato ogni contratto a un progetto. Regge per il lavoro
-- erogato, non per tutto: una quota partner, una consulenza a canone, un
-- retainer firmato prima che il progetto esista sono ricavi veri che non hanno
-- (ancora) un progetto. Ancorarli per forza obbligava a inventare un progetto
-- finto, o a lasciarli fuori dai conti.
--
-- Da qui: `project_id` torna facoltativo, il cliente è l'ancora. Un contratto
-- deve avere almeno uno dei due — un ricavo che non sa a chi appartiene non
-- serve a nessuno.
--
-- E i tre numeri d'anagrafica smettono di essere digitati a mano:
--   mrr             = somma dei canoni attivi oggi
--   contract_start  = il primo contratto venduto
--   contract_end    = l'ultimo a scadere (NULL se uno è a tempo indeterminato)
--   payment_status  = dedotto da rate e righe di conto economico
--
-- Restano colonne su `clients` — lista clienti, alert, risk score e portale
-- leggono quelle e continuano a funzionare senza toccarli — ma le scrive il
-- sistema. `mrr_source` dice quale delle due cose stai guardando: chi non ha
-- ancora contratti tiene il valore inserito a mano, e lo dichiara.

-- ── Il progetto diventa facoltativo ─────────────────────────────────────────
ALTER TABLE public.revenue_streams ALTER COLUMN project_id DROP NOT NULL;

ALTER TABLE public.revenue_streams DROP CONSTRAINT IF EXISTS revenue_streams_has_anchor;
ALTER TABLE public.revenue_streams ADD CONSTRAINT revenue_streams_has_anchor
  CHECK (project_id IS NOT NULL OR client_id IS NOT NULL);

-- il cliente si deduce dal progetto solo se un progetto c'è: senza, resta
-- quello scritto, altrimenti il contratto perderebbe la sua unica ancora
CREATE OR REPLACE FUNCTION public.revenue_streams_fill_client()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.project_id IS NOT NULL THEN
    SELECT p.client_id INTO NEW.client_id
    FROM public.projects p WHERE p.id = NEW.project_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_revenue_streams_fill_client ON public.revenue_streams;
CREATE TRIGGER trg_revenue_streams_fill_client
BEFORE INSERT OR UPDATE OF project_id ON public.revenue_streams
FOR EACH ROW EXECUTE FUNCTION public.revenue_streams_fill_client();

-- ── Anagrafica derivata dai contratti ───────────────────────────────────────
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS mrr_source TEXT NOT NULL DEFAULT 'anagrafica'
    CHECK (mrr_source IN ('contratti', 'anagrafica'));

-- Un canone a tempo indeterminato non ha una scadenza. Tenerla obbligatoria
-- costringeva a inventarne una, e l'alert «contratto in scadenza» suonava su
-- rapporti che non scadono affatto.
ALTER TABLE public.clients ALTER COLUMN contract_end DROP NOT NULL;

-- Chi non ha contratti tiene il numero scritto a mano: si migra un cliente per
-- volta senza azzerare l'anagrafica di chi non è ancora passato. Chi ne aveva e
-- li perde torna a zero — zero contratti attivi vuol dire zero canone, e
-- lasciare il vecchio numero racconterebbe una bugia.
CREATE OR REPLACE FUNCTION public.sync_client_mrr(p_client UUID)
RETURNS VOID AS $$
DECLARE
  v_n         INT;
  v_open      INT;
  v_start     DATE;
  v_end       DATE;
BEGIN
  IF p_client IS NULL THEN RETURN; END IF;

  SELECT count(*) INTO v_n FROM public.revenue_streams WHERE client_id = p_client;

  IF v_n = 0 THEN
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

-- ── Stato pagamenti dedotto ─────────────────────────────────────────────────
-- Le due fonti dicono cose diverse e servono entrambe: le rate sono il piano
-- concordato, le righe di conto economico sono i mesi registrati. Un mese
-- passato non incassato è «scaduto» comunque arrivi.
--
-- Senza né rate né righe non si deduce nulla e il valore a mano resta: meglio
-- un dato vecchio che un «pagato» inventato su un cliente appena inserito.
CREATE OR REPLACE FUNCTION public.sync_client_payment_status(p_client UUID)
RETURNS VOID AS $$
DECLARE
  v_month   DATE := date_trunc('month', CURRENT_DATE)::date;
  v_seen    INT := 0;
  v_late    INT := 0;
  v_open    INT := 0;
  v_s       INT;
  v_l       INT;
  v_o       INT;
BEGIN
  IF p_client IS NULL THEN RETURN; END IF;

  SELECT count(*),
         count(*) FILTER (WHERE NOT i.paid AND i.due_month < v_month),
         count(*) FILTER (WHERE NOT i.paid AND i.due_month >= v_month)
  INTO v_s, v_l, v_o
  FROM public.revenue_installments i
  JOIN public.revenue_streams s ON s.id = i.stream_id
  WHERE s.client_id = p_client AND s.status <> 'bozza';

  v_seen := v_seen + v_s; v_late := v_late + v_l; v_open := v_open + v_o;

  IF to_regclass('public.pl_revenue_lines') IS NOT NULL THEN
    SELECT count(*),
           count(*) FILTER (WHERE NOT r.paid AND m.month < v_month),
           count(*) FILTER (WHERE NOT r.paid AND m.month >= v_month)
    INTO v_s, v_l, v_o
    FROM public.pl_revenue_lines r
    JOIN public.pl_months m ON m.id = r.month_id
    WHERE r.client_id = p_client;

    v_seen := v_seen + v_s; v_late := v_late + v_l; v_open := v_open + v_o;
  END IF;

  IF v_seen = 0 THEN RETURN; END IF;

  UPDATE public.clients
  SET payment_status = CASE
        WHEN v_late > 0 THEN 'scaduto'
        WHEN v_open > 0 THEN 'in_attesa'
        ELSE 'pagato' END
  WHERE id = p_client;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Il tempo che passa cambia la risposta senza che nessuno scriva niente: un
-- mese aperto diventa scaduto da solo. Per questo c'è anche il giro notturno.
CREATE OR REPLACE FUNCTION public.sync_all_client_payment_status()
RETURNS INT AS $$
DECLARE v_id UUID; v_n INT := 0;
BEGIN
  FOR v_id IN SELECT id FROM public.clients LOOP
    PERFORM public.sync_client_payment_status(v_id);
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Trigger: ogni scrittura economica riallinea l'anagrafica ────────────────
CREATE OR REPLACE FUNCTION public.revenue_streams_sync_mrr()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.sync_client_mrr(OLD.client_id);
    PERFORM public.sync_client_payment_status(OLD.client_id);
    RETURN OLD;
  END IF;

  PERFORM public.sync_client_mrr(NEW.client_id);
  PERFORM public.sync_client_payment_status(NEW.client_id);

  IF TG_OP = 'UPDATE' AND NEW.client_id IS DISTINCT FROM OLD.client_id THEN
    PERFORM public.sync_client_mrr(OLD.client_id);
    PERFORM public.sync_client_payment_status(OLD.client_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.revenue_installments_sync_client()
RETURNS TRIGGER AS $$
DECLARE v_client UUID;
BEGIN
  SELECT s.client_id INTO v_client FROM public.revenue_streams s
  WHERE s.id = CASE WHEN TG_OP = 'DELETE' THEN OLD.stream_id ELSE NEW.stream_id END;
  PERFORM public.sync_client_payment_status(v_client);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_revenue_inst_sync_client ON public.revenue_installments;
CREATE TRIGGER trg_revenue_inst_sync_client
AFTER INSERT OR UPDATE OR DELETE ON public.revenue_installments
FOR EACH ROW EXECUTE FUNCTION public.revenue_installments_sync_client();

CREATE OR REPLACE FUNCTION public.pl_revenue_sync_client()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.sync_client_payment_status(OLD.client_id);
    RETURN OLD;
  END IF;
  PERFORM public.sync_client_payment_status(NEW.client_id);
  IF TG_OP = 'UPDATE' AND NEW.client_id IS DISTINCT FROM OLD.client_id THEN
    PERFORM public.sync_client_payment_status(OLD.client_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- guardato: chi non ha ancora il conto economico (163) non deve inciampare qui
DO $$
BEGIN
  IF to_regclass('public.pl_revenue_lines') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_pl_revenue_sync_client ON public.pl_revenue_lines;
    CREATE TRIGGER trg_pl_revenue_sync_client
    AFTER INSERT OR UPDATE OR DELETE ON public.pl_revenue_lines
    FOR EACH ROW EXECUTE FUNCTION public.pl_revenue_sync_client();
  END IF;
END $$;

-- giro notturno: guardato, se pg_cron non c'è si ignora
DO $$
BEGIN
  PERFORM cron.schedule('sync-client-payment-status', '20 3 * * *',
    $cron$ SELECT public.sync_all_client_payment_status(); $cron$);
EXCEPTION WHEN undefined_table OR undefined_function OR invalid_schema_name THEN
  RAISE NOTICE 'pg_cron non disponibile: lo stato pagamenti si riallinea a ogni scrittura';
END $$;

-- ── Allineamento iniziale ───────────────────────────────────────────────────
DO $$
DECLARE v_id UUID;
BEGIN
  FOR v_id IN SELECT id FROM public.clients LOOP
    PERFORM public.sync_client_mrr(v_id);
    PERFORM public.sync_client_payment_status(v_id);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
