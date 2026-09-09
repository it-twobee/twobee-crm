-- ═══════════════════════════════════════════════════════════════════════════
-- 220 — §326 · Non tutti gli «interni» sono la stessa cosa
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `clients.is_internal` dice «non conta nelle statistiche» (§213) e sotto quella
-- parola stanno due cose che non si somigliano:
--
--   · **GAV Sistemi** ha una partita IVA vera (01861100608) e una fattura emessa
--     da 3.660 €. Non è un cliente: è un **giro di fatture fra società
--     collegate**. Fattura davvero, e quel documento sta nel registro IVA.
--   · **Twobee, Metroquadro, Visionark, Costruisci e arreda** non hanno partita
--     IVA, non hanno fatture e hanno solo progetti: sono i **marchi e i lavori
--     interni** di TwoBee. Non fatturano niente e non fattureranno mai.
--
-- Metterli nella stessa lista dei clienti fa due danni opposti. Al primo si
-- chiede «da quotare» — e non c'è niente da quotare, il canone non esiste per
-- definizione. Al secondo si chiede lo stato dei pagamenti — e non c'è nessun
-- pagamento, perché non c'è nessuna fattura.
--
-- Dedurlo dalla partita IVA funzionerebbe **oggi**: domani un marchio interno
-- prende una partita IVA e diventa un giro senza che nessuno l'abbia deciso.
-- La differenza è una scelta di chi tiene i conti, non una proprietà del dato,
-- e per questo si dichiara.

BEGIN;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS internal_kind TEXT
  CHECK (internal_kind IN ('giro', 'progetto'));

COMMENT ON COLUMN public.clients.internal_kind IS
  '§326 — che genere di interno è, quando is_internal. «giro» = società collegata che fattura davvero (GAV Sistemi); «progetto» = marchio o lavoro interno di TwoBee, che non fattura. NULL su un cliente vero. Non si deduce dalla partita IVA: è una scelta di chi tiene i conti.';

-- Il backfill segue i documenti, non i nomi: chi ha emesso o ricevuto una
-- fattura è un giro, chi ha solo progetti è un lavoro interno.
UPDATE public.clients c SET internal_kind = 'giro'
 WHERE c.is_internal
   AND c.internal_kind IS NULL
   AND EXISTS (SELECT 1 FROM public.invoices i WHERE i.client_id = c.id);

UPDATE public.clients SET internal_kind = 'progetto'
 WHERE is_internal AND internal_kind IS NULL;

CREATE INDEX IF NOT EXISTS idx_clients_internal_kind ON public.clients (internal_kind)
  WHERE internal_kind IS NOT NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';
