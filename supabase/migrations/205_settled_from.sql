-- 205 — §230 · Una linea sola: il consolidato.
--
-- La 204 aveva introdotto `payout_from` per i soli compensi. Ma la stessa
-- domanda torna su tutto: fino a giugno 2026 i conti sono chiusi e non si
-- rincorrono più. Vale per tre cose che sembravano diverse e sono la stessa:
--
--   · i **compensi** che i soci si sono erogati fino a giugno sono liquidati;
--   · le **spunte** di aprile-giugno che nessun movimento certifica non sono
--     un lavoro arretrato: sono un periodo chiuso, e segnalarle ogni volta
--     insegna solo a ignorare le segnalazioni;
--   · il **personale** di maggio e giugno contiene persone che in quei mesi non
--     erano ancora in forza — il mese è stato preparato con l'organico di oggi.
--     Correggerlo a ritroso non serve a nessuno: quei mesi sono chiusi.
--
-- Perciò la colonna cambia nome e diventa quello che è: `settled_from`, il
-- primo mese che si conta. `payout_from` diceva meno di quello che faceva, e una
-- colonna che dice meno del suo contenuto è il modo in cui il prossimo che la
-- legge se ne inventa un altro uso.
--
-- NULL = si conta da sempre, come prima di questa colonna.

ALTER TABLE public.pl_config RENAME COLUMN payout_from TO settled_from;

COMMENT ON COLUMN public.pl_config.settled_from IS
  '§230 — primo mese da conteggiare. Prima di questa data i conti sono consolidati: compensi liquidati, spunte non certificate accettate, organico storico non rincorso. NULL = da sempre';

UPDATE public.pl_config SET settled_from = DATE '2026-07-01' WHERE settled_from IS NULL;

NOTIFY pgrst, 'reload schema';
