-- FASE 1b — `revenue_streams`: l'accordo economico diventa un'entità.
-- Additiva + idempotente.
--
-- PERCHÉ NON BASTAVA `clients.mrr` NÉ UN CAMPO SU `projects`:
--   • `clients.mrr` è un numero scritto a mano, senza date, senza linea di
--     servizio, senza storicità: un contratto chiuso resta a bilancio finché
--     qualcuno non azzera la cella (in produzione: 2 casi su 9).
--   • Il ricavo non può stare su `projects` perché TUTTI i canoni Growth attivi
--     esistono senza progetto associato, e un progetto Digital può avere ricavo
--     misto (una tantum + manutenzione ricorrente).
--
-- Da qui in avanti `clients.mrr` è DERIVATO (trigger sotto) e va reso read-only
-- in UI (NewClientModal, AnagraficaTab), altrimenti la divergenza si riapre.

-- NB: niente allineamento a spazi multipli. Il SQL Editor di Supabase ha
-- troncato due volte incolli con padding (25 caratteri persi a colpo).
CREATE TABLE IF NOT EXISTS public.revenue_streams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  quote_id UUID REFERENCES public.quotes(id) ON DELETE SET NULL,
  label TEXT NOT NULL,
  service_line TEXT NOT NULL
    CHECK (service_line IN ('growth','digital','ai','hybrid','consulting','other')),
  revenue_model TEXT NOT NULL
    CHECK (revenue_model IN ('recurring','one_off','milestone_based','maintenance','usage_based','non_billable')),
  -- Importo PER PERIODO se ricorrente, TOTALE se una tantum. Sempre IMPONIBILE.
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EUR',
  billing_frequency TEXT
    CHECK (billing_frequency IN ('mensile','bimestrale','trimestrale','semestrale','annuale','una_tantum')),
  start_date DATE NOT NULL,
  end_date DATE,
  competence_start DATE,
  competence_end DATE,
  status TEXT NOT NULL DEFAULT 'attivo'
    CHECK (status IN ('bozza','attivo','sospeso','cessato')),
  payment_terms TEXT,
  source TEXT NOT NULL DEFAULT 'manuale',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT rs_dates_coherent
    CHECK (end_date IS NULL OR end_date >= start_date),
  -- Un ricorrente senza frequenza non è normalizzabile a mese.
  CONSTRAINT rs_recurring_needs_frequency
    CHECK (revenue_model NOT IN ('recurring','maintenance')
           OR (billing_frequency IS NOT NULL AND billing_frequency <> 'una_tantum'))
);

CREATE INDEX IF NOT EXISTS idx_rs_client ON public.revenue_streams(client_id);
CREATE INDEX IF NOT EXISTS idx_rs_project ON public.revenue_streams(project_id);
CREATE INDEX IF NOT EXISTS idx_rs_quote ON public.revenue_streams(quote_id);
CREATE INDEX IF NOT EXISTS idx_rs_lookup ON public.revenue_streams(status, service_line, revenue_model);

CREATE OR REPLACE FUNCTION public.set_rs_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS rs_updated_at ON public.revenue_streams;
CREATE TRIGGER rs_updated_at BEFORE UPDATE ON public.revenue_streams
  FOR EACH ROW EXECUTE FUNCTION public.set_rs_updated_at();

ALTER TABLE public.revenue_streams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rs_admin" ON public.revenue_streams;
CREATE POLICY "rs_admin" ON public.revenue_streams
  FOR ALL USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- ─── Normalizzazione a mese ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rs_monthly_amount(p_amount NUMERIC, p_freq TEXT)
RETURNS NUMERIC LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_freq
    WHEN 'mensile'     THEN p_amount
    WHEN 'bimestrale'  THEN p_amount / 2
    WHEN 'trimestrale' THEN p_amount / 3
    WHEN 'semestrale'  THEN p_amount / 6
    WHEN 'annuale'     THEN p_amount / 12
    ELSE 0
  END;
$$;

-- MRR di un cliente = somma degli stream ricorrenti ATTIVI e in corso di validità.
-- `sospeso` NON conta (decisione: uno stream sospeso non fattura).
CREATE OR REPLACE FUNCTION public.client_mrr(p_client_id UUID)
RETURNS NUMERIC LANGUAGE sql STABLE AS $$
  SELECT COALESCE(SUM(public.rs_monthly_amount(amount, billing_frequency)), 0)
  FROM public.revenue_streams
  WHERE client_id = p_client_id
    AND status = 'attivo'
    AND revenue_model IN ('recurring','maintenance')
    AND start_date <= CURRENT_DATE
    AND (end_date IS NULL OR end_date >= CURRENT_DATE);
$$;

-- ─── `clients.mrr` come cache derivata ───────────────────────────────────────
-- Il campo resta (letto in 6 punti del codice) ma smette di essere la fonte.
-- ATTENZIONE: il trigger scatta sulle modifiche agli stream, NON sul passare del
-- tempo. Uno stream che scade domani non si aggiorna da solo: serve la chiamata
-- periodica a refresh_all_client_mrr() (job notturno o pulsante admin).

CREATE OR REPLACE FUNCTION public.sync_client_mrr()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_client UUID;
BEGIN
  v_client := COALESCE(NEW.client_id, OLD.client_id);
  UPDATE public.clients SET mrr = public.client_mrr(v_client) WHERE id = v_client;
  -- Se lo stream è stato spostato su un altro cliente, ricalcola anche il vecchio.
  IF TG_OP = 'UPDATE' AND OLD.client_id IS DISTINCT FROM NEW.client_id THEN
    UPDATE public.clients SET mrr = public.client_mrr(OLD.client_id) WHERE id = OLD.client_id;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS rs_sync_client_mrr ON public.revenue_streams;
CREATE TRIGGER rs_sync_client_mrr
  AFTER INSERT OR UPDATE OR DELETE ON public.revenue_streams
  FOR EACH ROW EXECUTE FUNCTION public.sync_client_mrr();

CREATE OR REPLACE FUNCTION public.refresh_all_client_mrr()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n INTEGER;
BEGIN
  UPDATE public.clients c SET mrr = public.client_mrr(c.id)
  WHERE c.mrr IS DISTINCT FROM public.client_mrr(c.id);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.refresh_all_client_mrr() FROM PUBLIC;

-- Rollback:
--   DROP TRIGGER rs_sync_client_mrr ON public.revenue_streams;
--   DROP FUNCTION public.sync_client_mrr, public.refresh_all_client_mrr,
--                 public.client_mrr, public.rs_monthly_amount;
--   DROP TABLE public.revenue_streams;
