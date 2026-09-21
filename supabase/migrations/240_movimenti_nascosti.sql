-- §381 — i movimenti che il conto ha, e i conti non devono vedere.
--
-- La §380 li teneva **fuori dall'archivio**: la regola scartava le righe
-- all'import e non entravano. Funzionava per le statistiche e rompeva il
-- saldo — i soldi dal conto erano usciti davvero, quindi il totale letto qui
-- restava più alto di quello della banca di tutto l'importo escluso. Su un
-- conto spese, 104,95 € di scarto su 381,43 € sono un quarto del saldo: non
-- è un dettaglio, è un numero su cui non ci si può appoggiare.
--
-- La domanda giusta non era «entrano o non entrano»: era **in quale dei due
-- mestieri di questa tabella** devono comparire. `bank_transactions` fa due
-- lavori insieme — dice quanti soldi ci sono (cassa) e dice a cosa sono
-- serviti (costi). Una spesa personale finita per errore sulla carta della
-- società è un fatto di cassa vero e un costo che non esiste: deve pesare
-- sul saldo e sparire da tutto il resto.
--
-- Quindi la riga entra, e porta scritto **perché non si guarda**. Il campo è
-- un testo e non un `boolean`: «nascosto = true» sopravvive sei mesi e poi
-- nessuno sa più di cosa si trattava, mentre «Google Play 20,99 €: addebiti
-- per errore» si legge da solo il giorno che qualcuno chiede perché il conto
-- economico non torna con l'estratto.
--
-- Chi la legge e chi no, dal codice:
--   · saldo, liquidità, ponte di cassa  → la contano  (i soldi sono usciti)
--   · elenco movimenti, famiglie di spesa, spinta a costo, riconciliazione
--                                        → la saltano (non è roba nostra)
--
-- Rilanciabile.

BEGIN;

ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS hidden_reason text;

COMMENT ON COLUMN public.bank_transactions.hidden_reason IS
  '§381 — non nullo: il movimento conta nel saldo ma sta fuori da elenco, statistiche di spesa e riconciliazione. Il testo è il motivo, ed è quello che si legge fra sei mesi.';

-- L'indice serve al filtro che sta su ogni lettura d'elenco: le righe
-- nascoste sono poche e quelle visibili sono tutte, quindi si indicizza il
-- caso raro.
CREATE INDEX IF NOT EXISTS bank_transactions_nascosti_idx
  ON public.bank_transactions (account_id, booked_on)
  WHERE hidden_reason IS NOT NULL;

COMMIT;

-- verifica: la colonna c'è ed è vuota per tutti
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='bank_transactions'
      AND column_name='hidden_reason')                       AS colonna,
  (SELECT count(*) FROM public.bank_transactions
    WHERE hidden_reason IS NOT NULL)                         AS gia_nascosti;
