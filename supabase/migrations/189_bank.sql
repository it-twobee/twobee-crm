-- 189 — Il conto corrente dentro il tool, e il conto virtuale che lo anticipa.
--
-- Fino a qui il conto economico diceva quanto era stato **fatturato** e quanto
-- risultava **incassato** secondo le spunte. Due numeri utili e nessuno dei due
-- è il saldo: il saldo lo dice la banca, e la banca era fuori dal tool. Il primo
-- estratto conto caricato ha trovato subito due errori — Affinity segnato pagato
-- per giugno e luglio quando in banca c'era solo il bonifico di maggio — e sono
-- 3.600 € che il tool credeva incassati.
--
-- Tre tabelle e una regola.
--
--   bank_accounts       i conti. Uno per ora, ma il saldo di apertura sta qui e
--                       non nel codice: senza, il saldo è un numero relativo.
--
--   bank_transactions   i movimenti. Tre sorgenti, e la differenza è tutto:
--                         'banca'    → letto dall'estratto conto. È la verità.
--                         'derivato' → nato da una spunta «incassato/pagato» nel
--                                      conto economico. È una dichiarazione: vale
--                                      finché la banca non la conferma.
--                         'manuale'  → scritto a mano, per quello che non passa
--                                      dal conto (contanti, carte di terzi).
--
--   La regola: **il saldo reale conta solo 'banca'**. Il saldo dichiarato conta
--   anche i derivati non ancora riconciliati, ed è quello che risponde a «quanto
--   ho, contando quello che ho già incassato ma non è ancora sull'estratto».
--   Tenerli separati è l'unico modo di non contare due volte lo stesso bonifico.
--
-- La riconciliazione: un movimento della banca si aggancia alla riga di ricavo o
-- di costo che lo giustifica. Quando l'aggancio avviene, il derivato corrispondente
-- si spegne da sé (trigger) — il bonifico esiste una volta sola.
--
-- Il previsionale NON sta qui: si calcola da rate e costi a piano (`lib/bank.ts`).
-- Scrivere in tabella una previsione significa avere due verità sul futuro, e
-- quando le rate cambiano nessuno si ricorda di riscrivere la previsione.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) I conti
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label            TEXT NOT NULL,
  bank_name        TEXT,
  iban_last4       TEXT,
  currency         TEXT NOT NULL DEFAULT 'EUR',
  /* Saldo alla data di apertura: i movimenti dopo lo muovono. Senza questo il
     saldo calcolato è solo la somma dei movimenti importati, che non è il saldo. */
  opening_balance  NUMERIC(14,2) NOT NULL DEFAULT 0,
  opening_date     DATE NOT NULL,
  is_primary       BOOLEAN NOT NULL DEFAULT false,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  note             TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) I movimenti
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.bank_transactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,

  -- data contabile e data valuta: la seconda decide gli interessi, la prima l'ordine
  booked_on     DATE NOT NULL,
  value_on      DATE,
  /* Segno: positivo entra, negativo esce. Un solo campo firmato invece di due
     colonne dare/avere — con due colonne metà delle query dimentica una delle due. */
  amount        NUMERIC(14,2) NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'EUR',

  -- come arriva dall'estratto conto
  causal_code   TEXT,
  description   TEXT NOT NULL,
  channel       TEXT,

  -- normalizzato all'import, perché «bon.da icuraimpresa s r l saldo fattura
  -- nr. f pr 28/26» non è leggibile e non è cercabile
  counterparty  TEXT,
  kind          TEXT NOT NULL DEFAULT 'altro' CHECK (kind IN (
                  'incasso','pagamento','stipendio','imposta','commissione',
                  'giroconto','finanziamento','altro')),
  /* numero fattura estratto dalla descrizione: è la chiave con cui il matching
     automatico trova la riga giusta */
  doc_ref       TEXT,

  -- da dove viene questo movimento
  source        TEXT NOT NULL DEFAULT 'banca' CHECK (source IN ('banca','derivato','manuale')),
  /* Impronta della riga dell'estratto conto: rende l'import idempotente. Due
     movimenti identici nello stesso giorno esistono (due bonifici uguali), quindi
     l'impronta include anche l'ordine di comparsa nel file. */
  import_hash   TEXT UNIQUE,

  -- riconciliazione: a quale riga del conto economico appartiene
  revenue_line_id UUID REFERENCES public.pl_revenue_lines(id) ON DELETE SET NULL,
  cost_line_id    UUID REFERENCES public.pl_cost_lines(id) ON DELETE SET NULL,
  payslip_id      UUID REFERENCES public.hr_payslips(id) ON DELETE SET NULL,
  hr_invoice_id   UUID REFERENCES public.hr_invoices(id) ON DELETE SET NULL,
  matched_at      TIMESTAMPTZ,
  matched_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  /* true = questo movimento non va riconciliato con niente (commissioni, bolli,
     giroconti). Senza, la lista dei «da riconciliare» resta piena di rumore. */
  no_match_needed BOOLEAN NOT NULL DEFAULT false,

  note          TEXT,
  created_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bank_tx_account_date ON public.bank_transactions (account_id, booked_on DESC);
