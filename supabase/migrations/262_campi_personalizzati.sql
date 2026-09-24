-- 262 — I campi personalizzati della scheda lead (§437).
--
-- Un campo che serve a un solo modo di lavorare («Settore ATECO», «Referente
-- tecnico», «Ha già un sito?») non dovrebbe chiedere una migration e un
-- rilascio. Le definizioni stanno in `sales_campi`, i valori in una colonna
-- `jsonb` sul lead: aggiungere un campo è una riga, non una colonna.
--
-- **Si scrive una chiave alla volta**, con `sales_imposta_campo`. Leggere
-- l'oggetto, cambiarlo e riscriverlo intero farebbe perdere il campo che un
-- collega ha compilato nello stesso momento sulla stessa scheda; `jsonb_set`
-- dentro un solo UPDATE no. Il valore vuoto toglie la chiave invece di salvare
-- un `null`: «non compilato» è l'assenza del dato, non un dato.
--
-- La funzione è solo del service role: la chiama `salvaCampoExtra`, che prima
-- controlla che il lead sia di chi scrive (`requireDealAccess`) e che il valore
-- stia nel tipo del campo. Il browser non ci arriva.
--
-- Non c'è una chiave esterna fra i valori e le definizioni, ed è voluto: un
-- campo ritirato lascia i suoi valori sui lead, leggibili, come le fasi e i
-- motivi ritirati. Quello che impedisce di perderli è l'azione, che non
-- elimina un campo con dei valori.
--
-- Prerequisiti: nessuno. Rilanciabile.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.sales_campi (
  chiave     text PRIMARY KEY CHECK (chiave ~ '^[a-z][a-z0-9_]{1,40}$'),
  etichetta  text NOT NULL CHECK (length(btrim(etichetta)) BETWEEN 1 AND 40),
  tipo       text NOT NULL CHECK (tipo IN ('testo', 'lunga', 'numero', 'data', 'si_no', 'scelta', 'url', 'telefono', 'email')),
  opzioni    text[] NOT NULL DEFAULT '{}',
  riquadro   text NOT NULL DEFAULT 'trattativa' CHECK (riquadro IN ('contatto', 'trattativa', 'azienda', 'classificazione')),
  aiuto      text CHECK (aiuto IS NULL OR length(aiuto) <= 120),
  ordine     integer NOT NULL,
  attivo     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS campi_extra jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.sales_imposta_campo(p_deal uuid, p_chiave text, p_valore jsonb)
RETURNS jsonb
LANGUAGE sql VOLATILE SET search_path = public AS $$
  UPDATE public.deals
     SET campi_extra = CASE
           WHEN p_valore IS NULL OR p_valore = 'null'::jsonb THEN COALESCE(campi_extra, '{}'::jsonb) - p_chiave
           ELSE jsonb_set(COALESCE(campi_extra, '{}'::jsonb), ARRAY[p_chiave], p_valore, true)
         END,
         updated_at = now()
   WHERE id = p_deal
  RETURNING campi_extra
$$;
REVOKE ALL ON FUNCTION public.sales_imposta_campo(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_imposta_campo(uuid, text, jsonb) TO service_role;

-- chi legge e chi scrive: come la 258, lettura a chi ha una sessione, nessuna
-- policy di scrittura
ALTER TABLE public.sales_campi ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sales_campi_lettura ON public.sales_campi;
CREATE POLICY sales_campi_lettura ON public.sales_campi FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.sales_campi TO authenticated;
GRANT ALL ON public.sales_campi TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- verifica: la tabella c'è (1), la colonna c'è (1), la funzione c'è (1)
SELECT
  (SELECT count(*) FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'sales_campi')                          AS tabella,
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'deals' AND column_name = 'campi_extra') AS colonna,
  (SELECT count(*) FROM pg_proc WHERE proname = 'sales_imposta_campo')                      AS funzione;
