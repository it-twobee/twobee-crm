-- §384 — una distinta paga più cedolini, e finora non si poteva dirlo.
--
-- Gli stipendi escono dal conto in **una riga sola**: «vostra disposizione …
-- favore beneficiari vari distinta», 3.945 €, e dentro ci sono tre persone.
-- Su `bank_transactions` c'era `payslip_id`, singolo, e soprattutto non lo
-- scriveva nessuno: serviva solo a togliere un movimento dai «da
-- riconciliare», ma niente lo popolava. Risultato: sette distinte da giugno
-- a settembre, per ventitremila euro, tutte senza una risposta alla domanda
-- «di chi sono questi soldi».
--
-- **L'importo sta sul collegamento, non sul cedolino.** I cedolini in
-- archivio sono PDF caricati con `amount` a zero: nessuno sa quanto è stato
-- pagato a chi. Scrivere la cifra qui, mentre si collega, la rende
-- verificabile — la somma dei collegamenti deve fare la distinta, e se non
-- torna o manca una persona o una cifra è sbagliata. È la differenza fra un
-- aggancio che controlla e uno che si limita a dichiarare.
--
-- Non si scrive su `payslips.amount` perché non sono la stessa cosa: una
-- distinta può pagare un arretrato, mezzo mese o due mensilità insieme, e
-- quel campo direbbe una cosa per un'altra. Qui dentro c'è **quanto è uscito
-- dal conto con quel bonifico**, che è l'unica cosa che il conto sa.
--
-- **Un cedolino sta in una distinta sola** (indice unico): più movimenti che
-- si prendono lo stesso cedolino vuol dire pagarlo due volte, e il costo del
-- personale raddoppierebbe senza che nessuno lo cerchi. Una distinta invece
-- tiene quanti cedolini vuole: è il suo mestiere.
--
-- Rilanciabile.

BEGIN;

CREATE TABLE IF NOT EXISTS public.bank_tx_payslips (
  tx_id      uuid NOT NULL REFERENCES public.bank_transactions(id) ON DELETE CASCADE,
  payslip_id uuid NOT NULL REFERENCES public.payslips(id)          ON DELETE CASCADE,
  -- quanto di questo bonifico è andato a questa persona
  amount     numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (tx_id, payslip_id)
);

-- un cedolino si paga una volta sola
CREATE UNIQUE INDEX IF NOT EXISTS bank_tx_payslips_una_volta
  ON public.bank_tx_payslips (payslip_id);

CREATE INDEX IF NOT EXISTS bank_tx_payslips_tx_idx
  ON public.bank_tx_payslips (tx_id);

ALTER TABLE public.bank_tx_payslips ENABLE ROW LEVEL SECURITY;

-- Nessuna policy: ci legge e ci scrive solo il service role, dalle server
-- action che passano da `requireEconomicsAdmin`. Come `deal_owners` (236) e
-- `sales_sheet_ignored` (239): non e una dimenticanza.

COMMIT;

-- verifica: la tabella c'e, e chiusa, e il vincolo del cedolino unico regge
SELECT
  (SELECT count(*) FROM information_schema.tables
    WHERE table_schema='public' AND table_name='bank_tx_payslips')   AS tabella,
  (SELECT count(*) FROM pg_policies
    WHERE schemaname='public' AND tablename='bank_tx_payslips')      AS policy_attese_zero,
  (SELECT count(*) FROM pg_indexes
    WHERE schemaname='public' AND indexname='bank_tx_payslips_una_volta') AS indice_unico;
