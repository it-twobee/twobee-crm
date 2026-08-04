-- ═══════════════════════════════════════════════════════════════════════════
-- §206 — La quota digital dei soci torna al 28%: annulla la 194
-- ═══════════════════════════════════════════════════════════════════════════
--
-- La 194 aveva portato la quota di ciascun socio dal 28% al 18% per fare spazio a
-- un 30% del margine destinato alla struttura. Era una risposta alla domanda «fai
-- contribuire il digital alla struttura», ma la domanda aveva una premessa che non
-- andava toccata: **il 28% a socio è una decisione presa**, e il fondo emergenza
-- opzionale la porta al 25% togliendo tre punti a testa. Non è la variabile da cui
-- prendere.
--
-- Il piano digital torna quello della §186, che chiude al 100% del margine:
--
--     6%  commerciale
--    28%  a ciascun socio        → 84% per tre soci
--    10%  casse TwoBee
--   ────
--   100%  del margine
--
--   con il fondo emergenza attivo su una riga (sopra i 20.000 € di progetto):
--     6% commerciale · 25% a socio (75%) · 9% fondo · 10% casse = 100%
--
-- `digital_cost_target_pct` **resta nello schema a zero**: la leva esiste, è
-- documentata e un giorno può servire — chi la vuole scrive una percentuale e
-- quella entra nel target costi accanto al 35% del growth. Finché è zero, la
-- struttura la copre il growth, e questa è la ragione per cui in un mese a
-- prevalenza digital la cassa TwoBee risulta negativa: non è un errore di calcolo,
-- è la conseguenza aritmetica di distribuire il margine per intero.

BEGIN;

UPDATE public.pl_config
   SET digital_partner_pct = 0.28,
       digital_cost_target_pct = 0
 WHERE id = true;

COMMENT ON COLUMN public.pl_config.digital_cost_target_pct IS
  '§206 — Quota del margine digital destinata a coprire la struttura. **Zero nel piano '
  'attuale**: il margine si distribuisce per intero e la quota dei soci non è una variabile '
  'da cui prendere. Il campo resta perché la leva esiste: la percentuale scritta qui entra '
  'nel target costi accanto al 35% del growth.';

COMMIT;
