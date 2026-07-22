-- FASE 1 (project engine) — Motori operativi a 5 valori, verticale Growth
-- separato, e obbligo dell'accordo economico su ogni progetto.
-- Additiva tranne la riscrittura di `delivery_model` (2 righe in produzione).

-- ═══ 1. delivery_model: da 3 valori a 5 ═════════════════════════════════════
--
-- I 3 valori della 115 mettevano nello stesso secchio motori diversi:
--   `recurring_operations` copriva sia il Growth Program (che GENERA lavoro da
--   template) sia il Continuing Designer (che RICEVE lavoro dal cliente);
--   `structured_project` copriva sia un sito web sia una brand identity.
-- Con 2 progetti in produzione la rinomina costa zero.

ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_delivery_model_check;

UPDATE public.projects SET delivery_model = CASE
  WHEN delivery_model = 'recurring_operations' AND service_line = 'growth' THEN 'growth_program'
  WHEN delivery_model = 'recurring_operations' THEN 'recurring_service'
  WHEN delivery_model = 'structured_project' AND service_line IN ('digital','ai') THEN 'digital_project'
  WHEN delivery_model = 'structured_project' THEN 'structured_one_off'
  WHEN delivery_model = 'hybrid' THEN 'hybrid_delivery'
  ELSE delivery_model END;

ALTER TABLE public.projects ADD CONSTRAINT projects_delivery_model_check
  CHECK (delivery_model IN
    ('growth_program','digital_project','recurring_service','structured_one_off','hybrid_delivery'));

-- Il trigger della 124 deriva ancora i valori vecchi: va riallineato.
CREATE OR REPLACE FUNCTION public.projects_derive_service_line()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.service_line IS NULL THEN
    NEW.service_line := CASE NEW.project_kind
      WHEN 'growth' THEN 'growth'
      WHEN 'marketing' THEN 'marketing'
      WHEN 'ai' THEN 'ai'
      ELSE 'digital'
    END;
  END IF;

  IF NEW.delivery_model IS NULL THEN
    NEW.delivery_model := CASE NEW.service_line
      WHEN 'growth' THEN 'growth_program'
      WHEN 'marketing' THEN 'structured_one_off'
      WHEN 'consulting' THEN 'recurring_service'
      WHEN 'hybrid' THEN 'hybrid_delivery'
      ELSE 'digital_project'
    END;
  END IF;

  RETURN NEW;
END $$;

-- ═══ 2. Verticale Growth, separato da project_type ══════════════════════════
--
-- `project_type` faceva due lavori: verticale Growth (ecommerce|lead_gen) e
-- tipologia tecnica Digital (sito_web|app_ai). Con il catalogo servizi
-- "Growth E-commerce" e "Sito e-commerce" avrebbero collisso sullo stesso valore.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS growth_vertical TEXT
    CHECK (growth_vertical IN ('ecommerce','lead_gen'));

UPDATE public.projects
SET growth_vertical = CASE project_type WHEN 'ecommerce' THEN 'ecommerce'
                                        WHEN 'lead_gen' THEN 'lead_gen' END
WHERE service_line = 'growth' AND project_type IN ('ecommerce','lead_gen');

-- ═══ 3. Ogni progetto deve avere un accordo economico ═══════════════════════
--
-- Richiesta: un progetto nuovo trasferisce all'admin l'OBBLIGO di associargli un
-- valore economico. Non è una FK NOT NULL, per due motivi:
--   • nel wizard il progetto nasce prima dell'accordo;
--   • un manager può creare un progetto ma NON può vedere né scrivere
--     `revenue_streams` (admin-only dalla 116).
-- Quindi il progetto nasce `da_definire` e finisce in una coda per l'admin.
-- Il manager continua a lavorare; l'admin sa cosa gli manca.

-- Progetti interni TwoBee: nessun accordo economico atteso (§4 del brief).
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS is_internal_project BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS economic_status TEXT NOT NULL DEFAULT 'da_definire'
    CHECK (economic_status IN ('da_definire','definito','non_applicabile'));

-- Mantenuto dal trigger: nessuno lo scrive a mano, come per clients.mrr.
CREATE OR REPLACE FUNCTION public.sync_project_economic_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_project UUID;
BEGIN
  v_project := COALESCE(NEW.project_id, OLD.project_id);
  IF v_project IS NULL THEN RETURN NULL; END IF;

  UPDATE public.projects p SET economic_status = CASE
    WHEN p.is_internal_project THEN 'non_applicabile'
    WHEN EXISTS (
      SELECT 1 FROM public.revenue_streams rs
      WHERE rs.project_id = v_project AND rs.status IN ('attivo','bozza')
    ) THEN 'definito'
    ELSE 'da_definire' END
  WHERE p.id = v_project;

  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS rs_sync_project_economics ON public.revenue_streams;
CREATE TRIGGER rs_sync_project_economics
  AFTER INSERT OR UPDATE OR DELETE ON public.revenue_streams
  FOR EACH ROW EXECUTE FUNCTION public.sync_project_economic_status();

CREATE INDEX IF NOT EXISTS idx_projects_economic_status
  ON public.projects(economic_status) WHERE economic_status = 'da_definire';

-- La coda dell'admin: progetti operativi senza valore economico.
-- Nessun importo qui — solo "quali progetti aspettano una decisione".
CREATE OR REPLACE VIEW public.projects_missing_agreement
WITH (security_invoker = false) AS
SELECT p.id, p.name, p.client_id, c.company_name AS client_name,
       p.service_line, p.delivery_model, p.created_at
FROM public.projects p
JOIN public.clients c ON c.id = p.client_id
WHERE p.economic_status = 'da_definire'
  AND p.is_internal_project = false
  AND p.status <> 'archiviato'
  AND public.get_my_role() = 'admin';

GRANT SELECT ON public.projects_missing_agreement TO authenticated;

-- Allinea i progetti esistenti
UPDATE public.projects p SET economic_status = CASE
  WHEN EXISTS (SELECT 1 FROM public.revenue_streams rs
               WHERE rs.project_id = p.id AND rs.status IN ('attivo','bozza'))
  THEN 'definito' ELSE 'da_definire' END;

-- Verifica
SELECT name, service_line, delivery_model, growth_vertical, economic_status
FROM public.projects ORDER BY created_at;

-- Rollback:
--   DROP VIEW public.projects_missing_agreement;
--   DROP TRIGGER rs_sync_project_economics ON public.revenue_streams;
--   DROP FUNCTION public.sync_project_economic_status();
--   ALTER TABLE public.projects DROP COLUMN economic_status,
--     DROP COLUMN is_internal_project, DROP COLUMN growth_vertical;
--   ...e rimappare delivery_model ai 3 valori della 115.
