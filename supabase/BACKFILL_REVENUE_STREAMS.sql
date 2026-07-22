-- ═══════════════════════════════════════════════════════════════════════════
-- FASE 1 — Backfill `revenue_streams` dai 12 clienti reali
-- Da eseguire DOPO le migration 115–118 + 122 (tutte applicate il 2026-07-19).
--
-- APRI QUESTO FILE dal SQL Editor: il copia-incolla ha troncato ripetutamente
-- blocchi da 25 caratteri.
--
-- Plus Vending NON è incluso: la sua sorte è ancora da decidere
-- (contract_end 2026-06-30 scaduto, ma client_label ancora 'stabile').
-- Vedi PLUS_VENDING.sql per le due varianti.
-- ═══════════════════════════════════════════════════════════════════════════

-- Verifica preliminare: deve restituire ZERO righe.
-- Se ne torna una, il DROP del vincolo UNIQUE(client_id, month) non è passato.
SELECT conname FROM pg_constraint
WHERE conrelid = 'public.invoices'::regclass AND contype = 'u';

-- ─── 1. Growth ricorrenti ATTIVI (6 clienti) ────────────────────────────────

INSERT INTO public.revenue_streams
  (client_id, label, service_line, revenue_model, amount, billing_frequency, start_date, end_date, status, source)
SELECT c.id, 'Canone Growth', 'growth', 'recurring', c.mrr, 'mensile',
       c.contract_start, c.contract_end, 'attivo', 'backfill'
FROM public.clients c
WHERE c.company_name IN (
        'iCura Impresa',
        'Sartoria Condotti',
        'Affinity - SofiA',
        'Fatima Leo Salon & Academy',
        'Petito Costruzioni',
        'Josè Restaurant - Tenuta Villa Guerra'
      )
  AND NOT EXISTS (
        SELECT 1 FROM public.revenue_streams rs
        WHERE rs.client_id = c.id AND rs.source = 'backfill'
      );

-- ─── 2. Growth ricorrenti CESSATI ───────────────────────────────────────────
-- Date confermate. NB: clients.contract_end di AV Gioielli dice 2026-03-31,
-- prevale l'indicazione dell'utente (30/04). Il campo va allineato a mano.

INSERT INTO public.revenue_streams
  (client_id, label, service_line, revenue_model, amount, billing_frequency, start_date, end_date, status, source, notes)
SELECT c.id, 'Canone Growth (concluso)', 'growth', 'recurring', c.mrr, 'mensile',
       c.contract_start, d.end_date, 'cessato', 'backfill', d.note
FROM public.clients c
JOIN (VALUES
        ('Industrial Services & Facility', DATE '2026-06-30', 'Contratto Growth concluso. Proposta Digital in corso.'),
        ('AV Gioielli', DATE '2026-04-30', 'Cliente perso.')
     ) AS d(name, end_date, note) ON d.name = c.company_name
WHERE NOT EXISTS (
        SELECT 1 FROM public.revenue_streams rs
        WHERE rs.client_id = c.id AND rs.source = 'backfill'
      );

-- ─── 3. Two Bee — interno, non fatturabile ──────────────────────────────────

INSERT INTO public.revenue_streams
  (client_id, label, service_line, revenue_model, amount, billing_frequency, start_date, status, source, notes)
SELECT c.id, 'Attività interna', 'other', 'non_billable', 0, 'una_tantum',
       c.contract_start, 'attivo', 'backfill', 'Società interna: nessun ricavo.'
FROM public.clients c
WHERE c.company_name = 'Two Bee'
  AND NOT EXISTS (
        SELECT 1 FROM public.revenue_streams rs
        WHERE rs.client_id = c.id AND rs.source = 'backfill'
      );

-- Seven Holding ed Elettra Group: nessuno stream (mrr = 0, nessun lavoro
-- censito). Se hanno progetti Digital attivi vanno creati a mano.

-- ─── 4. Correzioni anagrafiche ──────────────────────────────────────────────

UPDATE public.clients SET contract_end = '2026-04-30' WHERE company_name = 'AV Gioielli';

UPDATE public.clients SET is_internal = true WHERE company_name = 'Two Bee';

-- ─── 5. Allineamento cache MRR e quadratura ─────────────────────────────────

SELECT public.refresh_all_client_mrr() AS clienti_aggiornati;

SELECT c.company_name, c.mrr AS mrr_calcolato, c.contract_end, c.client_label
FROM public.clients c
ORDER BY c.mrr DESC;

-- Atteso senza Plus Vending: 12.100
SELECT SUM(public.client_mrr(c.id)) AS mrr_aziendale_attivo
FROM public.clients c
WHERE c.is_internal = false;
