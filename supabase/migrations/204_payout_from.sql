-- 204 — §227 · Da quando si contano i compensi ai soci e ai commerciali.
--
-- L'erogato non è scritto da nessuna parte: si ricalcola dal piano compensi e
-- si confronta coi bonifici veri. Ma il confronto ha bisogno di un **inizio**,
-- e l'inizio è una decisione, non un dato: «fino a giugno è tutto regolato,
-- nessun anticipo e nessun arretrato». Senza, il registro somma dal primo mese
-- registrato e mostra a ciascuno un anticipo o uno scoperto che non esiste.
--
-- Perché non si deduce dai mesi chiusi. Sembrava elegante — «l'ultimo mese
-- chiuso è liquidato» — ed è sbagliato: chiudere un mese vuol dire che i suoi
-- conti sono definitivi, non che i soci sono stati pagati. Il giorno in cui si
-- è chiuso luglio la linea si è spostata da sola ad agosto, e i compensi di
-- luglio sono spariti dal registro senza che nessuno lo avesse deciso. Una
-- regola che cambia significato per un gesto che parla d'altro è peggio di
-- nessuna regola.
--
-- NULL = si conta da sempre, che è come si comportava prima di questa colonna.

ALTER TABLE public.pl_config
  ADD COLUMN IF NOT EXISTS payout_from DATE;

COMMENT ON COLUMN public.pl_config.payout_from IS
  '§227 — primo mese da cui si contano i compensi maturati verso soci e commerciali. Prima di questa data è tutto liquidato. NULL = da sempre';

-- Fino a giugno 2026 compensi e provvigioni sono regolati: nessun anticipo,
-- nessun arretrato. Il registro parte da luglio.
UPDATE public.pl_config SET payout_from = DATE '2026-07-01' WHERE payout_from IS NULL;

NOTIFY pgrst, 'reload schema';
