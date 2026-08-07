-- ═══════════════════════════════════════════════════════════════════════════
-- §211 · Fatture — l'archivio che viene dallo SdI
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Fino a qui il tool sapeva quanto **doveva** entrare (i contratti) e quanto era
-- **uscito** dal conto (la banca). Della fattura vera — il documento che fa fede
-- davanti all'erario — non sapeva niente: il numero, la data, l'IVA per aliquota,
-- la scadenza, il codice natura di un'esenzione. Erano dati che vivevano nel
-- cassetto del commercialista, e ogni riconciliazione partiva da un'ipotesi.
--
-- Il file XML dello SdI è l'unica copia certa. Da qui nasce la sezione, e da qui
-- devono nascere i collegamenti: una riga di conto economico, un movimento di
-- banca e una voce di costo che parlano della **stessa** fattura devono poterlo
-- dimostrare, non assomigliarsi.
--
-- Tre regole scritte nello schema:
--
--   · `doc_key` è unico. Una fattura è identificata da chi la emette, il tipo, il
--     numero e la data — non dal file, che lo SdI rinomina a ogni scarico, e non
--     dall'importo, perché una fattura corretta e ritrasmessa resta la stessa.
--   · l'XML si **conserva**. Occupa poco e vale come prova: un campo si può
--     sbagliare a leggere, il file no. Da lì si rilegge tutto senza richiederlo.
--   · i collegamenti stanno sulle righe che collegano, non sulla fattura: una
--     fattura può coprire due mesi di conto economico e un bonifico può pagarne
--     tre. Mettere `pl_line_id` sulla fattura avrebbe imposto l'uno-a-uno che la
--     realtà non ha.

BEGIN;

-- La partita IVA di casa: decide il **verso** di ogni documento importato. Sta
-- in configurazione perché è un dato dell'azienda, non una costante del codice —
-- e perché sbagliarla archivierebbe ogni fattura emessa fra le ricevute.
ALTER TABLE public.pl_config
  ADD COLUMN IF NOT EXISTS company_vat TEXT NOT NULL DEFAULT '11030281213';

