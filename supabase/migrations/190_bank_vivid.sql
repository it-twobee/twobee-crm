-- 190 — Vivid: il conto delle spese, alimentato da un bonifico ricorrente.
--
-- Marketing, tool e software non si pagano dal conto principale: si pagano da un
-- conto dedicato che ogni mese riceve un bonifico e da lì in poi vive di carte e
-- addebiti. È una scelta di ordine — le trenta spese da novanta euro non si
-- mescolano coi bonifici da seimila — e diventa una scelta di controllo: se il
-- conto delle spese si svuota, il problema si vede lì e non dentro il saldo
-- generale.
--
-- Tre cose servono perché il tool lo sappia leggere.
--
--   1) UN GIROCONTO HA DUE LATI. Il bonifico esce dal conto principale ed entra su
--      Vivid: sono due movimenti dello stesso fatto. Vanno collegati, altrimenti
--      la lista dei «da riconciliare» li chiede entrambi e la liquidità totale
--      sembra scendere. `transfer_pair_id` li lega; `transfer_account_id` dice
--      dove va (o da dove viene).
--
--   2) OGNI CONTO SA COSA PAGA. Vivid copre le aree «Marketing TwoBee» e
--      «Struttura & Software»: da lì nasce il fabbisogno del bonifico ricorrente —
--      la somma delle spese di quelle aree che cadono nel mese — e la
--      riconciliazione propone solo i costi di quelle aree, non tutti.
--
--   3) IL BONIFICO RICORRENTE È UN DATO, NON UNA CONSUETUDINE. Da quale conto,
--      che giorno, quanto: scritto, entra nella previsione di cassa di entrambi i
--      conti. Se il fabbisogno cresce e il bonifico resta fermo, il tool lo dice
--      prima che la carta venga rifiutata.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) I due lati di un giroconto
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS transfer_pair_id    UUID REFERENCES public.bank_transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS transfer_account_id UUID REFERENCES public.bank_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bank_tx_pair ON public.bank_transactions (transfer_pair_id);

COMMENT ON COLUMN public.bank_transactions.transfer_pair_id IS
  'L''altro lato dello stesso giroconto: uscita sul conto di partenza, entrata su quello di arrivo.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) Il bonifico ricorrente che alimenta un conto
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.bank_accounts
  -- da quale conto arriva la provvista
  ADD COLUMN IF NOT EXISTS funding_from_id UUID REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  -- giorno del mese e importo del bonifico ricorrente
  ADD COLUMN IF NOT EXISTS funding_day     INT CHECK (funding_day BETWEEN 1 AND 28),
  ADD COLUMN IF NOT EXISTS funding_amount  NUMERIC(12,2),
  /* A cosa serve questo conto, in una riga. Compare in testa alla sezione: un
     conto senza uno scopo scritto diventa il posto dove finisce tutto. */
  ADD COLUMN IF NOT EXISTS purpose         TEXT;

COMMENT ON COLUMN public.bank_accounts.funding_day IS
  'Giorno del mese del bonifico ricorrente. Max 28: il 29, 30 e 31 non esistono in tutti i mesi.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) Quali aree di spesa paga ciascun conto
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.bank_account_centers (
  account_id UUID NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  center_id  UUID NOT NULL REFERENCES public.cost_centers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, center_id)
);

COMMENT ON TABLE public.bank_account_centers IS
  'Aree del piano dei costi pagate da un conto. Alimenta il fabbisogno del bonifico ricorrente e restringe i candidati della riconciliazione.';

ALTER TABLE public.bank_account_centers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bank_account_centers_admin ON public.bank_account_centers;
CREATE POLICY bank_account_centers_admin ON public.bank_account_centers FOR ALL
  USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) Il conto Vivid
-- ═══════════════════════════════════════════════════════════════════════════
-- Saldo di apertura zero: il conto nasce col primo bonifico dal principale, e
-- quei bonifici sono già sull'estratto conto di luglio (1.000 il 14, 500 il 30).
INSERT INTO public.bank_accounts (
  label, bank_name, currency, opening_balance, opening_date, is_primary, purpose, funding_day, note
)
SELECT
  'Vivid — spese marketing e software', 'Vivid Money', 'EUR', 0, '2026-07-01', false,
  'Paga marketing, tool e software: trenta spese da novanta euro non si mescolano coi bonifici da seimila. Riceve un bonifico ricorrente dal conto principale.',
  14,
  'Il fabbisogno del bonifico lo calcola il piano dei costi delle aree collegate: se cresce e il bonifico resta fermo, la sezione lo dice.'
WHERE NOT EXISTS (SELECT 1 FROM public.bank_accounts WHERE label ILIKE 'Vivid%');

-- la provvista arriva dal conto principale
UPDATE public.bank_accounts v
   SET funding_from_id = (SELECT id FROM public.bank_accounts WHERE is_primary LIMIT 1)
 WHERE v.label ILIKE 'Vivid%' AND v.funding_from_id IS NULL;

-- e paga marketing, software e struttura
INSERT INTO public.bank_account_centers (account_id, center_id)
SELECT v.id, c.id
  FROM public.bank_accounts v
  JOIN public.cost_centers c
    ON c.name ILIKE '%Marketing%' OR c.name ILIKE '%Software%' OR c.name ILIKE '%Struttura%'
 WHERE v.label ILIKE 'Vivid%'
ON CONFLICT DO NOTHING;

/* I due bonifici a «two bee societa a responsabilita» di luglio sono la provvista
   di Vivid: si marcano giroconti verso quel conto, così la liquidità totale non
   sembra scendere e la lista dei da riconciliare non li richiede. Il lato in
   entrata su Vivid lo crea l'app quando si conferma il giroconto: qui si dichiara
   solo la destinazione. */
UPDATE public.bank_transactions t
   SET kind = 'giroconto',
       transfer_account_id = (SELECT id FROM public.bank_accounts WHERE label ILIKE 'Vivid%' LIMIT 1),
       no_match_needed = true
 WHERE t.source = 'banca'
   AND t.amount < 0
   AND t.description ILIKE '%favore two bee societa%'
   AND t.transfer_account_id IS NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';
