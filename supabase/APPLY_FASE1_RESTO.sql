-- TWO BEE — FASE 1, blocchi 2-5 (la 115 è già applicata)
-- ESEGUIRE UN BLOCCO PER VOLTA: il SQL Editor usa una sola transazione,
-- quindi un errore in fondo annulla anche ciò che era passato sopra.

-- ─── 116_revenue_streams.sql ───
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

-- ─── 117_revenue_milestones.sql ───
-- FASE 1c — `revenue_milestones`: acconto / SAL / saldo di uno stream.
-- Additiva + idempotente.
--
-- `trigger_task_id` è il ponte fra delivery ed economia: quando la milestone di
-- progetto (tasks.is_milestone) viene chiusa, il SAL diventa fatturabile. È
-- l'UNICO punto in cui il project management tocca il denaro, ed è read-only
-- per il Workspace (tabella admin-only).

CREATE TABLE IF NOT EXISTS public.revenue_milestones (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id       UUID NOT NULL REFERENCES public.revenue_streams(id) ON DELETE CASCADE,
  label           TEXT NOT NULL,                       -- 'Acconto 30%', 'SAL 1', 'Saldo'
  amount          NUMERIC(12,2) NOT NULL,              -- imponibile
  due_on          DATE,
  trigger_task_id UUID REFERENCES public.tasks(id)    ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'previsto'
    CHECK (status IN ('previsto','maturato','fatturato','incassato','annullato')),
  invoice_id      UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  position        INT  NOT NULL DEFAULT 0,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rm_stream  ON public.revenue_milestones(stream_id);
CREATE INDEX IF NOT EXISTS idx_rm_task    ON public.revenue_milestones(trigger_task_id);
CREATE INDEX IF NOT EXISTS idx_rm_invoice ON public.revenue_milestones(invoice_id);
-- "SAL completati non fatturati" = il denaro dimenticato. Indice dedicato.
CREATE INDEX IF NOT EXISTS idx_rm_unbilled
  ON public.revenue_milestones(status) WHERE invoice_id IS NULL;

CREATE OR REPLACE FUNCTION public.set_rm_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS rm_updated_at ON public.revenue_milestones;
CREATE TRIGGER rm_updated_at BEFORE UPDATE ON public.revenue_milestones
  FOR EACH ROW EXECUTE FUNCTION public.set_rm_updated_at();

ALTER TABLE public.revenue_milestones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rm_admin" ON public.revenue_milestones;
CREATE POLICY "rm_admin" ON public.revenue_milestones
  FOR ALL USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- Rollback: DROP TABLE public.revenue_milestones;

-- ─── 118_invoices_streams_vat.sql ───
-- FASE 1d — `invoices`: rimozione del vincolo bloccante, link alla fonte, IVA.
--
-- ⚠️ UNICA MIGRATION NON PURAMENTE ADDITIVA DEL PIANO.
--
-- Il vincolo UNIQUE(client_id, month) della 002 impone UNA sola fattura per
-- cliente al mese. Un cliente Growth+Digital che nello stesso mese riceve il
-- canone e un SAL di progetto NON è rappresentabile: i due importi vanno fusi in
-- una riga e la separazione Growth/Digital diventa impossibile per costruzione.
--
-- Oggi `invoices` ha 0 righe → il DROP è a rischio zero. Dopo le prime fatture
-- reali l'operazione non è più reversibile (due righe sullo stesso
-- client_id+month impediscono di ricreare il vincolo). Decisione Q28: DROP.

DO $$
DECLARE c RECORD;
BEGIN
  -- Droppa qualunque UNIQUE su esattamente (client_id, month), comunque si chiami.
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    WHERE ns.nspname = 'public' AND rel.relname = 'invoices' AND con.contype = 'u'
      AND (
        -- ::text obbligatorio: attname è `name`, e name[] non si confronta con text[].
        SELECT array_agg(att.attname::text ORDER BY att.attname::text)
        FROM unnest(con.conkey) k
        JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = k
      ) = ARRAY['client_id','month']
  LOOP
    EXECUTE format('ALTER TABLE public.invoices DROP CONSTRAINT %I', c.conname);
    RAISE NOTICE 'Droppato vincolo %', c.conname;
  END LOOP;
END $$;