CREATE TABLE IF NOT EXISTS public.invoices (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 'emessa' = la partita IVA di chi emette è la nostra. Si decide leggendo il
  -- file, non dal nome: quello porta l'id di chi trasmette, spesso lo studio.
  direction     TEXT NOT NULL CHECK (direction IN ('emessa', 'ricevuta')),
  doc_type      TEXT NOT NULL DEFAULT 'TD01',
  number        TEXT NOT NULL,
  issued_on     DATE NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'EUR',

  -- chi c'è dall'altra parte: cliente sulle emesse, fornitore sulle ricevute
  counterparty_name TEXT NOT NULL,
  counterparty_vat  TEXT,
  counterparty_tax  TEXT,
  counterparty_city TEXT,
  counterparty_addr TEXT,

  -- l'aggancio all'anagrafica, quando la partita IVA lo permette. Resta NULL su
  -- ristoranti e fornitori occasionali, e non è un difetto: non tutti i soggetti
  -- con cui si scambia una fattura sono clienti.
  client_id     UUID REFERENCES public.clients(id) ON DELETE SET NULL,

  taxable       NUMERIC(12,2) NOT NULL DEFAULT 0,
  vat_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
  total         NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- true = il totale non era nel file ed è stato ricostruito da imponibile+imposta
  total_derived BOOLEAN NOT NULL DEFAULT false,
  stamp         NUMERIC(10,2) NOT NULL DEFAULT 0,
  withholding   NUMERIC(12,2) NOT NULL DEFAULT 0,
  fund_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- §211: TD04/TD08 valgono meno di zero. Ridondante col tipo, ma è la colonna
  -- su cui si somma, e una somma non deve conoscere la tabella dei codici.
  sign          SMALLINT NOT NULL DEFAULT 1 CHECK (sign IN (1, -1)),

  due_date        DATE,
  payment_method  TEXT,
  payment_terms   TEXT,

  -- Lo stato lo decide chi guarda il conto: `paid_on` è il fatto, non un'opinione.
  paid_on       DATE,
  -- pagata/incassata solo in parte: succede sulle rate e sugli acconti
  paid_amount   NUMERIC(12,2),

  notes         TEXT,
  attachments   TEXT[],
  sdi_progressive TEXT,
  sdi_recipient   TEXT,

  -- l'impronta: emittente | tipo | numero | data
  doc_key       TEXT NOT NULL UNIQUE,
  source_file   TEXT,
  -- il file com'è arrivato: è la prova, e permette di rileggere tutto domani
  raw_xml       TEXT,
  -- cosa non tornava nel documento al momento della lettura
  warnings      TEXT[],

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID REFERENCES public.profiles(id),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_dir_date ON public.invoices (direction, issued_on DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_client   ON public.invoices (client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_vat      ON public.invoices (counterparty_vat);
CREATE INDEX IF NOT EXISTS idx_invoices_due      ON public.invoices (due_date) WHERE paid_on IS NULL;

COMMENT ON TABLE public.invoices IS
  'Fatture elettroniche lette dall''XML dello SdI. Emesse e ricevute nella stessa tabella: la domanda «quanto ho fatturato» e «quanto mi hanno fatturato» hanno la stessa forma.';

-- ── Le righe: cosa è stato venduto o comprato ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.invoice_lines (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  line_no     INTEGER NOT NULL,
  description TEXT NOT NULL,
  quantity    NUMERIC(12,4),
  unit_price  NUMERIC(12,4),
  total       NUMERIC(12,2) NOT NULL DEFAULT 0,
  vat_rate    NUMERIC(5,2) NOT NULL DEFAULT 0,
  natura      TEXT,
  period_from DATE,
  period_to   DATE,
  UNIQUE (invoice_id, line_no)
);

-- ── Il riepilogo IVA: per aliquota, che è il modo in cui l'erario la chiede ──
CREATE TABLE IF NOT EXISTS public.invoice_vat (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  rate          NUMERIC(5,2) NOT NULL DEFAULT 0,
  taxable       NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax           NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- perché l'IVA non c'è: senza, uno zero sembra una dimenticanza
  natura        TEXT,
  collectability TEXT
);
CREATE INDEX IF NOT EXISTS idx_invoice_vat_inv ON public.invoice_vat (invoice_id);

-- ── Le scadenze: una fattura può averne più d'una ───────────────────────────
CREATE TABLE IF NOT EXISTS public.invoice_installments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  due_date    DATE,
  amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  method      TEXT,
  iban        TEXT,
  paid_on     DATE
);
CREATE INDEX IF NOT EXISTS idx_invoice_inst_inv ON public.invoice_installments (invoice_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- I collegamenti: la stessa fattura vista dalle tre sezioni
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Non un campo sulla fattura ma un campo su chi la cita, perché il rapporto è
-- molti-a-molti in entrambi i versi: un canone annuale copre dodici mesi di
-- conto economico, e un bonifico unico salda tre fatture.

ALTER TABLE public.pl_revenue_lines
  ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL;
ALTER TABLE public.pl_cost_lines
  ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL;
ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pl_revenue_invoice ON public.pl_revenue_lines (invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pl_cost_invoice    ON public.pl_cost_lines (invoice_id)    WHERE invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bank_tx_invoice    ON public.bank_transactions (invoice_id) WHERE invoice_id IS NOT NULL;

COMMENT ON COLUMN public.pl_revenue_lines.invoice_id IS
  '§211 — la fattura vera dietro questa riga. Il contratto dice quanto deve entrare, la fattura dice cosa è stato emesso: quando divergono, vince il documento.';
COMMENT ON COLUMN public.bank_transactions.invoice_id IS
  '§211 — la fattura che questo movimento salda. Distinta da pl_line_id: il bonifico paga una fattura, e la fattura sta in un mese di conto economico.';

-- ── Chi tocca le fatture: solo admin ────────────────────────────────────────
ALTER TABLE public.invoices             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_lines        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_vat          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_installments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invoices_admin       ON public.invoices;
DROP POLICY IF EXISTS invoice_lines_admin  ON public.invoice_lines;
DROP POLICY IF EXISTS invoice_vat_admin    ON public.invoice_vat;
DROP POLICY IF EXISTS invoice_inst_admin   ON public.invoice_installments;

CREATE POLICY invoices_admin ON public.invoices FOR ALL
  USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');
CREATE POLICY invoice_lines_admin ON public.invoice_lines FOR ALL
  USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');
CREATE POLICY invoice_vat_admin ON public.invoice_vat FOR ALL
  USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');
CREATE POLICY invoice_inst_admin ON public.invoice_installments FOR ALL
  USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

-- ── L'aggancio all'anagrafica per partita IVA ───────────────────────────────
-- Si fa al momento dell'import, ma anche dopo: un cliente censito domani deve
-- ritrovarsi le fatture di ieri, senza reimportare niente.
CREATE OR REPLACE FUNCTION public.link_invoices_to_clients()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n INTEGER;
BEGIN
  UPDATE invoices i SET client_id = c.id
    FROM clients c
   WHERE i.client_id IS NULL
     AND i.counterparty_vat IS NOT NULL
     AND regexp_replace(c.piva, '\D', '', 'g') = regexp_replace(i.counterparty_vat, '\D', '', 'g')
     AND c.piva IS NOT NULL AND c.piva <> '';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

COMMIT;
