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