-- ─── Link alla fonte del ricavo ──────────────────────────────────────────────
-- Senza questi, una fattura non è attribuibile né a una linea di servizio né a
-- un progetto: era la ragione per cui "il ricavo di progetto" veniva calcolato
-- come fatturato dell'intero cliente (bug in ControlloGestioneClient.tsx:133).

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS stream_id            UUID REFERENCES public.revenue_streams(id)    ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revenue_milestone_id UUID REFERENCES public.revenue_milestones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS project_id           UUID REFERENCES public.projects(id)           ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_stream  ON public.invoices(stream_id);
CREATE INDEX IF NOT EXISTS idx_invoices_project ON public.invoices(project_id);
-- Il fatturato è per CASSA (decisione Q7): l'indice segue paid_at, non month.
CREATE INDEX IF NOT EXISTS idx_invoices_paid_at ON public.invoices(paid_at) WHERE paid_at IS NOT NULL;

-- ─── Scomposizione IVA ───────────────────────────────────────────────────────
-- `amount` era un campo unico e ambiguo: nessuno poteva sapere se chi inseriva
-- mettesse lordo o netto. Decisione Q8: il fatturato è al NETTO.
-- `amount` resta invariato per compatibilità con il codice esistente e
-- `taxable_amount` ne è il significato esplicito.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS taxable_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS vat_rate       NUMERIC(5,2) DEFAULT 22,
  ADD COLUMN IF NOT EXISTS vat_amount     NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS total_gross    NUMERIC(12,2);

-- Backfill: `amount` è trattato come IMPONIBILE (in produzione: 0 righe).
UPDATE public.invoices
SET taxable_amount = amount,
    vat_amount     = ROUND(amount * COALESCE(vat_rate, 22) / 100, 2),
    total_gross    = amount + ROUND(amount * COALESCE(vat_rate, 22) / 100, 2)
WHERE taxable_amount IS NULL;

-- Coerenza: chi inserisce può compilare l'imponibile e lasciar calcolare il resto.
CREATE OR REPLACE FUNCTION public.invoices_fill_vat()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.taxable_amount IS NULL THEN NEW.taxable_amount := NEW.amount; END IF;
  IF NEW.vat_rate       IS NULL THEN NEW.vat_rate       := 22;         END IF;
  NEW.vat_amount  := ROUND(NEW.taxable_amount * NEW.vat_rate / 100, 2);
  NEW.total_gross := NEW.taxable_amount + NEW.vat_amount;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS invoices_vat ON public.invoices;
CREATE TRIGGER invoices_vat BEFORE INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.invoices_fill_vat();

COMMENT ON COLUMN public.invoices.amount IS
  'Storico/compatibilità. Per gli aggregati usare taxable_amount (imponibile).';
COMMENT ON COLUMN public.invoices.month IS
  'Mese di COMPETENZA. Il fatturato aziendale si calcola su paid_at (cassa), non su month.';

-- Rollback:
--   DROP TRIGGER invoices_vat ON public.invoices; DROP FUNCTION public.invoices_fill_vat;
--   ALTER TABLE public.invoices DROP COLUMN stream_id, DROP COLUMN revenue_milestone_id,
--     DROP COLUMN project_id, DROP COLUMN taxable_amount, DROP COLUMN vat_rate,
--     DROP COLUMN vat_amount, DROP COLUMN total_gross;
--   -- Il vincolo UNIQUE(client_id, month) è ricreabile SOLO se non esistono duplicati:
--   -- ALTER TABLE public.invoices ADD CONSTRAINT invoices_client_id_month_key UNIQUE (client_id, month);

-- ─── 122_workspace_revenue_summary.sql ───
-- FASE 1e — Aggregato economico autorizzato per il Workspace.
-- Additiva + idempotente. (119–121 riservate a Growth engine / task ad hoc.)
--
-- Sostituisce l'aggregazione inline di app/(workspace)/workspace/page.tsx:106,
-- che usa createAdminClient() (service role, bypassa OGNI RLS) dentro una
-- pagina. Al browser arrivava solo la somma — corretto come effetto — ma la
-- barriera dipendeva dal fatto che nessuno allargasse quel .select(). Qui la
-- garanzia si sposta nel database, dove non è aggirabile per distrazione.
--
-- Decisione Q10: il Workspace vede Total MRR E fatturato, entrambi SOLO come
-- somma aziendale. Restano vietati: MRR per cliente, ricavo per cliente o
-- progetto, fatture, preventivi, margini, costi.

