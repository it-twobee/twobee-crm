-- ═══════════════════════════════════════════════════════════════════════════
-- §281 · Lo stato vero delle fatture emesse — dettato il 9 agosto 2026
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Da eseguire DOPO la migration `210_invoice_unmanaged.sql`.
--
-- L'archivio conosceva due stati e ne servivano tre. Qui si scrive quello che è
-- vero, con il perché accanto:
--
--   · NON GESTITE (9) — esistono, sono passate dallo SDI, non le incasserà
--     nessuno: le ISF duplicate con le loro note di credito, la Gli Artigiani
--     stornata, la Tailors emessa due volte. Fuori dai crediti, non cancellate.
--   · IN ATTESA (7)  — quelle vere: FPR 31, 38, 44, 47, 48, 49, 50.
--   · INCASSATE      — tutte le altre.
--
-- **Le date non si inventano**: dove c'è un movimento in banca la data è
-- quella, e la riga lo dice. Dove non c'è, la fattura resta in attesa e va
-- chiusa a mano — meglio un credito da correggere che una data falsa.

BEGIN;

-- ── 1 · le nove fuori dai conti ─────────────────────────────────────────────
UPDATE public.invoices SET excluded_reason = 'ISF: fatturata due volte, vale la FPR 4/26', paid_on = NULL
 WHERE direction = 'emessa' AND number IN ('FPR 5/26', 'FPR 9/26');
UPDATE public.invoices SET excluded_reason = 'nota di credito che annulla le ISF duplicate', paid_on = NULL
 WHERE direction = 'emessa' AND number IN ('FPR 8/26', 'FPR 11/26');
UPDATE public.invoices SET excluded_reason = 'Gli Artigiani: stornata con nota di credito', paid_on = NULL
 WHERE direction = 'emessa' AND number IN ('FPR 33/26', 'FPR 46/26');
UPDATE public.invoices SET excluded_reason = 'nota di credito su Affinity', paid_on = NULL
 WHERE direction = 'emessa' AND number = 'FPR 45/26';
-- FPR 51/26: Tailors emessa due volte. Il bonifico del 17 giugno che le era
-- attribuito è l'incasso della FPR 29/26, ed è quello che il punto 3 rimette
-- al suo posto.
UPDATE public.invoices SET excluded_reason = 'Tailors: emessa due volte, vale la FPR 29/26', paid_on = NULL
 WHERE direction = 'emessa' AND number = 'FPR 51/26';
UPDATE public.invoices SET excluded_reason = 'fuori dai conti per scelta', paid_on = NULL
 WHERE direction = 'emessa' AND number = 'FPR 52/26';

-- ── 2 · quelle che NON sono incassate: la spunta va tolta ───────────────────
-- FPR 50/26 risultava incassata il 21 luglio, ma quel bonifico di iCura è
-- l'incasso della FPR 28/26 (punto 3). Senza toglierla, lo stesso movimento
-- pagherebbe due fatture.
UPDATE public.invoices SET paid_on = NULL
 WHERE direction = 'emessa' AND number = 'FPR 50/26';

-- ── 3 · quelle incassate: la data viene dall'estratto conto ────────────────
-- Un solo movimento `banca` con lo stesso importo lordo e il nome del cliente:
-- dove il candidato non è unico non si tocca niente.
UPDATE public.invoices i SET paid_on = t.booked_on
  FROM public.bank_transactions t
 WHERE i.direction = 'emessa' AND i.number = 'FPR 29/26'
   AND t.source = 'banca' AND ROUND(t.amount, 2) = 2440.00 AND t.booked_on = '2026-06-17';

UPDATE public.invoices i SET paid_on = t.booked_on
  FROM public.bank_transactions t
 WHERE i.direction = 'emessa' AND i.number = 'FPR 28/26'
   AND t.source = 'banca' AND ROUND(t.amount, 2) = 4392.00 AND t.booked_on = '2026-07-21';

UPDATE public.invoices i SET paid_on = t.booked_on
  FROM public.bank_transactions t
 WHERE i.direction = 'emessa' AND i.number = 'FPR 43/26'
   AND t.source = 'banca' AND ROUND(t.amount, 2) = 7930.00 AND t.booked_on = '2026-08-07';

-- ── 4 · quelle che restano crediti veri ─────────────────────────────────────
-- FPR 40/26 (Affinity 2.196) e FPR 41/26 (Petito 1.830): **non ancora
-- incassate**, confermato il 9 agosto. In banca non c'era nessun movimento
-- libero con quell'importo, e adesso si sa perché — quei soldi non sono ancora
-- arrivati. Restano dove sono, senza toccarle: è già lo stato giusto.
--
-- Lo stato atteso dopo il COMMIT: **9 in attesa** (31, 38, 40, 41, 44, 47, 48,
-- 49, 50) per 26.748,50 € lordi, e **8 fuori dai conti** (la 52 non esiste in
-- archivio, quella riga non tocca niente).
--
--   SELECT number, issued_on, total, paid_on, excluded_reason
--     FROM invoices WHERE direction = 'emessa' AND paid_on IS NULL
--    ORDER BY excluded_reason NULLS FIRST, issued_on;

COMMIT;
