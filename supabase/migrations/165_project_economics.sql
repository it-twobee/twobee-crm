-- 165 — L'economics sta sul progetto, non sul cliente.
--
-- Correzione della 164: un cliente non «ha un ricavo», ha dei progetti che ne
-- generano. Lo stesso cliente può avere un growth continuativo e un digital a
-- termine: sono due progetti, con due conti separati, e il totale cliente è la
-- somma dei suoi progetti. Ancorare al cliente rendeva impossibile leggere la
-- marginalità del singolo lavoro.
--
-- Una riga per servizio erogato, non una per progetto: se un growth eroga Lead
-- Generation e Social, sono due righe. Solo così si vede quale servizio regge
-- il margine e quale lo mangia.
--
-- Il listino sta a catalogo (`service_catalog.standard_price`) ed è un punto di
-- partenza: sul progetto il prezzo si sovrascrive, e `price_source` ricorda se
-- quella cifra è di listino o negoziata. I costi di erogazione NON si tracciano
-- per servizio: restano nel conto economico mensile aggregato.
--
-- Sicura: `revenue_streams` è vuota (verificato prima di scrivere questa).

-- ── Listino a catalogo ───────────────────────────────────────────────────────
ALTER TABLE public.service_catalog
  ADD COLUMN IF NOT EXISTS standard_price NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS price_unit TEXT NOT NULL DEFAULT 'mese'
    CHECK (price_unit IN ('mese', 'una_tantum'));

-- ── Il contratto pende dal progetto ──────────────────────────────────────────
ALTER TABLE public.revenue_streams
  ADD COLUMN IF NOT EXISTS service_type TEXT,
  ADD COLUMN IF NOT EXISTS service_subtype TEXT,
  ADD COLUMN IF NOT EXISTS price_source TEXT NOT NULL DEFAULT 'custom'
    CHECK (price_source IN ('standard', 'custom'));

-- il cliente si deduce dal progetto: tenerlo scrivibile a mano vuol dire
-- ritrovarsi righe attaccate a un cliente e a un progetto di un altro
ALTER TABLE public.revenue_streams ALTER COLUMN client_id DROP NOT NULL;
ALTER TABLE public.revenue_streams ALTER COLUMN project_id SET NOT NULL;

CREATE OR REPLACE FUNCTION public.revenue_streams_fill_client()
RETURNS TRIGGER AS $$
BEGIN
  SELECT p.client_id INTO NEW.client_id
  FROM public.projects p WHERE p.id = NEW.project_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_revenue_streams_fill_client ON public.revenue_streams;
CREATE TRIGGER trg_revenue_streams_fill_client
BEFORE INSERT OR UPDATE OF project_id ON public.revenue_streams
FOR EACH ROW EXECUTE FUNCTION public.revenue_streams_fill_client();

-- ── L'MRR del cliente regge i progetti interni (client_id nullo) ─────────────
CREATE OR REPLACE FUNCTION public.sync_client_mrr(p_client UUID)
RETURNS VOID AS $$
DECLARE v_n INT;
BEGIN
  IF p_client IS NULL THEN RETURN; END IF;

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

NOTIFY pgrst, 'reload schema';
