-- FASE 1f — `marketing` fra le linee di servizio + linee cliente derivate.
-- Additiva + idempotente.
--
-- 1) Social media management, brand identity e contenuti sono servizi vendibili
--    a sé: linea `marketing`. Il SMM è un canone → entra nell'MRR come il Growth.
--
-- 2) `clients.client_type` (growth|digital|growth_digital) è un'etichetta scritta
--    a mano che in produzione già mente su 3 clienti su 12, e non è combinatoria:
--    non esprime "Growth + Digital + Marketing". La verità è negli accordi.
--    La VIEW la deriva. Nessun importo: le linee attive sono un dato operativo,
--    non economico, quindi leggibile anche dal Workspace.

ALTER TABLE public.revenue_streams DROP CONSTRAINT IF EXISTS revenue_streams_service_line_check;

ALTER TABLE public.revenue_streams
  ADD CONSTRAINT revenue_streams_service_line_check
  CHECK (service_line IN ('growth','digital','marketing','ai','hybrid','consulting','other'));

ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_service_line_check;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_service_line_check
  CHECK (service_line IN ('growth','digital','marketing','ai','hybrid','consulting','other'));

-- ─── Linee di servizio attive per cliente (senza importi) ───────────────────
-- security_invoker = false (definer) + is_staff(): il team vede le linee, il
-- cliente e i guest no. Gli importi restano in revenue_streams, admin-only.

CREATE OR REPLACE VIEW public.client_service_lines WITH (security_invoker = false) AS
SELECT
  c.id AS client_id,
  COALESCE(
    ARRAY_AGG(DISTINCT rs.service_line) FILTER (
      WHERE rs.status = 'attivo'
        AND rs.revenue_model <> 'non_billable'
        AND rs.start_date <= CURRENT_DATE
        AND (rs.end_date IS NULL OR rs.end_date >= CURRENT_DATE)
    ),
    ARRAY[]::text[]
  ) AS active_lines
FROM public.clients c
LEFT JOIN public.revenue_streams rs ON rs.client_id = c.id
WHERE public.is_staff()
GROUP BY c.id;

GRANT SELECT ON public.client_service_lines TO authenticated;

COMMENT ON COLUMN public.clients.client_type IS
  'Etichetta commerciale storica. Per le linee reali usare la VIEW client_service_lines (derivata dagli accordi economici).';

-- Verifica: 2 constraint + la view popolata
SELECT conrelid::regclass AS tabella, conname
FROM pg_constraint
WHERE conname IN ('revenue_streams_service_line_check','projects_service_line_check');

SELECT c.company_name, csl.active_lines
FROM public.client_service_lines csl
JOIN public.clients c ON c.id = csl.client_id
ORDER BY c.company_name;

-- Rollback:
--   DROP VIEW public.client_service_lines;
--   ...ripristinare i CHECK senza 'marketing'.
