-- ============================================================
-- TWO BEE GESTIONALE — Seed Data
-- ============================================================
-- NOTA: I profili vengono creati tramite Supabase Auth (inviti).
-- Questo seed inserisce i clienti di esempio e i dati correlati.
-- Esegui DOPO aver creato manualmente gli utenti admin su Supabase.

-- Per creare il primo admin, usa la Supabase Dashboard:
-- Authentication → Users → Invite User
-- Email: marco.lucci@twobee.it → Role: admin (in user metadata)

-- ============================================================
-- CLIENTI REALI TWO BEE
-- ============================================================
INSERT INTO public.clients (company_name, package, mrr, contract_start, contract_end, payment_status, active_channels, status, notes) VALUES
  ('Elettra Impianti', 'Hive Basic', 1800.00, '2025-01-01', '2026-12-31', 'pagato', ARRAY['Meta Ads', 'Google Ads'], 'verde', 'Cliente storico, ottima collaborazione'),
  ('Sartoria Condotti', 'Royal Queen', 2500.00, '2025-03-01', '2026-02-28', 'in_attesa', ARRAY['Meta Ads', 'Google Ads', 'Email Marketing'], 'giallo', 'Pagamento in ritardo di 15 giorni'),
  ('ICura Impresa', 'Hive Basic', 1800.00, '2025-02-01', '2026-01-31', 'pagato', ARRAY['Meta Ads', 'CRM'], 'verde', NULL),
  ('Seven S.r.l.', 'IT Digital Partner', 2500.00, '2025-04-01', '2026-03-31', 'pagato', ARRAY['Meta Ads', 'Google Ads', 'SEO', 'CRM'], 'verde', 'Partnership IT estesa'),
  ('Industrial Service & Facility S.r.l.', 'Hive Custom', 2000.00, '2025-01-15', '2026-01-14', 'pagato', ARRAY['Meta Ads', 'Email Marketing'], 'giallo', 'Fase di revisione strategia'),
  ('Gestione Italia', 'Hive Basic', 1800.00, '2025-05-01', '2026-04-30', 'pagato', ARRAY['Google Ads', 'SEO'], 'verde', NULL),
  ('José Restaurant', 'Worker Bee Basic', 1500.00, '2025-06-01', '2026-05-31', 'pagato', ARRAY['Meta Ads', 'Email Marketing'], 'verde', 'Settore ristorazione'),
  ('AV Gioielli', 'Worker Bee Start', 1200.00, '2025-07-01', '2026-06-30', 'pagato', ARRAY['Meta Ads'], 'verde', 'E-commerce gioielli'),
  ('Fatima Leo Salon & Academy', 'Worker Bee Basic', 1500.00, '2025-08-01', '2026-07-31', 'pagato', ARRAY['Meta Ads', 'WhatsApp'], 'verde', 'Parrucchieri e beauty'),
  ('Plus Vending', 'Worker Bee Start', 1200.00, '2025-09-01', '2026-08-31', 'pagato', ARRAY['Google Ads'], 'verde', NULL),
  ('Land S.r.l.', 'Hive Basic', 1800.00, '2025-10-01', '2026-09-30', 'in_attesa', ARRAY['Meta Ads', 'Google Ads', 'CRM'], 'giallo', 'Ristrutturazione aziendale in corso');

-- ============================================================
-- CANALI INTERNI (fissi)
-- ============================================================
INSERT INTO public.chat_channels (name, type) VALUES
  ('generale', 'interno'),
  ('team', 'interno'),
  ('ads', 'interno'),
  ('it-sviluppo', 'interno'),
  ('commerciale', 'interno');

-- ============================================================
-- CANALI CLIENTE (uno per ciascun cliente)
-- ============================================================
INSERT INTO public.chat_channels (name, type, client_id)
SELECT
  LOWER(REGEXP_REPLACE(company_name, '[^a-zA-Z0-9]', '-', 'g')),
  'cliente',
  id
FROM public.clients;