CREATE TABLE IF NOT EXISTS public.company_targets (
  year           INT PRIMARY KEY,
  revenue_target NUMERIC(12,2) NOT NULL,
  notes          TEXT,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.company_targets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_targets_admin" ON public.company_targets;
CREATE POLICY "company_targets_admin" ON public.company_targets
  FOR ALL USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');
-- Il Workspace NON legge la tabella: riceve il target solo dentro l'aggregato.

INSERT INTO public.company_targets (year, revenue_target)
VALUES (2026, 300000)
ON CONFLICT (year) DO NOTHING;

-- ─── Fatturato = INCASSATO, al NETTO IVA, note di credito SOTTRATTE ──────────
-- Q7: cassa → il periodo segue paid_at, non month.
-- Q8: netto → taxable_amount, non amount.
-- Q9: le note di credito si sottraggono (non si escludono e basta).

CREATE OR REPLACE FUNCTION public.company_revenue_ytd(p_year INT)
RETURNS NUMERIC LANGUAGE sql STABLE AS $$
  SELECT COALESCE(SUM(
    CASE WHEN invoice_type = 'nota_credito' THEN -1 ELSE 1 END
    * COALESCE(taxable_amount, amount)
  ), 0)
  FROM public.invoices
  WHERE status = 'pagata'
    AND paid_at IS NOT NULL
    AND EXTRACT(YEAR FROM paid_at) = p_year;
$$;

CREATE OR REPLACE FUNCTION public.workspace_revenue_summary(p_year INT DEFAULT NULL)
RETURNS TABLE (
  year            INT,
  revenue_ytd     NUMERIC,
  monthly_revenue JSONB,
  total_mrr       NUMERIC,
  annual_target   NUMERIC,
  target_progress NUMERIC,
  updated_at      TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_year   INT := COALESCE(p_year, EXTRACT(YEAR FROM CURRENT_DATE)::INT);
  v_target NUMERIC;
BEGIN
  -- Staff = admin + team. Cliente e guest non passano di qui.
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT ct.revenue_target INTO v_target
  FROM public.company_targets ct WHERE ct.year = v_year;

  RETURN QUERY
  SELECT
    v_year,
    public.company_revenue_ytd(v_year),
    COALESCE((
      SELECT jsonb_agg(m ORDER BY m->>'month')
      FROM (
        SELECT jsonb_build_object(
                 'month',  to_char(date_trunc('month', i.paid_at), 'YYYY-MM'),
                 'amount', SUM(CASE WHEN i.invoice_type = 'nota_credito' THEN -1 ELSE 1 END
                               * COALESCE(i.taxable_amount, i.amount))
               ) AS m
        FROM public.invoices i
        WHERE i.status = 'pagata' AND i.paid_at IS NOT NULL
          AND EXTRACT(YEAR FROM i.paid_at) = v_year
        GROUP BY date_trunc('month', i.paid_at)
      ) s
    ), '[]'::jsonb),
    -- Total MRR: somma aziendale, mai scomposta per cliente.
    COALESCE((
      SELECT SUM(public.rs_monthly_amount(rs.amount, rs.billing_frequency))
      FROM public.revenue_streams rs
      JOIN public.clients c ON c.id = rs.client_id AND c.is_internal = false
      WHERE rs.status = 'attivo'
        AND rs.revenue_model IN ('recurring','maintenance')
        AND rs.start_date <= CURRENT_DATE
        AND (rs.end_date IS NULL OR rs.end_date >= CURRENT_DATE)
    ), 0),
    v_target,
    CASE WHEN v_target > 0
         THEN ROUND(public.company_revenue_ytd(v_year) / v_target, 4)
         ELSE NULL END,
    NOW();
END $$;

REVOKE ALL ON FUNCTION public.workspace_revenue_summary(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.workspace_revenue_summary(INT) TO authenticated;
REVOKE ALL ON FUNCTION public.company_revenue_ytd(INT) FROM PUBLIC;

-- Rollback:
--   DROP FUNCTION public.workspace_revenue_summary(INT), public.company_revenue_ytd(INT);
--   DROP TABLE public.company_targets;

