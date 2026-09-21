-- §383 — il terzo saldo: quello che si può spendere adesso.
--
-- Su un conto ce ne sono tre, e fino a oggi ne mostravamo due.
--
--   contabile ricostruito   apertura + movimenti          lo calcoliamo noi
--   contabile dichiarato    `CLBD` del camt (§382)        lo scrive la banca
--   disponibile             contabile − autorizzazioni    lo mostra l'app
--
-- Il terzo è quello che serve a decidere se una carta passa e quanto
-- bonificare, ed è l'unico che **nessun file dichiara**: le autorizzazioni
-- delle carte compaiono nell'app appena si paga e nell'estratto conto un
-- giorno o due dopo. Sul conto Vivid il 21 settembre erano 111,08 € su
-- 381,43 contabili: chi guarda il saldo per sapere se può spendere legge un
-- numero più alto di un terzo di quello vero.
--
-- **Si scrive a mano, e per questo porta l'ora.** È l'eccezione che conferma
-- l'invariante: i valori economici non si digitano perché si derivano dai
-- contratti, ma questo non si deriva da niente che abbiamo — come
-- `opening_balance`, che è a mano dal primo giorno. Quello che non si può
-- fare è lasciarlo senza data: un disponibile senza l'ora in cui è stato
-- letto è vecchio dopo cinque minuti e non lo sa nessuno. Con l'ora accanto,
-- chi legge decide se fidarsi.
--
-- Il numero delle autorizzazioni in sospeso **non si salva**: è la
-- differenza fra i due, e un terzo campo da tenere allineato a mano è un
-- terzo campo che va fuori sincrono.
--
-- Rilanciabile.

BEGIN;

ALTER TABLE public.bank_accounts
  ADD COLUMN IF NOT EXISTS available_balance numeric(14,2),
  ADD COLUMN IF NOT EXISTS available_at      timestamptz;

COMMENT ON COLUMN public.bank_accounts.available_balance IS
  '§383 — saldo disponibile letto dall app della banca: contabile meno le autorizzazioni non ancora contabilizzate. Si scrive a mano e vale quanto e recente available_at.';

COMMIT;

-- verifica: le due colonne ci sono
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='bank_accounts'
      AND column_name IN ('available_balance','available_at'))  AS colonne;
