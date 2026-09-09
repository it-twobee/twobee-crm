-- ═══════════════════════════════════════════════════════════════════════════
-- 219 — §323 · Lo stato di una fattura, e la nota che la storna
-- ═══════════════════════════════════════════════════════════════════════════
--
-- L'archivio conosceva due assi e mezzo: `paid_on` (rientrata o no), `due_date`
-- (scaduta o no) e `excluded_reason` (§281, fuori dai conti). Mancavano le due
-- cose che sui dati veri decidono davvero se un credito esiste.
--
-- ── 1 · La nota di credito dice **quale** fattura annulla, e nessuno la leggeva
--
-- `DatiFattureCollegate` è nel tracciato FatturaPA e in questo archivio è
-- compilato su **tutte** le TD04: la FPR 56/26 dichiara di stornare la FPR
-- 41/26 del 3 luglio. Finché quel campo restava nell'XML e non in tabella, il
-- legame lo ricostruiva una persona scrivendo a mano una ragione di esclusione
-- su una delle due righe — ed è andata male esattamente come va male sempre una
-- regola tenuta a mano in due posti:
--
--   · **Tailors**: FPR 51/26 esclusa, la sua nota FPR 52/26 no. La nota toglieva
--     2.440 € da un mese da cui la fattura era già uscita. Fatturato **sotto**
--     di 2.440.
--   · **Affinity**: FPR 45/26 (la nota) esclusa, la FPR 31/26 che annulla no, e
--     accanto la nota di debito FPR 47/26 che rifattura lo stesso servizio.
--     Giugno contava 4.392 dove il documento dice 2.196. Fatturato **sopra** di
--     2.196.
--
-- Due errori di segno opposto, nati dallo stesso gesto, in un archivio di
-- ottantasei documenti che nessuno aveva ragione di sospettare. È «un numero
-- plausibile e sbagliato», la sola categoria che nessuno va a controllare.
--
-- Da qui il legame è **derivato**: `rectifies_id` lo scrive la funzione leggendo
-- il documento, e una fattura stornata smette di essere un credito senza che
-- nessuno debba dirlo. L'esclusione a mano resta per ciò che il documento non
-- spiega — un duplicato mai stornato, un giro fra società collegate.
--
-- ── 2 · «Emessa» e «inviata» non sono la stessa cosa
--
-- Un file che torna dallo SdI **è** la prova di essere partito: se ce l'abbiamo,
-- è transitato. Una fattura scritta a mano (§247) no, e fino a ieri le due
-- stavano nella stessa lista senza distinguersi. `from_sdi` è generata dal
-- fatto — c'è l'XML o non c'è — perché uno stato che si può digitare è uno stato
-- di cui fidarsi a metà.
--
-- La **data** dell'invio non sta nell'XML, e non la si inventa: `sent_on` resta
-- NULL sui documenti dello SdI, ed è lì per le fatture a mano, dove l'unico che
-- sa quando è partita è chi l'ha mandata.

BEGIN;

-- ── Il viaggio del documento ────────────────────────────────────────────────
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS sent_on DATE;

COMMENT ON COLUMN public.invoices.sent_on IS
  '§323 — quando il documento è partito, quando a saperlo è solo una persona. Sui file dello SdI resta NULL: il file stesso è la prova del transito, e la data dentro non c''è. Una data inventata qui sarebbe peggio di nessuna data.';

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS from_sdi BOOLEAN
  GENERATED ALWAYS AS (raw_xml IS NOT NULL) STORED;

COMMENT ON COLUMN public.invoices.from_sdi IS
  '§323 — true = il documento è arrivato come XML dello SdI, quindi è transitato per forza. Generata, non scritta: è un fatto sul file, e un fatto non si digita.';

-- ── Quello che il documento dichiara di rettificare ─────────────────────────
-- Tabella e non colonna: `DatiFattureCollegate` è ripetibile — una nota può
-- coprire due fatture — e su una fattura ordinaria lo stesso campo cita un DDT
-- o un ordine, che non è uno storno. Si conserva com'è scritto; il significato
-- lo dà il tipo del documento, non la presenza del campo.
CREATE TABLE IF NOT EXISTS public.invoice_related (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  -- il numero come lo scrive il documento: «FPR 41/26»
  doc_id      TEXT NOT NULL,
  doc_date    DATE,
  -- la riga, quando lo storno è parziale
  line_no     INTEGER,
  UNIQUE (invoice_id, doc_id, doc_date)
);
CREATE INDEX IF NOT EXISTS idx_invoice_related_inv ON public.invoice_related (invoice_id);

COMMENT ON TABLE public.invoice_related IS
  '§323 — DatiFattureCollegate, come il documento lo dichiara. Grezzo: la risoluzione all''archivio sta in invoices.rectifies_id, e le due cose restano distinte perché un riferimento a una fattura che non abbiamo è un''informazione, non un errore.';

-- ── Il legame risolto: questa nota storna quella fattura ────────────────────
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS rectifies_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_rectifies ON public.invoices (rectifies_id)
  WHERE rectifies_id IS NOT NULL;

COMMENT ON COLUMN public.invoices.rectifies_id IS
  '§323 — la fattura che questa nota di credito o di debito rettifica, risolta nell''archivio. La scrive link_invoice_rectifications() leggendo invoice_related: nessuno la digita, e una fattura stornata smette di essere un credito da sola.';

-- ── La risoluzione ──────────────────────────────────────────────────────────
-- Si aggancia per **numero e controparte**, non per importo: una nota parziale
-- ha un importo diverso dalla fattura che rettifica, ed è il caso in cui il
-- legame serve di più. La data è un tie-break, non un requisito: dove il
-- documento la omette il numero resta univoco dentro la stessa controparte.
--
-- Come `link_invoices_to_clients`, si può rilanciare: un documento importato
-- domani ritrova la nota che lo stornava ieri, senza reimportare niente.
CREATE OR REPLACE FUNCTION public.link_invoice_rectifications()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n INTEGER;
BEGIN
  UPDATE invoices nota
     SET rectifies_id = t.target_id
    FROM (
      SELECT DISTINCT ON (r.invoice_id)
             r.invoice_id, f.id AS target_id
        FROM invoice_related r
        JOIN invoices nc ON nc.id = r.invoice_id
        JOIN invoices f
          ON f.id <> nc.id
         AND f.direction = nc.direction
         AND upper(regexp_replace(f.number, '\s', '', 'g'))
           = upper(regexp_replace(r.doc_id, '\s', '', 'g'))
         AND coalesce(nullif(regexp_replace(coalesce(f.counterparty_vat, ''), '\D', '', 'g'), ''),
                      upper(f.counterparty_name))
           = coalesce(nullif(regexp_replace(coalesce(nc.counterparty_vat, ''), '\D', '', 'g'), ''),
                      upper(nc.counterparty_name))
       WHERE nc.doc_type IN ('TD04', 'TD08', 'TD05', 'TD09')
       -- a parità di numero vince quella con la data dichiarata dal documento
       ORDER BY r.invoice_id, (f.issued_on IS NOT DISTINCT FROM r.doc_date) DESC, f.issued_on
    ) t
   WHERE nota.id = t.invoice_id
     AND nota.rectifies_id IS DISTINCT FROM t.target_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

ALTER TABLE public.invoice_related ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invoice_related_admin ON public.invoice_related;
CREATE POLICY invoice_related_admin ON public.invoice_related FOR ALL
  USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

COMMIT;

NOTIFY pgrst, 'reload schema';
