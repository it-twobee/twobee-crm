-- 188 — Un accordo può coprire più progetti, e non tutto quello che fatturi è tuo.
--
-- Due cose che il modello non sapeva dire, e che l'anagrafica reale dei clienti
-- ha reso subito evidenti.
--
-- ═══ 1) UN CONTRATTO, N PROGETTI ═══
--
-- Fino a qui un `revenue_stream` puntava a un progetto solo (o a nessuno, e
-- allora era un retainer di cliente). Ma un accordo commerciale non si fa per
-- progetto: iCura paga 3.600 € al mese e dentro ci sono lead generation, social
-- e il sito web. Con un solo `project_id` quell'accordo finiva fra gli «accordi
-- senza progetto» — vero ma inutile: non diceva cosa comprende.
--
-- `revenue_stream_projects` è il ponte. Il `project_id` sulla riga del contratto
-- resta e continua a valere per il caso normale (un contratto, un progetto):
-- toglierlo avrebbe rotto il margine di progetto, le viste e i mesi già chiusi.
-- Quando i progetti sono più di uno si scrivono qui, con la loro quota.
--
-- La quota serve per una ragione precisa: il **margine di progetto** (§173) e la
-- spartizione digital (§186) partono dal ricavo di quel progetto. Se un accordo
-- da 3.600 copre tre lavori e nessuno dice come si divide, il margine di ognuno
-- non è calcolabile — e un margine non calcolabile diventa un margine inventato.
-- `share_pct` NULL = parti uguali fra i progetti collegati.
--
-- ═══ 2) PARTITE DI GIRO ═══
--
-- Petito fattura 1.500 al mese: 1.000 di fee e 500 di budget pubblicitario che
-- Two Bee anticipa e spende per lui. Quei 500 sono fatturato e IVA — vanno
-- dichiarati — ma non sono ricavo su cui spartire niente: il 15% di provvigione
-- e il 30% di erogato su un anticipo che torna al cliente sarebbero soldi presi
-- da una tasca che non esiste.
--
-- `pass_through` marca quelle righe: entrano nel fatturato e nell'IVA, restano
-- fuori dalle quote del piano compensi. È lo stesso concetto che serve a
-- qualsiasi budget media anticipato per un cliente.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) Il ponte contratto ↔ progetti
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.revenue_stream_projects (
  stream_id  UUID NOT NULL REFERENCES public.revenue_streams(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  /**
   * Quota del contratto attribuita a questo progetto. NULL su tutte le righe di
   * un contratto = parti uguali. Se ci sono percentuali, la loro somma dovrebbe
   * fare 1: il motore non le riscala di nascosto, lo dichiara.
   */
  share_pct  NUMERIC(6,4) CHECK (share_pct IS NULL OR (share_pct > 0 AND share_pct <= 1)),
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (stream_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_rsp_project ON public.revenue_stream_projects (project_id);

COMMENT ON TABLE public.revenue_stream_projects IS
  'Progetti coperti da un contratto, quando sono più di uno. Un contratto con un solo progetto usa revenue_streams.project_id.';

-- il contratto già esistente con un progetto entra nel ponte: da qui in avanti
-- la lettura è una sola, e non due strade che possono divergere
INSERT INTO public.revenue_stream_projects (stream_id, project_id)
SELECT id, project_id FROM public.revenue_streams
WHERE project_id IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE public.revenue_stream_projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rsp_admin ON public.revenue_stream_projects;
CREATE POLICY rsp_admin ON public.revenue_stream_projects FOR ALL
  USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) Partite di giro: fatturato sì, quote no
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.revenue_streams
  ADD COLUMN IF NOT EXISTS pass_through BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.pl_revenue_lines
  ADD COLUMN IF NOT EXISTS pass_through BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.revenue_streams.pass_through IS
  'Anticipo che torna al cliente (budget ads): entra in fatturato e IVA, escluso dalle quote del piano compensi.';
COMMENT ON COLUMN public.pl_revenue_lines.pass_through IS
  'Come sopra, sulla riga del mese. Il piano compensi la salta; il fatturato e l''IVA la contano.';

COMMIT;

NOTIFY pgrst, 'reload schema';
