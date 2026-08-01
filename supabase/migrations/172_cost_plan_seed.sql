-- 172 — Il piano dei costi parte dai numeri veri, non da una lista vuota.
--
-- Le 37 voci arrivano da «P&L_Two Bee.xlsx» (fogli Maggio/Giugno/Luglio 2026,
-- identici fra loro): categoria, voce, F/V e **preventivato** — che è
-- esattamente quello che `cost_items.amount` vuol dire. Il consuntivo non si
-- importa: quello è del mese, e sta già nel conto economico.
--
-- Preventivato totale del foglio: 9.750 €/mese. Torna con la riga «tot.».
--
-- Due correzioni rispetto al foglio, entrambe dichiarate:
--
--   «PC aziendali» (1.500) non è un costo mensile: è un acquisto. Entra come
--   una tantum e resta sospesa finché non decidi il mese in cui comprarli —
--   lasciarla mensile gonfiava il piano di 18.000 l'anno che nessuno spende.
--
--   L'outsourcing è **variabile** per definizione: si paga quando c'è lavoro
--   venduto da erogare. Nel foglio era F, ma è la distinzione che serve a
--   sapere quanto costa l'azienda a fatturato zero.
--
-- Le voci a preventivo zero entrano sospese: sono cose che sai di avere davanti
-- (JetHR, WATI, welfare, trasferte) e che vanno viste, non dimenticate.

