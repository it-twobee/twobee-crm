-- 177 — Pagato, da pagare, non pagato: la regola vera.
--
-- La 169 deduceva lo stato pagamenti da «c'è qualcosa di non incassato», che
-- non distingue il cliente in ritardo da quello che ha semplicemente ricevuto
-- la fattura ieri. Serve la regola di casa:
--
--   La fattura esce il primo giorno utile del mese e vale **15 giorni**.
--
--   pagato       tutte le righe del mese risultano incassate
--   da pagare    ci sono righe scoperte ma siamo entro il 15: è normale,
--                non è un ritardo e non deve accendere niente
--   non pagato   dal 16 in poi una riga del mese è ancora scoperta, oppure
--                resta scoperto un mese passato
--
-- Su più progetti vale la riga più indietro: se un cliente ne paga uno e non
-- l'altro, dentro i 15 giorni resta «da pagare» — il dettaglio di quale
-- progetto manca si legge nella sezione clienti, dove è azionabile.
--
-- I valori in colonna restano i tre di sempre (`pagato`/`in_attesa`/`scaduto`)
-- perché mezza app li legge: cambia cosa significano e come si scrivono.
-- `in_attesa` = da pagare, `scaduto` = non pagato.
--
-- Nota sul 16: si guarda solo `paid`, non `invoice_sent`. La regola dice che
-- la fattura parte il primo giorno del mese; se non è partita è un problema
-- nostro, e va risolto emettendola, non spostando la scadenza del cliente.
--
-- Il passaggio dal 15 al 16 non lo scrive nessuno: lo fa il giro notturno
-- `sync-client-payment-status` della 169. Senza pg_cron lo stato si aggiorna
-- comunque alla prima scrittura sulle righe del mese.

CREATE OR REPLACE FUNCTION public.sync_client_payment_status(p_client UUID)
RETURNS VOID AS $$
DECLARE
  v_month  DATE := date_trunc('month', CURRENT_DATE)::date;
  -- il giorno di oggi nel mese: da 16 in poi il credito è scaduto
  v_late   BOOLEAN := EXTRACT(DAY FROM CURRENT_DATE) > 15;
  v_seen   INT := 0;   -- righe su cui si può dedurre qualcosa
  v_past   INT := 0;   -- scoperte di mesi già chiusi
  v_now    INT := 0;   -- scoperte del mese in corso
  v_s INT; v_p INT; v_n INT;
BEGIN
  IF p_client IS NULL THEN RETURN; END IF;

  -- rate dei contratti: il piano concordato
  SELECT count(*),
         count(*) FILTER (WHERE NOT i.paid AND i.due_month < v_month),
         count(*) FILTER (WHERE NOT i.paid AND i.due_month = v_month)
  INTO v_s, v_p, v_n
  FROM public.revenue_installments i
  JOIN public.revenue_streams s ON s.id = i.stream_id
  WHERE s.client_id = p_client AND s.status <> 'bozza';

  v_seen := v_seen + v_s; v_past := v_past + v_p; v_now := v_now + v_n;

  -- righe di conto economico: i mesi registrati, progetto per progetto
  IF to_regclass('public.pl_revenue_lines') IS NOT NULL THEN
    SELECT count(*),
           count(*) FILTER (WHERE NOT r.paid AND m.month < v_month),
           count(*) FILTER (WHERE NOT r.paid AND m.month = v_month)
    INTO v_s, v_p, v_n
    FROM public.pl_revenue_lines r
    JOIN public.pl_months m ON m.id = r.month_id
    WHERE r.client_id = p_client AND m.month <= v_month;

    v_seen := v_seen + v_s; v_past := v_past + v_p; v_now := v_now + v_n;
  END IF;

  -- niente da cui dedurre: resta quello che c'è, non si inventa un «pagato»
  IF v_seen = 0 THEN RETURN; END IF;

  UPDATE public.clients
  SET payment_status = CASE
        -- un mese passato scoperto è scaduto e basta, il giorno non conta
        WHEN v_past > 0 THEN 'scaduto'
        WHEN v_now > 0 AND v_late THEN 'scaduto'
        WHEN v_now > 0 THEN 'in_attesa'
        ELSE 'pagato' END
  WHERE id = p_client;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- riallineamento immediato: la regola nuova cambia lo stato di chi era
-- «scaduto» solo perché il mese in corso non era ancora incassato
SELECT public.sync_all_client_payment_status() AS clienti_riallineati;

NOTIFY pgrst, 'reload schema';
