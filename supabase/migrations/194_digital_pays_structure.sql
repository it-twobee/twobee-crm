-- ═══════════════════════════════════════════════════════════════════════════
-- §198 — Il digital contribuisce alla struttura
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Il margine digital si distribuiva per intero: 6% commerciale, 28% a ciascun
-- socio, 10% alle casse = 100%. La conseguenza aritmetica era che **il digital
-- non pagava un euro di struttura** — persone, software, sede — e la struttura la
-- copriva solo il growth col suo 35%. In un mese a prevalenza digital la cassa
-- risultava negativa per costruzione: a luglio 20.625 € di fatturato digital
-- lasciavano alla struttura 1.062 €, il 10% del margine.
--
-- Sui tre mesi da giugno ad agosto il conto era questo:
--
--   il growth mette a disposizione 0,55 × 34.925 =            19.209
--   il digital, col 10% del margine =                          1.682
--   la struttura costa                                        32.938
--   ────────────────────────────────────────────────────────────────
--   scoperto                                                  12.048   (4.016/mese)
--
-- La nuova ripartizione del **margine** (ricavo meno i subappalti del progetto):
--
--     6%  commerciale        (invariato)
--    18%  a ciascun socio    (era 28%) → 54% per tre soci
--    30%  target struttura   (nuovo)
--    10%  casse TwoBee       (invariato)
--   ────
--   100%  del margine, come prima: cambia a chi va, non quanto si distribuisce
--
-- Perché 30 e non 35 come il growth: sul digital il costo di delivery **è già
-- uscito** — i subappalti sono fuori dal margine prima della spartizione — quindi
-- la struttura da coprire è quella residua, non l'intera.
--
-- Cosa cambia in cassa: il contributo del digital passa da 1.682 a 6.729 sui tre
-- mesi, e lo scoperto da 4.016 a **2.334 €/mese**. Non va a zero, e va detto: per
-- azzerarlo la quota di ciascun socio dovrebbe scendere al **4,1%**, cioè il
-- digital dovrebbe coprire da solo un buco che è di scala — la struttura costa
-- 11.000 al mese e il growth ne fa 11.600.
--
-- La quota entra nel **target costi** e non nelle casse: è copertura di un costo
-- che esiste comunque, non utile trattenuto. Così lo scostamento dal target dice
-- la verità su quanto la struttura sfora, e il fondo rischio opzionale della §186
-- continua a funzionare com'era — i suoi nove punti escono dalle quote dei soci.

BEGIN;

ALTER TABLE public.pl_config
  ADD COLUMN IF NOT EXISTS digital_cost_target_pct NUMERIC(5,4) NOT NULL DEFAULT 0.30;

COMMENT ON COLUMN public.pl_config.digital_cost_target_pct IS
  '§198 — Quota del margine digital destinata a coprire la struttura. Entra nel target '
  'costi accanto al 35% del growth: è copertura di un costo che esiste comunque, non '
  'utile trattenuto.';

UPDATE public.pl_config
   SET digital_partner_pct = 0.18,
       digital_cost_target_pct = 0.30
 WHERE id = true;

-- Se la riga di configurazione non esiste ancora, la crea coi valori nuovi.
INSERT INTO public.pl_config (id, digital_partner_pct, digital_cost_target_pct)
SELECT true, 0.18, 0.30
 WHERE NOT EXISTS (SELECT 1 FROM public.pl_config WHERE id = true);

COMMIT;