INSERT INTO public.cost_items (center_id, category, label, cost_type, amount, frequency, is_active, sort_order)
SELECT c.id, v.category, v.label, v.cost_type, v.amount, v.frequency, v.is_active, v.sort_order
FROM (VALUES
  -- ── Struttura & Software ───────────────────────────────────────────────────
  ('Struttura & Software', 'Software & Tool', 'Google Workspace',                  'F',  150.0, 'mensile',    true,  10),
  ('Struttura & Software', 'Software & Tool', 'CRM professionale (Notion)',        'F',   80.0, 'mensile',    true,  20),
  ('Struttura & Software', 'Software & Tool', 'Project management (Asana)',        'F',  300.0, 'mensile',    true,  30),
  ('Struttura & Software', 'Software & Tool', 'Comunicazione interna (Slack)',     'F',   70.0, 'mensile',    true,  40),
  ('Struttura & Software', 'Software & Tool', 'Suite grafica (Canva Pro)',         'F',   20.0, 'mensile',    true,  50),
  ('Struttura & Software', 'Software & Tool', 'Email marketing (Klaviyo)',         'F',   50.0, 'mensile',    true,  60),
  ('Struttura & Software', 'Software & Tool', 'AI tools (Claude Max)',             'F',  130.0, 'mensile',    true,  70),
  ('Struttura & Software', 'Software & Tool', 'AI tools (Chat GPT-4)',             'F',   20.0, 'mensile',    true,  80),
  ('Struttura & Software', 'Software & Tool', 'It Platform (GitHub)',              'F',   10.0, 'mensile',    true,  90),
  ('Struttura & Software', 'Software & Tool', 'VPS Password Manager',              'F',   10.0, 'mensile',    true, 100),
  ('Struttura & Software', 'Software & Tool', 'Firma digitale (PandaDoc)',         'F',   20.0, 'mensile',    true, 110),
  ('Struttura & Software', 'Software & Tool', 'Fatturazione elettronica (Aruba)',  'F',   15.0, 'mensile',    true, 120),
  ('Struttura & Software', 'Software & Tool', 'Promo mobile',                      'F',   10.0, 'mensile',    true, 130),
  ('Struttura & Software', 'Software & Tool', 'Telefoni aziendali',                'F',  200.0, 'mensile',    true, 140),
  ('Struttura & Software', 'Software & Tool', 'PC aziendali',                      'F', 1500.0, 'una_tantum', false, 150),
  ('Struttura & Software', 'Software & Tool', 'Calendly (in-house)',               'F',    0.0, 'mensile',    false, 160),
  ('Struttura & Software', 'Software & Tool', 'HR Management (JetHR)',             'F',    0.0, 'mensile',    false, 170),
  ('Struttura & Software', 'Software & Tool', 'WhatsApp Business (WATI)',          'F',    0.0, 'mensile',    false, 180),

  -- ── Marketing TwoBee ───────────────────────────────────────────────────────
  ('Marketing TwoBee', 'Marketing TwoBee', 'Advertising online (Google/Meta)', 'V', 500.0, 'mensile', true,  10),
  ('Marketing TwoBee', 'Marketing TwoBee', 'Materiale commerciale',            'F', 150.0, 'mensile', true,  20),
  ('Marketing TwoBee', 'Marketing TwoBee', 'Dominio + Hosting web',            'F',  20.0, 'mensile', true,  30),
  ('Marketing TwoBee', 'Marketing TwoBee', 'Eventi / networking',              'F', 400.0, 'mensile', true,  40),

  -- ── Sede & Overhead ────────────────────────────────────────────────────────
  ('Sede & Overhead', 'Overhead', 'Coworking Napoli',         'F', 1800.0, 'mensile', true,  10),
  ('Sede & Overhead', 'Overhead', 'Fondo imprevisti / varie', 'V',  500.0, 'mensile', true,  20),
  ('Sede & Overhead', 'Overhead', 'Trasferte + pasti',        'V',    0.0, 'mensile', false, 30),
  ('Sede & Overhead', 'Overhead', 'Welfare / benefit HR',     'F',    0.0, 'mensile', false, 40),

  -- ── Amministrazione ────────────────────────────────────────────────────────
  ('Amministrazione', 'Professionali', 'Commercialista',                   'F', 500.0, 'mensile', true, 10),
  ('Amministrazione', 'Professionali', 'Consulenza legale straordinaria',  'V', 300.0, 'mensile', true, 20),
  ('Amministrazione', 'Banca',         'Commissioni bonifici',             'V',  10.0, 'mensile', true, 30),

  -- ── Persone ────────────────────────────────────────────────────────────────
  ('Persone', 'HR', 'IT Specialist',                    'F', 2640.0, 'mensile', true, 10),
  ('Persone', 'HR', 'Marketing Specialist',             'F', 2000.0, 'mensile', true, 20),
  ('Persone', 'HR', 'Marketing Automation Specialist',  'F', 1300.0, 'mensile', true, 30),
  ('Persone', 'HR', 'SMM / Content Creator',            'F', 1500.0, 'mensile', true, 40),
  ('Persone', 'HR', 'Media Buyer Junior Stage',         'F', 1000.0, 'mensile', true, 50),

  -- ── Delivery & Fornitori ───────────────────────────────────────────────────
  ('Delivery & Fornitori', 'Outsourcing', '[outsourcing] SMM',    'V', 0.0, 'mensile', false, 10),
  ('Delivery & Fornitori', 'Outsourcing', '[outsourcing] Design', 'V', 0.0, 'mensile', false, 20),
  ('Delivery & Fornitori', 'Outsourcing', 'Affinity',             'V', 0.0, 'mensile', false, 30)
) AS v(area, category, label, cost_type, amount, frequency, is_active, sort_order)
JOIN public.cost_centers c ON c.name = v.area
-- idempotente: rilanciarla non duplica quello che c'è già
WHERE NOT EXISTS (
  SELECT 1 FROM public.cost_items i WHERE i.label = v.label AND i.center_id = c.id
);

-- ── Il tetto di partenza è il piano stesso ──────────────────────────────────
-- Un budget è una decisione, ma partire da «quanto ho deciso di spendere» è
-- meglio che partire da zero: da lì lo si alza o lo si taglia sapendo cosa si
-- sta tagliando. Solo le aree ancora senza tetto, per non sovrascrivere scelte.
UPDATE public.cost_centers c
SET monthly_budget = COALESCE((
  SELECT sum(i.amount) FROM public.cost_items i
  WHERE i.center_id = c.id AND i.is_active AND i.frequency = 'mensile'
), 0)
WHERE c.monthly_budget = 0;

NOTIFY pgrst, 'reload schema';
