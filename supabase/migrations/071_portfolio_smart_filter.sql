-- Portfolio smart filter: filtri dinamici per tipo/stato
ALTER TABLE public.portfolios
  ADD COLUMN IF NOT EXISTS smart_filter JSONB;

COMMENT ON COLUMN public.portfolios.smart_filter IS 'Filtro dinamico: { "client_type": "growth", "project_kind": "digital", "project_status": "attivo" }';
