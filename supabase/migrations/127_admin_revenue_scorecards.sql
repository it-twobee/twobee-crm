-- FASE 2 — Scorecard economiche Admin.
-- Additiva + idempotente.
--
-- Le formule stanno qui, non nei componenti: è l'errore da cui veniamo (sei
-- somme di `clients.mrr` con tre filtri divergenti). I componenti disegnano.
--
-- Scomposta in funzioni piccole invece che in un unico blocco: ognuna è
-- incollabile e verificabile da sola (il SQL Editor tronca gli incolli lunghi),
-- ed è testabile con una SELECT senza passare dalla dashboard.
--
-- Sorgenti:
--   ricorrente e venduto → revenue_streams (l'accordo economico)
--   incassato            → invoices, per CASSA (paid_at) e al NETTO (taxable_amount)
--   SAL non fatturati    → revenue_milestones maturate senza invoice_id
--
-- `quotes` NON è la fonte del venduto: è vuota, non è collegata ai progetti e il
-- suo `status` non porta una data di accettazione, quindi non direbbe in che anno
-- è stato venduto. Gli accordi sì.

-- ─── 1. Accordi attivi di clienti esterni ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.active_streams()
RETURNS SETOF public.revenue_streams
LANGUAGE sql STABLE AS $$
  SELECT rs.*
  FROM public.revenue_streams rs
  JOIN public.clients c ON c.id = rs.client_id AND c.is_internal = false
  WHERE rs.status = 'attivo'
    AND rs.start_date <= CURRENT_DATE
    AND (rs.end_date IS NULL OR rs.end_date >= CURRENT_DATE);
$$;

-- ─── 2. Ricorrente per linea di servizio ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.recurring_by_line()
RETURNS JSONB LANGUAGE sql STABLE AS $$
  SELECT COALESCE(jsonb_object_agg(service_line, mensile), '{}'::jsonb)
  FROM (
    SELECT service_line,
           ROUND(SUM(public.rs_monthly_amount(amount, billing_frequency)), 2) AS mensile
    FROM public.active_streams()
    WHERE revenue_model IN ('recurring','maintenance')
    GROUP BY service_line
  ) t;
$$;

-- ─── 3. Metriche per linea ──────────────────────────────────────────────────

-- Venduto: accordi a corpo o a SAL avviati nell'anno.
CREATE OR REPLACE FUNCTION public.line_sold(p_line TEXT, p_year INT)
RETURNS NUMERIC LANGUAGE sql STABLE AS $$
  SELECT COALESCE(SUM(amount), 0)
  FROM public.active_streams()
  WHERE service_line = p_line
    AND revenue_model IN ('one_off','milestone_based')
    AND EXTRACT(YEAR FROM start_date) = p_year;
$$;

-- Incassato: per cassa, al netto, note di credito sottratte.
CREATE OR REPLACE FUNCTION public.line_collected(p_line TEXT, p_year INT)
RETURNS NUMERIC LANGUAGE sql STABLE AS $$
  SELECT COALESCE(SUM(
    CASE WHEN i.invoice_type = 'nota_credito' THEN -1 ELSE 1 END
    * COALESCE(i.taxable_amount, i.amount)), 0)
  FROM public.invoices i
  JOIN public.revenue_streams rs ON rs.id = i.stream_id
  WHERE rs.service_line = p_line
    AND i.status = 'pagata'
    AND i.paid_at IS NOT NULL
    AND EXTRACT(YEAR FROM i.paid_at) = p_year;
$$;

-- Backlog: contrattualizzato meno già fatturato, su tutto lo storico. Mai negativo.
CREATE OR REPLACE FUNCTION public.line_backlog(p_line TEXT)
RETURNS NUMERIC LANGUAGE sql STABLE AS $$
  SELECT GREATEST(
    COALESCE((
      SELECT SUM(amount) FROM public.active_streams()
      WHERE service_line = p_line AND revenue_model IN ('one_off','milestone_based')
    ), 0)
    -
    COALESCE((
      SELECT SUM(CASE WHEN i.invoice_type = 'nota_credito' THEN -1 ELSE 1 END
                 * COALESCE(i.taxable_amount, i.amount))
      FROM public.invoices i
      JOIN public.revenue_streams rs ON rs.id = i.stream_id
      WHERE rs.service_line = p_line
    ), 0),
    0);
$$;

-- ─── 4. Lavoro consegnato mai fatturato ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.unbilled_sal()
RETURNS NUMERIC LANGUAGE sql STABLE AS $$
  SELECT COALESCE(SUM(amount), 0)
  FROM public.revenue_milestones
  WHERE status = 'maturato' AND invoice_id IS NULL;
$$;

-- ─── 5. Incassato senza accordo collegato ───────────────────────────────────
-- Se cresce, gli aggregati per linea stanno perdendo pezzi in silenzio.

CREATE OR REPLACE FUNCTION public.unassigned_revenue(p_year INT)
RETURNS NUMERIC LANGUAGE sql STABLE AS $$
  SELECT COALESCE(SUM(
    CASE WHEN invoice_type = 'nota_credito' THEN -1 ELSE 1 END
    * COALESCE(taxable_amount, amount)), 0)
  FROM public.invoices
  WHERE stream_id IS NULL
    AND status = 'pagata'
    AND paid_at IS NOT NULL
    AND EXTRACT(YEAR FROM paid_at) = p_year;
$$;

-- ─── 6. Composizione ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_revenue_scorecards(p_year INT DEFAULT NULL)
RETURNS TABLE (
  year INT,
  growth_mrr NUMERIC,
  total_recurring NUMERIC,
  recurring_by_line JSONB,
  digital_sold_ytd NUMERIC,
  digital_collected_ytd NUMERIC,
  digital_backlog NUMERIC,
  unbilled_sal NUMERIC,
  revenue_ytd NUMERIC,
  annual_target NUMERIC,
  target_progress NUMERIC,
  unassigned_revenue NUMERIC,
  computed_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  y INT := COALESCE(p_year, EXTRACT(YEAR FROM CURRENT_DATE)::INT);
  t NUMERIC;
  r NUMERIC;
  lines JSONB;
BEGIN
  -- IS DISTINCT FROM, non <>: get_my_role() torna NULL per un utente senza
  -- profilo e `NULL <> 'admin'` in un IF non scatta (bug corretto dalla 126).
  IF public.get_my_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT revenue_target INTO t FROM public.company_targets WHERE company_targets.year = y;
  r := public.company_revenue_ytd(y);
  lines := public.recurring_by_line();

  RETURN QUERY SELECT
    y,
    COALESCE((lines->>'growth')::numeric, 0),
    COALESCE((SELECT SUM(v::numeric) FROM jsonb_each_text(lines) AS e(k, v)), 0),
    lines,
    public.line_sold('digital', y),
    public.line_collected('digital', y),
    public.line_backlog('digital'),
    public.unbilled_sal(),
    r,
    t,
    CASE WHEN t > 0 THEN ROUND(r / t, 4) ELSE NULL END,
    public.unassigned_revenue(y),
    NOW();
END $$;

REVOKE ALL ON FUNCTION public.admin_revenue_scorecards(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_revenue_scorecards(INT) TO authenticated;

-- Rollback:
--   DROP FUNCTION public.admin_revenue_scorecards(INT), public.unassigned_revenue(INT),
--     public.unbilled_sal(), public.line_backlog(TEXT), public.line_collected(TEXT, INT),
--     public.line_sold(TEXT, INT), public.recurring_by_line(), public.active_streams();
