-- ═══════════════════════════════════════════════════════════════════════════
-- §212 · Fatturazione — la fattura si aggancia a tutte le aree, non a due
-- ═══════════════════════════════════════════════════════════════════════════
--
-- La 198 ha collegato la fattura a conto economico, costi e banca. Mancavano i
-- due estremi della catena, e sono quelli dove il documento serve di più:
--
--   · **la rata del contratto** — è il posto dove il ricavo *nasce*. Una rata che
--     scade e non ha una fattura è un incasso che nessuno ha chiesto; una fattura
--     senza rata è un ricavo che il contratto non prevedeva. Oggi il tool sa
--     entrambe le cose separatamente e non le confronta mai.
--
--   · **la fattura del collaboratore** — `hr_invoices` esiste dalla 182 e nasce
--     dalla stima: numero e data sono NULL finché qualcuno non li copia a mano
--     dal documento. Con l'aggancio non li copia più nessuno, e vale il principio
--     della §182 al contrario: non «il documento batte la stima» come regola
--     scritta, ma il documento **è** la riga.
--
-- Anche qui il campo sta su chi cita, non sulla fattura: una fattura può coprire
-- due rate, e una rata può essere fatturata in due tranche.

BEGIN;

ALTER TABLE public.revenue_installments
  ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL;
ALTER TABLE public.hr_invoices
  ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_rev_inst_invoice ON public.revenue_installments (invoice_id)
  WHERE invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hr_invoices_invoice ON public.hr_invoices (invoice_id)
  WHERE invoice_id IS NOT NULL;

COMMENT ON COLUMN public.revenue_installments.invoice_id IS
  '§212 — la fattura emessa per questa rata. Il contratto dice quanto e quando, la fattura dice che è stato chiesto davvero.';
COMMENT ON COLUMN public.hr_invoices.invoice_id IS
  '§212 — il documento vero dietro la riga di Personale. Quando c''è, numero, data e importi non si digitano: si leggono.';

-- ── Il collaboratore dietro una fattura ricevuta ────────────────────────────
-- `hr_people.vat_number` è quasi sempre vuoto — l'organico si compila col nome,
-- non con la partita IVA — quindi l'aggancio automatico passa dal **nome**, che
-- è il dato che c'è. È un suggerimento, non una verità: chi conferma decide.
CREATE OR REPLACE VIEW public.invoice_hr_hints AS
SELECT i.id AS invoice_id, p.id AS person_id, p.full_name
  FROM public.invoices i
  JOIN public.hr_people p
    ON p.is_active
   AND (
        (p.vat_number IS NOT NULL AND p.vat_number <> ''
         AND regexp_replace(p.vat_number, '\D', '', 'g') = regexp_replace(coalesce(i.counterparty_vat, ''), '\D', '', 'g'))
     OR lower(trim(p.full_name)) = lower(trim(i.counterparty_name))
   )
 WHERE i.direction = 'ricevuta';

COMMIT;