CREATE INDEX IF NOT EXISTS idx_bank_tx_source       ON public.bank_transactions (source);
CREATE INDEX IF NOT EXISTS idx_bank_tx_revenue      ON public.bank_transactions (revenue_line_id);
CREATE INDEX IF NOT EXISTS idx_bank_tx_cost         ON public.bank_transactions (cost_line_id);
CREATE INDEX IF NOT EXISTS idx_bank_tx_doc          ON public.bank_transactions (doc_ref);

COMMENT ON COLUMN public.bank_transactions.source IS
  'banca = estratto conto (verità di cassa) · derivato = da una spunta pagato/incassato · manuale = scritto a mano.';

CREATE OR REPLACE FUNCTION public.bank_touch()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_bank_accounts_touch ON public.bank_accounts;
CREATE TRIGGER trg_bank_accounts_touch BEFORE UPDATE ON public.bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.bank_touch();
DROP TRIGGER IF EXISTS trg_bank_tx_touch ON public.bank_transactions;
CREATE TRIGGER trg_bank_tx_touch BEFORE UPDATE ON public.bank_transactions
  FOR EACH ROW EXECUTE FUNCTION public.bank_touch();

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) La spunta muove il conto virtuale
-- ═══════════════════════════════════════════════════════════════════════════
-- Segnare una fattura incassata è un fatto di cassa: deve comparire sul conto
-- senza che nessuno lo scriva due volte. Il movimento nasce **derivato** —
-- dichiarato, non confermato — e sparisce se la spunta viene togliata.
--
-- Se un movimento vero della banca è già agganciato a quella riga, il derivato
-- non si crea: il bonifico esiste una volta sola.

CREATE OR REPLACE FUNCTION public.bank_sync_revenue_line()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_account UUID;
  v_gross   NUMERIC(14,2);
  v_month   DATE;
  v_real    INT;
BEGIN
  SELECT id INTO v_account FROM bank_accounts
   WHERE is_active ORDER BY is_primary DESC, created_at LIMIT 1;
  IF v_account IS NULL THEN RETURN NEW; END IF;

  IF NEW.paid IS TRUE AND (OLD.paid IS DISTINCT FROM NEW.paid) THEN
    -- la banca ha già registrato questo incasso? allora niente derivato
    SELECT count(*) INTO v_real FROM bank_transactions
     WHERE revenue_line_id = NEW.id AND source = 'banca';
    IF v_real > 0 THEN RETURN NEW; END IF;

    -- sul conto entra il LORDO: l'IVA transita ma passa dalla banca
    v_gross := ROUND(NEW.amount_net * (1 + COALESCE(NEW.vat_rate, 0)), 2);
    SELECT month INTO v_month FROM pl_months WHERE id = NEW.month_id;

    INSERT INTO bank_transactions (
      account_id, booked_on, value_on, amount, description, counterparty,
      kind, source, revenue_line_id, note
    ) VALUES (
      v_account, COALESCE(v_month, CURRENT_DATE), COALESCE(v_month, CURRENT_DATE),
      v_gross, 'Incasso dichiarato — ' || NEW.label, NULL,
      'incasso', 'derivato', NEW.id,
      'Nato dalla spunta «incassato» nel conto economico: vale finché la banca non lo conferma.'
    );

  ELSIF NEW.paid IS NOT TRUE AND OLD.paid IS TRUE THEN
    -- spunta togliata: via il derivato, il movimento vero non si tocca
    DELETE FROM bank_transactions WHERE revenue_line_id = NEW.id AND source = 'derivato';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bank_sync_revenue ON public.pl_revenue_lines;
CREATE TRIGGER trg_bank_sync_revenue AFTER UPDATE OF paid ON public.pl_revenue_lines
  FOR EACH ROW EXECUTE FUNCTION public.bank_sync_revenue_line();

