-- 209 — §258 · Un movimento su più righe
--
-- Finora il legame era una colonna sul movimento: `revenue_line_id` o
-- `cost_line_id`, una sola. Va bene nel caso semplice e mente in tutti gli
-- altri, che sui dati veri sono la maggioranza:
--
--   · iCura paga **8.784 €** il 9 giugno = due mensilità da 4.392. Il movimento
--     poteva puntare a una riga sola, quindi la seconda restava «spuntata senza
--     movimento» e la si raccontava in una nota.
--   · Fatima Leo paga **3.812,50 €** = growth 1.830 + marketing 1.982,50.
--   · Ventisei addebiti Meta stanno su **una** riga: quello funzionava già,
--     perché il verso molti-a-uno la colonna lo regge.
--
-- Quello che mancava è l'altro verso. Qui il legame diventa una **riga sua**,
-- con l'importo allocato: un movimento si spalma su N righe, una riga raccoglie
-- N movimenti, e la somma delle allocazioni dice quanto è coperto. Senza
-- l'importo la tabella direbbe solo «questi due si conoscono», che è la metà
-- inutile dell'informazione: 8.784 su due righe non è 8.784 su ciascuna.
--
-- Le colonne vecchie **restano** e continuano a valere come legame principale:
-- le legge il trigger `bank_on_match` (189), le legge la certificazione (226),
-- le leggono tre pagine. Toglierle qui vorrebbe dire riscrivere tutto in una
-- migration, che è il modo in cui si rompe un dominio che funziona.

CREATE TABLE IF NOT EXISTS public.bank_tx_lines (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tx_id      UUID NOT NULL REFERENCES public.bank_transactions(id) ON DELETE CASCADE,
  -- la riga: una delle due, mai tutte e due
  revenue_line_id UUID REFERENCES public.pl_revenue_lines(id) ON DELETE CASCADE,
  cost_line_id    UUID REFERENCES public.pl_cost_lines(id) ON DELETE CASCADE,
  -- **quanto** di quel movimento paga questa riga, sempre positivo
  amount     NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  -- una riga o l'altra, non nessuna e non entrambe: un legame che non sa a cosa
  -- punta è un legame che qualcuno leggerà come vuole
  CONSTRAINT bank_tx_lines_one_side CHECK (
    (revenue_line_id IS NOT NULL) <> (cost_line_id IS NOT NULL)
  )
);

-- Lo stesso movimento non si allega due volte alla stessa riga: sarebbe un
-- pagamento contato due volte, ed è l'errore che nessuno va a cercare.
CREATE UNIQUE INDEX IF NOT EXISTS bank_tx_lines_rev_uniq
  ON public.bank_tx_lines (tx_id, revenue_line_id) WHERE revenue_line_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS bank_tx_lines_cost_uniq
  ON public.bank_tx_lines (tx_id, cost_line_id) WHERE cost_line_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS bank_tx_lines_tx ON public.bank_tx_lines (tx_id);
CREATE INDEX IF NOT EXISTS bank_tx_lines_rev ON public.bank_tx_lines (revenue_line_id);
CREATE INDEX IF NOT EXISTS bank_tx_lines_cost ON public.bank_tx_lines (cost_line_id);

COMMENT ON TABLE public.bank_tx_lines IS
  '§258 — legame N:N fra movimenti e righe di conto economico, con l''importo allocato. Un bonifico cumulativo si spalma su più righe; una riga raccoglie più addebiti. Le colonne revenue_line_id/cost_line_id su bank_transactions restano il legame principale.';
COMMENT ON COLUMN public.bank_tx_lines.amount IS
  'Quanto di questo movimento paga questa riga. Sempre positivo: il verso lo dice già il movimento.';

ALTER TABLE public.bank_tx_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bank_tx_lines_admin ON public.bank_tx_lines;
CREATE POLICY bank_tx_lines_admin ON public.bank_tx_lines
  FOR ALL USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

-- ── il travaso di quello che c'è già ────────────────────────────────────────
-- Ogni legame singolo diventa una riga di questa tabella, con l'importo pieno
-- del movimento. Non è una copia inutile: da qui in avanti la somma delle
-- allocazioni è **la** risposta a «quanto è coperto», e se i legami vecchi
-- restassero fuori quella somma direbbe zero su ottanta righe già riconciliate.
INSERT INTO public.bank_tx_lines (tx_id, revenue_line_id, amount, note)
SELECT t.id, t.revenue_line_id, ABS(t.amount), 'Travasato dal legame singolo (209)'
FROM public.bank_transactions t
WHERE t.revenue_line_id IS NOT NULL AND ABS(t.amount) > 0
ON CONFLICT DO NOTHING;

INSERT INTO public.bank_tx_lines (tx_id, cost_line_id, amount, note)
SELECT t.id, t.cost_line_id, ABS(t.amount), 'Travasato dal legame singolo (209)'
FROM public.bank_transactions t
WHERE t.cost_line_id IS NOT NULL AND ABS(t.amount) > 0
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
