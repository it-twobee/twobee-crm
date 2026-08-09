-- ═══════════════════════════════════════════════════════════════════════════
-- PUBBLICITÀ ALLINEATA ALL'ESTRATTO CONTO — 2026-08-09
--
-- Il piano dei costi prevede «Advertising online (Google/Meta)» a 900 €/mese e
-- il conto economico ha materializzato quella cifra da maggio in poi. Sul conto
-- Vivid la pubblicità comincia il **25 luglio**:
--
--   maggio    Meta 0,00     — nessun addebito
--   giugno    Meta 0,00     — nessun addebito
--   luglio    Meta 211,64   — dal 25 al 31, 22 addebiti FACEBK *
--   agosto    Meta 109,12   — 1 e 2 agosto, il mese è in corso
--
-- (Google Cloud/Workspace è un'altra voce e ha già la sua riga: 214,45 a giugno,
-- 37,05 a luglio, 170,21 ad agosto.)
--
-- Perché conta: la riga di maggio è **preventivata 900 e non pagata**, quindi la
-- tenuta di cassa la conta fra gli scoperti — 900 € di uscita attesa per una
-- campagna che non è mai partita. L'effettivo lo dice la banca, non il piano.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;

-- maggio e giugno: preventivato 900, speso zero. Restano a bilancio con lo
-- scostamento in chiaro — cancellarle nasconderebbe che il budget c'era.
UPDATE public.pl_cost_lines c SET actual = 0, paid = true
FROM public.pl_months m
WHERE c.month_id = m.id AND m.month IN (DATE '2026-05-01', DATE '2026-06-01')
  AND c.label = 'Advertising online (Google/Meta)';

-- luglio: 211,64 di Meta, quelli veri
UPDATE public.pl_cost_lines c SET actual = 211.64
FROM public.pl_months m
WHERE c.month_id = m.id AND m.month = DATE '2026-07-01'
  AND c.label = 'Advertising online (Google/Meta)';

-- agosto: 109,12 fino al 2, e il mese è in corso — si aggiorna reimportando
-- l'estratto conto. Il preventivato resta 900: è il budget, non una previsione
-- di spesa.
UPDATE public.pl_cost_lines c SET actual = 109.12
FROM public.pl_months m
WHERE c.month_id = m.id AND m.month = DATE '2026-08-01'
  AND c.label = 'Advertising online (Google/Meta)';

-- Il movimento «dichiarato» segue la riga, o resta a raccontare −900 €.
-- `bank_sync_cost_line` scatta solo quando si spunta «pagato»: cambiare
-- l'effettivo dopo non lo tocca, e il ponte conto economico → saldo (§199)
-- si ritroverebbe una differenza senza un nome.
UPDATE public.bank_transactions t SET
  amount = -ROUND(c.actual * (CASE WHEN c.vat_applied THEN 1 + COALESCE(c.vat_rate, 0) ELSE 1 END), 2)
FROM public.pl_cost_lines c
WHERE t.cost_line_id = c.id AND t.source = 'derivato'
  AND c.label = 'Advertising online (Google/Meta)' AND c.actual > 0;

DELETE FROM public.bank_transactions t
USING public.pl_cost_lines c
WHERE t.cost_line_id = c.id AND t.source = 'derivato'
  AND c.label = 'Advertising online (Google/Meta)' AND c.actual = 0;

COMMIT;

-- Se la pubblicità non è un impegno mensile ma qualcosa che si accende quando
-- serve, la voce di piano va spenta: finché è attiva ogni mese futuro nasce con
-- 900 € di uscita, e il previsionale della cassa li dà per certi.
--   UPDATE public.cost_items SET is_active = false
--    WHERE label = 'Advertising online (Google/Meta)';
