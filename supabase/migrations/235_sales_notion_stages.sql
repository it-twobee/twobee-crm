-- §367 — le fasi del commerciale diventano quelle di Notion.
--
-- `deals.stage` aveva otto valori inventati qui dentro (`lead`, `contatto`,
-- `qualificata`, `perimetro`…) mentre il commerciale ne usa dodici, da mesi,
-- su un altro strumento. Finché i due elenchi non coincidono, il tool non
-- sostituisce Notion: lo affianca — e affiancare vuol dire che nessuno dei due
-- è vero.
--
-- Le chiavi sono la trascrizione **letterale** delle etichette di Notion:
-- minuscole, spazi in underscore, il «+» di «Strategia + Preventivo» diventa
-- un underscore. Non si traducono e non si «sistemano»: l'elenco vive in
-- `lib/sales-stages.ts`, dove sta anche il motivo di ognuna, e il gate
-- `lib/sales-stages.check.ts` verifica che restino dodici e in quell'ordine.
--
-- La tabella ha una riga sola in tutto il database, quindi la conversione dei
-- valori vecchi è una formalità: si fa lo stesso, perché una riga persa in
-- silenzio è peggio di mille righe convertite a mano.
--
-- Rilanciabile: `DROP CONSTRAINT IF EXISTS` + un UPDATE che al secondo giro
-- non trova più niente.

BEGIN;

-- Il vincolo esce prima della conversione: con quello vecchio addosso, un
-- UPDATE verso un valore nuovo verrebbe rifiutato riga per riga.
ALTER TABLE public.deals DROP CONSTRAINT IF EXISTS deals_stage_check;

-- Dalle fasi inventate a quelle vere. `perimetro` e `qualificata` cadono
-- entrambe su `qualified`: erano due sfumature della stessa cosa, e su Notion
-- quella cosa ha un nome solo.
UPDATE public.deals SET stage = CASE stage
  WHEN 'lead'         THEN 'new_lead'
  WHEN 'contatto'     THEN 'contacting'
  WHEN 'qualificata'  THEN 'qualified'
  WHEN 'perimetro'    THEN 'qualified'
  WHEN 'proposta'     THEN 'strategia_preventivo'
  WHEN 'trattativa'   THEN 'in_conversation'
  WHEN 'chiuso_vinto' THEN 'active_client'
  WHEN 'chiuso_perso' THEN 'lost'
  ELSE stage
END
WHERE stage IN ('lead','contatto','qualificata','perimetro','proposta','trattativa','chiuso_vinto','chiuso_perso');

ALTER TABLE public.deals ALTER COLUMN stage SET DEFAULT 'new_lead';

ALTER TABLE public.deals ADD CONSTRAINT deals_stage_check CHECK (stage IN (
  'lost', 'inactive_client', 'new_lead', 'contacting',
  'in_conversation', 'evento_osm', 'audit_richiesto', 'qualified',
  'pending', 'strategia_preventivo', 'contratto',
  'active_client'
));

-- §367 — da dove arriva la riga. Un lead importato dal foglio non si
-- reimporta: `sheet_row_id` è la chiave con cui il giro orario riconosce
-- quello che ha già visto, ed è unica perché due righe dello stesso foglio
-- sono un errore, non un caso.
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS sheet_row_id text;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS imported_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS deals_sheet_row_id_key
  ON public.deals (sheet_row_id) WHERE sheet_row_id IS NOT NULL;

COMMIT;

-- verifica: dodici fasi ammesse, nessuna riga fuori, il default è la porta d'ingresso
SELECT
  (SELECT count(*) FROM public.deals)                                        AS righe,
  (SELECT count(DISTINCT stage) FROM public.deals)                           AS fasi_in_uso,
  (SELECT count(*) FROM public.deals WHERE stage NOT IN (
     'lost','inactive_client','new_lead','contacting','in_conversation','evento_osm',
     'audit_richiesto','qualified','pending','strategia_preventivo','contratto','active_client'
   ))                                                                        AS fuori_elenco,
  (SELECT column_default FROM information_schema.columns
    WHERE table_schema='public' AND table_name='deals' AND column_name='stage') AS predefinita;
