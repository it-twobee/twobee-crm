-- 164 — Flussi di ricavo: un cliente, più contratti, ognuno con la sua vita.
--
-- `clients.mrr` è un numero solo per cliente e non regge la realtà: lo stesso
-- cliente può avere un growth continuativo, un progetto digital a termine con
-- inizio e fine, e una manutenzione che parte quando quel progetto finisce.
-- Tre contratti diversi, quotati e gestiti separatamente, che nel conto
-- economico pesano in mesi diversi e con piani compensi diversi.
--
--   billing = 'recurring'  → `amount` è il canone MENSILE. Vale in ogni mese
--                            fra start_date e end_date (null = indeterminato).
--   billing = 'one_off'    → `amount` è il TOTALE del lavoro. Non pesa tutto
--                            nel mese d'avvio: si spalma sulle rate.
--
-- Le rate stanno in `revenue_installments`: una riga per mese di competenza.
-- Così un 40/30/30 e una divisione in sei mesi sono lo stesso meccanismo, e il
-- P&L non deve indovinare come fatturate.
--
-- `activates_after_id` è la manutenzione futura: resta in 'bozza' finché il
-- progetto che la genera non è concluso, poi si attiva e diventa canone.
--
-- `clients.mrr` resta, ma da qui in poi lo tiene aggiornato un trigger sulla
-- somma dei canoni attivi: le viste che lo leggono (dashboard, KPI, elenco
-- clienti) continuano a funzionare senza toccarle.

CREATE TABLE IF NOT EXISTS public.revenue_streams (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id          UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  project_id         UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  label              TEXT NOT NULL,
  kind               TEXT NOT NULL DEFAULT 'growth' CHECK (kind IN ('growth', 'digital')),
  billing            TEXT NOT NULL DEFAULT 'recurring' CHECK (billing IN ('recurring', 'one_off')),
  amount             NUMERIC(12,2) NOT NULL DEFAULT 0,
  vat_rate           NUMERIC(5,4) NOT NULL DEFAULT 0.22,
  start_date         DATE,
  end_date           DATE,
  status             TEXT NOT NULL DEFAULT 'bozza'
                     CHECK (status IN ('bozza', 'attivo', 'sospeso', 'concluso')),
  sales_owner_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  activates_after_id UUID REFERENCES public.revenue_streams(id) ON DELETE SET NULL,
  note               TEXT,
  created_by         UUID REFERENCES public.profiles(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_revenue_streams_client  ON public.revenue_streams(client_id);
CREATE INDEX IF NOT EXISTS idx_revenue_streams_project ON public.revenue_streams(project_id);
CREATE INDEX IF NOT EXISTS idx_revenue_streams_status  ON public.revenue_streams(status);

CREATE TABLE IF NOT EXISTS public.revenue_installments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id  UUID NOT NULL REFERENCES public.revenue_streams(id) ON DELETE CASCADE,
  due_month  DATE NOT NULL,
  label      TEXT,
  amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
  invoiced   BOOLEAN NOT NULL DEFAULT false,
  paid       BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_revenue_inst_stream ON public.revenue_installments(stream_id);
CREATE INDEX IF NOT EXISTS idx_revenue_inst_month  ON public.revenue_installments(due_month);

-- ── clients.mrr diventa la somma dei canoni attivi ───────────────────────────
-- Se un cliente non ha flussi, il valore inserito a mano resta: si migra un
-- cliente per volta senza azzerare l'anagrafica di chi non è ancora passato.
CREATE OR REPLACE FUNCTION public.sync_client_mrr(p_client UUID)
RETURNS VOID AS $$
DECLARE v_n INT;
BEGIN
  SELECT count(*) INTO v_n FROM public.revenue_streams WHERE client_id = p_client;
  IF v_n = 0 THEN RETURN; END IF;

  UPDATE public.clients c
  SET mrr = COALESCE((
    SELECT sum(s.amount) FROM public.revenue_streams s
    WHERE s.client_id = p_client
      AND s.billing = 'recurring'
      AND s.status = 'attivo'
      AND (s.start_date IS NULL OR s.start_date <= CURRENT_DATE)
      AND (s.end_date IS NULL OR s.end_date >= CURRENT_DATE)
  ), 0)
  WHERE c.id = p_client;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.revenue_streams_sync_mrr()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.sync_client_mrr(OLD.client_id);
    RETURN OLD;
  END IF;
  PERFORM public.sync_client_mrr(NEW.client_id);
  IF TG_OP = 'UPDATE' AND NEW.client_id IS DISTINCT FROM OLD.client_id THEN
    PERFORM public.sync_client_mrr(OLD.client_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_revenue_streams_sync_mrr ON public.revenue_streams;
CREATE TRIGGER trg_revenue_streams_sync_mrr
AFTER INSERT OR UPDATE OR DELETE ON public.revenue_streams
FOR EACH ROW EXECUTE FUNCTION public.revenue_streams_sync_mrr();

-- ── RLS: dati economici, solo admin ──────────────────────────────────────────
ALTER TABLE public.revenue_streams      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revenue_installments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS revenue_streams_admin ON public.revenue_streams;
CREATE POLICY revenue_streams_admin ON public.revenue_streams FOR ALL
  USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS revenue_inst_admin ON public.revenue_installments;
CREATE POLICY revenue_inst_admin ON public.revenue_installments FOR ALL
  USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

NOTIFY pgrst, 'reload schema';
