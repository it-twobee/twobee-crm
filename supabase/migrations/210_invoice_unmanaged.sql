-- 210 — §281 · Una fattura può non essere né incassata né da incassare
--
-- L'archivio conosceva due stati: `paid_on` valorizzata (rientrata) o vuota (in
-- attesa). Sui dati veri ce n'è un terzo, e sono nove documenti su trentanove:
-- le quattro ISF duplicate, le note di credito che le annullano, la Gli
-- Artigiani stornata, la Tailors emessa due volte. Non sono crediti da
-- incassare — nessuno telefonerà mai per averli — e finché stavano fra gli
-- «in attesa» gonfiavano lo scaduto di 42.456 € e mandavano a inseguire soldi
-- che nessuno deve.
--
-- Non si cancellano: **esistono**, sono passati dallo SDI e il commercialista
-- li ha. Si dichiarano fuori dai conti, e con il **perché** accanto: una riga
-- esclusa senza una ragione è un numero che nessuno può più contestare, e fra
-- sei mesi nessuno saprà se era una scelta o una dimenticanza.
--
-- Perciò una colonna sola, di testo: c'è la ragione = è fuori; è NULL = è
-- dentro. Un booleano avrebbe retto lo stato e perso il motivo.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS excluded_reason TEXT;

COMMENT ON COLUMN public.invoices.excluded_reason IS
  '§281 — se valorizzata, la fattura è fuori dai conti: duplicata, stornata, giro fra società collegate. Il testo è il perché, e si legge in pagina accanto al documento.';

CREATE INDEX IF NOT EXISTS idx_invoices_excluded ON public.invoices (excluded_reason)
  WHERE excluded_reason IS NOT NULL;

NOTIFY pgrst, 'reload schema';
