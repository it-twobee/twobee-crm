-- ═══════════════════════════════════════════════════════════════
-- AI RISK ENGINE — Motore predittivo di rischio cliente
-- Calcola automaticamente un risk_score 0–100 per ogni cliente
-- ad ogni modifica di: clients, client_kpis, invoices, tickets
-- ═══════════════════════════════════════════════════════════════

-- 1. Aggiungi colonne alla tabella clients
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS risk_score        SMALLINT DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS risk_factors      JSONB    DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS risk_updated_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS risk_trend        TEXT     DEFAULT 'stabile' CHECK (risk_trend IN ('migliora','stabile','peggiora')),
  ADD COLUMN IF NOT EXISTS prev_risk_score   SMALLINT DEFAULT 0;

-- Indice per query rapide (dashboard "clienti ad alto rischio")
CREATE INDEX IF NOT EXISTS clients_risk_score_idx ON public.clients (risk_score DESC);

-- ═══════════════════════════════════════════════════════════════
-- 2. FUNZIONE PRINCIPALE DI SCORING
--    Algoritmo deterministico su segnali multipli → risk_score
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.compute_client_risk(p_client_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_client          RECORD;
  v_score           INT := 0;
  v_factors         JSONB := '{}';

  -- KPI signals
  v_last_kpi_date   DATE;
  v_kpi_trend       NUMERIC;   -- slope (revenue_attributed last 3 months)
  v_kpi_count       INT;

  -- Invoice signals
  v_late_invoices   INT;
  v_unpaid_total    NUMERIC;
  v_last_paid_days  INT;

  -- Ticket signals
  v_open_tickets    INT;
  v_urgent_tickets  INT;

  -- Contract signals
  v_days_to_end     INT;

  -- Trend
  v_prev_score      SMALLINT;
  v_trend           TEXT;
BEGIN
  -- Carica cliente
  SELECT * INTO v_client FROM public.clients WHERE id = p_client_id;
  IF NOT FOUND THEN RETURN; END IF;

  v_prev_score := COALESCE(v_client.risk_score, 0);

  -- ─────────────────────────────────────────────────────────────
  -- A. SEGNALE: Stato pagamenti (+0–30)
  -- ─────────────────────────────────────────────────────────────
  SELECT
    COUNT(*) FILTER (WHERE status = 'in_ritardo'),
    COALESCE(SUM(amount) FILTER (WHERE status IN ('da_inviare','inviata','in_ritardo')), 0)
  INTO v_late_invoices, v_unpaid_total
  FROM public.invoices
  WHERE client_id = p_client_id;

  IF v_late_invoices >= 3 THEN
    v_score := v_score + 30;
    v_factors := v_factors || jsonb_build_object('pagamenti', jsonb_build_object('score', 30, 'msg', v_late_invoices || ' fatture in ritardo'));
  ELSIF v_late_invoices >= 2 THEN
    v_score := v_score + 20;
    v_factors := v_factors || jsonb_build_object('pagamenti', jsonb_build_object('score', 20, 'msg', '2 fatture in ritardo'));
  ELSIF v_late_invoices = 1 THEN
    v_score := v_score + 10;
    v_factors := v_factors || jsonb_build_object('pagamenti', jsonb_build_object('score', 10, 'msg', '1 fattura in ritardo'));
  ELSIF v_client.payment_status = 'scaduto' THEN
    v_score := v_score + 15;
    v_factors := v_factors || jsonb_build_object('pagamenti', jsonb_build_object('score', 15, 'msg', 'pagamento scaduto'));
  END IF;

  -- ─────────────────────────────────────────────────────────────
  -- B. SEGNALE: Trend KPI (ultimi 3 mesi) (+0–20)
  -- ─────────────────────────────────────────────────────────────
  SELECT
    COUNT(*),
    MAX(month)
  INTO v_kpi_count, v_last_kpi_date
  FROM public.client_kpis
  WHERE client_id = p_client_id;

  -- Calcola trend: confronto media ultimi 2 mesi vs 2 mesi prima
  SELECT
    COALESCE(AVG(revenue_attributed) FILTER (WHERE month >= DATE_TRUNC('month', NOW() - INTERVAL '2 months')::date), 0)
    - COALESCE(AVG(revenue_attributed) FILTER (WHERE month < DATE_TRUNC('month', NOW() - INTERVAL '2 months')::date AND month >= DATE_TRUNC('month', NOW() - INTERVAL '4 months')::date), 0)
  INTO v_kpi_trend
  FROM public.client_kpis
  WHERE client_id = p_client_id
    AND month >= DATE_TRUNC('month', NOW() - INTERVAL '4 months')::date;

  IF v_kpi_count = 0 OR v_last_kpi_date < (NOW() - INTERVAL '60 days')::date THEN
    v_score := v_score + 15;
    v_factors := v_factors || jsonb_build_object('kpi', jsonb_build_object('score', 15, 'msg', 'nessun KPI aggiornato recentemente'));
  ELSIF v_kpi_trend < -0.1 THEN
    -- Revenue in calo
    v_score := v_score + 20;
    v_factors := v_factors || jsonb_build_object('kpi', jsonb_build_object('score', 20, 'msg', 'revenue in calo negli ultimi mesi'));
  ELSIF v_kpi_trend < 0 THEN
    v_score := v_score + 8;
    v_factors := v_factors || jsonb_build_object('kpi', jsonb_build_object('score', 8, 'msg', 'leggero calo KPI'));
  ELSIF v_kpi_trend > 0 THEN
    -- Trend positivo: bonus negativo (riduce rischio)
    v_score := GREATEST(0, v_score - 5);
    v_factors := v_factors || jsonb_build_object('kpi', jsonb_build_object('score', -5, 'msg', 'KPI in miglioramento'));
  END IF;

  -- ─────────────────────────────────────────────────────────────
  -- C. SEGNALE: Ticket aperti (+0–20)
  -- ─────────────────────────────────────────────────────────────
  DO $inner$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tickets') THEN
      SELECT
        COUNT(*) FILTER (WHERE status IN ('aperto','in_lavorazione')),
        COUNT(*) FILTER (WHERE status IN ('aperto','in_lavorazione') AND priority = 'urgente')
      INTO v_open_tickets, v_urgent_tickets
      FROM public.tickets
      WHERE client_id = p_client_id;
    END IF;
  END $inner$;

  IF v_urgent_tickets > 0 THEN
    v_score := v_score + 15 + (v_urgent_tickets * 3);
    v_factors := v_factors || jsonb_build_object('ticket', jsonb_build_object('score', 15, 'msg', v_urgent_tickets || ' ticket urgenti aperti'));
  ELSIF v_open_tickets >= 3 THEN
    v_score := v_score + 10;
    v_factors := v_factors || jsonb_build_object('ticket', jsonb_build_object('score', 10, 'msg', v_open_tickets || ' ticket aperti'));
  END IF;

  -- ─────────────────────────────────────────────────────────────
  -- D. SEGNALE: Scadenza contratto (+0–15)
  -- ─────────────────────────────────────────────────────────────
  v_days_to_end := (v_client.contract_end::date - NOW()::date);

  IF v_days_to_end < 0 THEN
    v_score := v_score + 20;
    v_factors := v_factors || jsonb_build_object('contratto', jsonb_build_object('score', 20, 'msg', 'contratto scaduto'));
  ELSIF v_days_to_end < 15 THEN
    v_score := v_score + 15;
    v_factors := v_factors || jsonb_build_object('contratto', jsonb_build_object('score', 15, 'msg', 'contratto scade in ' || v_days_to_end || ' giorni'));
  ELSIF v_days_to_end < 30 THEN
    v_score := v_score + 8;
    v_factors := v_factors || jsonb_build_object('contratto', jsonb_build_object('score', 8, 'msg', 'contratto scade in ' || v_days_to_end || ' giorni'));
  ELSIF v_days_to_end < 60 THEN
    v_score := v_score + 4;
  END IF;

  -- ─────────────────────────────────────────────────────────────
  -- E. SEGNALE: Stato operativo del cliente (+0–15)
  -- ─────────────────────────────────────────────────────────────
  IF v_client.status = 'rosso' THEN
    v_score := v_score + 15;
    v_factors := v_factors || jsonb_build_object('stato', jsonb_build_object('score', 15, 'msg', 'stato operativo rosso'));
  ELSIF v_client.status = 'giallo' THEN
    v_score := v_score + 5;
    v_factors := v_factors || jsonb_build_object('stato', jsonb_build_object('score', 5, 'msg', 'stato operativo giallo'));
  END IF;

  -- ─────────────────────────────────────────────────────────────
  -- F. SEGNALE: Label corrente (+0, già riflessa dal sistema)
  -- Penalizza "in_bilico" se già segnalato manualmente
  -- ─────────────────────────────────────────────────────────────
  IF v_client.client_label = 'in_bilico' THEN
    v_score := v_score + 5;
  ELSIF v_client.client_label = 'partner' THEN
    -- Partner consolidato: riduce rischio
    v_score := GREATEST(0, v_score - 10);
  END IF;

  -- ─────────────────────────────────────────────────────────────
  -- Clamp 0–100
  -- ─────────────────────────────────────────────────────────────
  v_score := LEAST(100, GREATEST(0, v_score));

  -- ─────────────────────────────────────────────────────────────
  -- Calcola trend (rispetto al punteggio precedente)
  -- ─────────────────────────────────────────────────────────────
  IF v_score < v_prev_score - 5 THEN
    v_trend := 'migliora';
  ELSIF v_score > v_prev_score + 5 THEN
    v_trend := 'peggiora';
  ELSE
    v_trend := 'stabile';
  END IF;

  -- ─────────────────────────────────────────────────────────────
  -- Aggiorna il cliente
  -- ─────────────────────────────────────────────────────────────
  UPDATE public.clients SET
    prev_risk_score  = v_prev_score,
    risk_score       = v_score,
    risk_factors     = v_factors,
    risk_trend       = v_trend,
    risk_updated_at  = NOW()
  WHERE id = p_client_id;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- 3. TRIGGER WRAPPER — Richiama compute_client_risk
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.trigger_update_risk()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_client_id UUID;
BEGIN
  -- Ricava client_id in base alla tabella sorgente
  IF TG_TABLE_NAME = 'clients' THEN
    v_client_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
  ELSIF TG_TABLE_NAME IN ('client_kpis', 'invoices') THEN
    v_client_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.client_id ELSE NEW.client_id END;
  ELSIF TG_TABLE_NAME = 'tickets' THEN
    v_client_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.client_id ELSE NEW.client_id END;
    -- Solo se ha client_id (alcuni ticket potrebbero non averlo)
    IF v_client_id IS NULL THEN
      IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;
  END IF;

  -- Esegui calcolo in modo asincrono-safe (non blocca la transazione)
  PERFORM public.compute_client_risk(v_client_id);

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

-- ─── Trigger su clients ─────────────────────────────────────
DROP TRIGGER IF EXISTS trg_risk_clients ON public.clients;
CREATE TRIGGER trg_risk_clients
  AFTER INSERT OR UPDATE OF status, client_label, payment_status, mrr, contract_end ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.trigger_update_risk();

-- ─── Trigger su client_kpis ─────────────────────────────────
DROP TRIGGER IF EXISTS trg_risk_kpis ON public.client_kpis;
CREATE TRIGGER trg_risk_kpis
  AFTER INSERT OR UPDATE OR DELETE ON public.client_kpis
  FOR EACH ROW EXECUTE FUNCTION public.trigger_update_risk();

-- ─── Trigger su invoices ────────────────────────────────────
DROP TRIGGER IF EXISTS trg_risk_invoices ON public.invoices;
CREATE TRIGGER trg_risk_invoices
  AFTER INSERT OR UPDATE OF status, amount ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.trigger_update_risk();

-- ─── Trigger su tickets (opzionale, se esiste) ──────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tickets') THEN
    EXECUTE '
      DROP TRIGGER IF EXISTS trg_risk_tickets ON public.tickets;
      CREATE TRIGGER trg_risk_tickets
        AFTER INSERT OR UPDATE OF status, priority OR DELETE ON public.tickets
        FOR EACH ROW EXECUTE FUNCTION public.trigger_update_risk()
    ';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- 4. BATCH INIZIALE — calcola score per tutti i clienti esistenti
-- ═══════════════════════════════════════════════════════════════
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN SELECT id FROM public.clients LOOP
    PERFORM public.compute_client_risk(c.id);
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- 5. VIEW UTILE — clienti ordinati per rischio con breakdown
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.clients_risk_ranked AS
SELECT
  id, company_name, client_label, client_type, mrr,
  risk_score, risk_trend, risk_factors, risk_updated_at,
  CASE
    WHEN risk_score >= 60 THEN 'alto'
    WHEN risk_score >= 35 THEN 'medio'
    ELSE 'basso'
  END AS risk_level
FROM public.clients
WHERE client_label != 'perso'
ORDER BY risk_score DESC;
