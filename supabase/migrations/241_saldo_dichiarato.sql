-- §382 — il saldo che dichiara la banca, accanto a quello che calcoliamo noi.
--
-- Il saldo di un conto qui dentro è **ricostruito**: apertura più tutti i
-- movimenti. È il modo giusto di calcolarlo, e ha un punto cieco — non sa
-- dire fino a quando vale. Se un movimento manca, o ne entra uno di troppo,
-- il totale resta plausibile e nessuno ha un secondo numero con cui
-- confrontarlo. In una mattina la stessa verifica è stata fatta tre volte a
-- mano, aprendo l'XML e cercando il campo dei saldi.
--
-- Il camt.053 quel numero ce l'ha già: `CLBD` è il saldo di chiusura
-- dichiarato dalla banca, con la sua data, e l'intestazione dice a che ora
-- l'estratto è stato generato. Salvandolo, la pagina mostra i due numeri
-- vicini: finché coincidono l'archivio è integro, e il giorno che divergono
-- si vede subito invece di scoprirlo per caso.
--
-- **Lo dichiara solo il camt.** I CSV di home banking e di Vivid portano le
-- righe e non i saldi: per quei conti le colonne restano vuote, e vuote
-- devono sembrare — un saldo dichiarato a zero direbbe che la banca è in
-- disaccordo con noi di tutto il saldo.
--
-- Non è il saldo **disponibile** dell'app, ed è la ragione per cui non si
-- salva quello: le autorizzazioni delle carte compaiono nell'app subito e
-- nell'estratto uno o due giorni dopo. Sono due numeri diversi per
-- costruzione, e l'unico che un file dichiara è questo.
--
-- Rilanciabile.

BEGIN;

ALTER TABLE public.bank_accounts
  -- il saldo di chiusura come lo scrive la banca (camt `CLBD`)
  ADD COLUMN IF NOT EXISTS statement_balance   numeric(14,2),
  -- la data a cui quel saldo si riferisce
  ADD COLUMN IF NOT EXISTS statement_on        date,
  -- quando l'estratto è stato generato: è il taglio vero, non la data
  ADD COLUMN IF NOT EXISTS statement_at        timestamptz,
  -- quando l'abbiamo letto noi
  ADD COLUMN IF NOT EXISTS statement_seen_at   timestamptz;

COMMENT ON COLUMN public.bank_accounts.statement_balance IS
  '§382 — saldo di chiusura dichiarato dalla banca nel camt importato piu di recente. NULL per i conti i cui estratti non dichiarano saldi (CSV): vuoto vuol dire «non lo sappiamo», non zero.';

COMMIT;

-- verifica: le quattro colonne ci sono e nessun conto ha ancora un saldo dichiarato
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='bank_accounts'
      AND column_name IN ('statement_balance','statement_on','statement_at','statement_seen_at'))
                                                              AS colonne,
  (SELECT count(*) FROM public.bank_accounts
    WHERE statement_balance IS NOT NULL)                      AS gia_dichiarati;