-- ============================================================
-- PROGETTI (uno per cliente)
-- ============================================================
INSERT INTO public.projects (client_id, name, description, status, sprint_current)
SELECT
  id,
  'Progetto ' || company_name,
  'Gestione marketing digitale ' || package,
  'attivo',
  1
FROM public.clients;

-- ============================================================
-- SPRINT (uno per progetto, in corso)
-- ============================================================
INSERT INTO public.sprints (project_id, name, start_date, end_date, status)
SELECT
  id,
  'Sprint 1 — Giugno 2026',
  '2026-06-01',
  '2026-06-30',
  'in_corso'
FROM public.projects;

-- ============================================================
-- TASK SAMPLE (per ogni progetto)
-- ============================================================
INSERT INTO public.tasks (project_id, sprint_id, title, priority, status, due_date)
SELECT
  p.id,
  s.id,
  unnest(ARRAY[
    'Setup campagna Meta Ads',
    'Analisi competitor',
    'Revisione copy annunci',
    'Report mensile performance',
    'Ottimizzazione landing page'
  ]),
  unnest(ARRAY['alta', 'media', 'media', 'bassa', 'alta']),
  unnest(ARRAY['in_corso', 'da_fare', 'in_revisione', 'da_fare', 'in_corso']),
  unnest(ARRAY[
    CURRENT_DATE + 3,
    CURRENT_DATE + 7,
    CURRENT_DATE + 5,
    CURRENT_DATE + 14,
    CURRENT_DATE + 2
  ])
FROM public.projects p
JOIN public.sprints s ON s.project_id = p.id;

-- ============================================================
-- MEETING NOTES SAMPLE (uno per cliente)
-- ============================================================
INSERT INTO public.meeting_notes (client_id, project_id, title, date, attendees, summary, decisions, next_actions)
SELECT
  c.id,
  p.id,
  'Kick-off Meeting — ' || c.company_name,
  NOW() - INTERVAL '7 days',
  ARRAY['Marco Lucci', 'Walter Giacobbe'],
  'Riunione di avvio collaborazione. Discussione degli obiettivi per il trimestre, definizione delle priorità e allineamento sul pacchetto ' || c.package || '.',
  'Approvato piano editoriale mensile. Confermato budget campagne.',
  'Preparare calendario contenuti. Inviare accessi piattaforme.'
FROM public.clients c
JOIN public.projects p ON p.client_id = c.id;

-- ============================================================
-- KPI SAMPLE — Maggio 2026
-- ============================================================
INSERT INTO public.client_kpis (client_id, month, roas, cpl, cpa, leads_generated, conversion_rate, revenue_attributed, ad_spend)
SELECT
  id,
  '2026-05-01',
  ROUND((2.5 + RANDOM() * 3)::NUMERIC, 2),
  ROUND((8 + RANDOM() * 20)::NUMERIC, 2),
  ROUND((20 + RANDOM() * 80)::NUMERIC, 2),
  (30 + FLOOR(RANDOM() * 100))::INTEGER,
  ROUND((2 + RANDOM() * 8)::NUMERIC, 2),
  ROUND((mrr * (2 + RANDOM() * 4))::NUMERIC, 2),
  ROUND((mrr * 0.8)::NUMERIC, 2)
FROM public.clients;

-- KPI Sample — Aprile 2026
INSERT INTO public.client_kpis (client_id, month, roas, cpl, cpa, leads_generated, conversion_rate, revenue_attributed, ad_spend)
SELECT
  id,
  '2026-04-01',
  ROUND((2 + RANDOM() * 3)::NUMERIC, 2),
  ROUND((10 + RANDOM() * 25)::NUMERIC, 2),
  ROUND((25 + RANDOM() * 90)::NUMERIC, 2),
  (20 + FLOOR(RANDOM() * 80))::INTEGER,
  ROUND((1.5 + RANDOM() * 7)::NUMERIC, 2),
  ROUND((mrr * (1.8 + RANDOM() * 3.5))::NUMERIC, 2),
  ROUND((mrr * 0.75)::NUMERIC, 2)
FROM public.clients;
