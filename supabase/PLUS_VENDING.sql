-- Plus Vending — decisione pendente.
--
-- Stato: contract_end = 2026-06-30 (scaduto da 19 giorni al 2026-07-19),
-- mrr = 1.200, client_label ancora 'stabile'. Non era fra i contratti che
-- l'utente ha indicato come conclusi, quindi non è nel backfill principale.
--
-- ESEGUI SOLO UNA DELLE DUE SEZIONI, poi rilancia:
--   SELECT public.refresh_all_client_mrr();

-- ═══ B1 — CONTRATTO RINNOVATO ══════════════════════════════════════════════
-- Sostituisci 2027-06-30 con la data di fine reale.

-- INSERT INTO public.revenue_streams
--   (client_id, label, service_line, revenue_model, amount, billing_frequency, start_date, end_date, status, source)
-- SELECT c.id, 'Canone Growth', 'growth', 'recurring', c.mrr, 'mensile',
--        c.contract_start, DATE '2027-06-30', 'attivo', 'backfill'
-- FROM public.clients c
-- WHERE c.company_name = 'Plus Vending'
--   AND NOT EXISTS (
--         SELECT 1 FROM public.revenue_streams rs
--         WHERE rs.client_id = c.id AND rs.source = 'backfill'
--       );
--
-- UPDATE public.clients SET contract_end = '2027-06-30' WHERE company_name = 'Plus Vending';

-- ═══ B2 — CONTRATTO CONCLUSO ═══════════════════════════════════════════════

-- INSERT INTO public.revenue_streams
--   (client_id, label, service_line, revenue_model, amount, billing_frequency, start_date, end_date, status, source, notes)
-- SELECT c.id, 'Canone Growth (concluso)', 'growth', 'recurring', c.mrr, 'mensile',
--        c.contract_start, DATE '2026-06-30', 'cessato', 'backfill', 'Contratto scaduto.'
-- FROM public.clients c
-- WHERE c.company_name = 'Plus Vending'
--   AND NOT EXISTS (
--         SELECT 1 FROM public.revenue_streams rs
--         WHERE rs.client_id = c.id AND rs.source = 'backfill'
--       );
--
-- UPDATE public.clients SET client_label = 'perso' WHERE company_name = 'Plus Vending';