CREATE OR REPLACE FUNCTION public.bank_sync_cost_line()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_account UUID;
  v_gross   NUMERIC(14,2);
  v_month   DATE;
  v_real    INT;
BEGIN
  SELECT id INTO v_account FROM bank_accounts
   WHERE is_active ORDER BY is_primary DESC, created_at LIMIT 1;
  IF v_account IS NULL THEN RETURN NEW; END IF;

  IF NEW.paid IS TRUE AND (OLD.paid IS DISTINCT FROM NEW.paid) THEN
    SELECT count(*) INTO v_real FROM bank_transactions
     WHERE cost_line_id = NEW.id AND source = 'banca';
    IF v_real > 0 THEN RETURN NEW; END IF;

    -- esce il lordo se la spesa ha IVA: dal conto esce quello che paghi davvero
    v_gross := ROUND(COALESCE(NEW.actual, 0) *
      (CASE WHEN NEW.vat_applied THEN 1 + COALESCE(NEW.vat_rate, 0) ELSE 1 END), 2);
    IF v_gross = 0 THEN RETURN NEW; END IF;
    SELECT month INTO v_month FROM pl_months WHERE id = NEW.month_id;

    INSERT INTO bank_transactions (
      account_id, booked_on, value_on, amount, description, counterparty,
      kind, source, cost_line_id, note
    ) VALUES (
      v_account, COALESCE(v_month, CURRENT_DATE), COALESCE(v_month, CURRENT_DATE),
      -v_gross, 'Pagamento dichiarato — ' || NEW.label, NULLIF(NEW.note, ''),
      'pagamento', 'derivato', NEW.id,
      'Nato dalla spunta «pagato» nel conto economico: vale finché la banca non lo conferma.'
    );

  ELSIF NEW.paid IS NOT TRUE AND OLD.paid IS TRUE THEN
    DELETE FROM bank_transactions WHERE cost_line_id = NEW.id AND source = 'derivato';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bank_sync_cost ON public.pl_cost_lines;
CREATE TRIGGER trg_bank_sync_cost AFTER UPDATE OF paid ON public.pl_cost_lines
  FOR EACH ROW EXECUTE FUNCTION public.bank_sync_cost_line();

-- E il verso opposto: quando un movimento vero della banca si aggancia a una
-- riga, il derivato di quella riga non serve più e la riga risulta incassata.
CREATE OR REPLACE FUNCTION public.bank_on_match()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.source <> 'banca' THEN RETURN NEW; END IF;

  IF NEW.revenue_line_id IS NOT NULL THEN
    DELETE FROM bank_transactions
     WHERE revenue_line_id = NEW.revenue_line_id AND source = 'derivato';
    UPDATE pl_revenue_lines SET paid = true
     WHERE id = NEW.revenue_line_id AND paid IS NOT TRUE;
  END IF;

  IF NEW.cost_line_id IS NOT NULL THEN
    DELETE FROM bank_transactions
     WHERE cost_line_id = NEW.cost_line_id AND source = 'derivato';
    UPDATE pl_cost_lines SET paid = true
     WHERE id = NEW.cost_line_id AND paid IS NOT TRUE;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bank_on_match ON public.bank_transactions;
CREATE TRIGGER trg_bank_on_match AFTER INSERT OR UPDATE OF revenue_line_id, cost_line_id
  ON public.bank_transactions
  FOR EACH ROW EXECUTE FUNCTION public.bank_on_match();

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) RLS: è il dato più sensibile del tool
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.bank_accounts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bank_accounts_admin ON public.bank_accounts;
CREATE POLICY bank_accounts_admin ON public.bank_accounts FOR ALL
  USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS bank_tx_admin ON public.bank_transactions;
CREATE POLICY bank_tx_admin ON public.bank_transactions FOR ALL
  USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

-- il conto vero, col saldo di apertura alla costituzione
INSERT INTO public.bank_accounts (label, bank_name, currency, opening_balance, opening_date, is_primary, note)
SELECT 'Conto corrente Two Bee', 'Banca Valsabbina', 'EUR', 0, '2026-04-24', true,
       'Saldo di apertura zero al 24/04/2026: i conferimenti dei soci sono i primi movimenti.'
WHERE NOT EXISTS (SELECT 1 FROM public.bank_accounts);

COMMIT;

NOTIFY pgrst, 'reload schema';
