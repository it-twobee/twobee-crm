-- 208 — §250 · Il PDF della fattura
--
-- L'XML è il documento che vale davanti all'erario, ma non è quello che si
-- guarda: nessuno legge un XML per capire cosa ha comprato. E per le fatture che
-- un XML non ce l'hanno — un fornitore estero, una ricevuta, Google Cloud — il
-- PDF **è** il documento, e senza un posto dove metterlo resta nella cartella
-- download di qualcuno.
--
-- Il file sta su MinIO sotto `invoices/<id>.<ext>`, non pubblico: il download
-- passa dal proxy autenticato, come per le buste paga. Qui si tiene solo la
-- chiave — un percorso in colonna non è un file, ed è l'unico modo perché
-- spostare lo storage domani non voglia dire migrare una tabella.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS pdf_path TEXT;

COMMENT ON COLUMN public.invoices.pdf_path IS
  '§250 — chiave del documento su MinIO (invoices/<id>.<ext>). NULL = solo XML, o nessun documento allegato.';

NOTIFY pgrst, 'reload schema';
