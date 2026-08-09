-- ═══════════════════════════════════════════════════════════════════════════
-- CEDOLINI E ORGANICO DAL LUL DI GIUGNO 2026 — §235
--
-- Il seed della 182 aveva trascritto i totali giusti e le scomposizioni no:
-- l'imponibile previdenziale era il totale delle competenze (trasferte e
-- indennità esenti comprese) e l'imponibile fiscale era «competenze meno
-- contributi». Su Michele erano 1.861,80 invece di 1.730,00 di imponibile —
-- e l'imponibile è la base su cui si calcolano i contributi datore, quindi
-- l'errore si moltiplica per il 30% ogni mese.
--
-- Qui ci sono i numeri del LUL, voce per voce. Le componenti sommano al totale
-- al centesimo, ed è il controllo che dice che la trascrizione è giusta:
--
--   Michele  1.468,35 + 73,42 + 59,30 + 128,48 + 57,00 + 75,25 = 1.861,80
--   Sabrina  1.131,68 + 161,30 + 116,50 + 213,00 + 31,79       = 1.654,27
--   Agostino   800,00 + 46,00                                   =   846,00
--
-- E l'F24 di giugno conferma il resto: l'IRPEF dei tre cedolini
-- (199,87 + 2,38 + 44,21) è **esattamente** l'erario del modello, 246,46; le
-- indennità esenti L. 207/2024 (75,25 + 31,79) sono **esattamente** il credito
-- compensato, 107,04.
--
-- `employer_contrib` resta NULL di proposito: non è un dato del cedolino, è una
-- ripartizione dell'F24, e si ricalcola a ogni lettura dichiarando da dove
-- viene (§235). Scriverlo in colonna lo farebbe sembrare un documento.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;

-- ── Michele Cristallo — indeterminato, livello 6, mese pieno ────────────────
UPDATE public.hr_payslips s SET
  base_pay          = 1468.35,   -- 160 h × 9,17720
  public_holidays   = 73.42,     -- 8 h di festività godute
  holidays_taken    = 59.30,     -- 1 giorno di ferie
  fourteenth        = 128.48,    -- rateo di quattordicesima, già nell'imponibile
  travel            = 57.00,     -- 3 trasferte × 19,00, esenti
  allowances        = 75.25,     -- indennità L. 207/2024: rientra come credito F24
  total_earnings    = 1861.80,
  contributory_base = 1730.00,   -- era 1.861,80: ci finivano dentro trasferte e indennità
  taxable_base      = 1567.62,   -- era 1.699,87
  employee_contrib  = 161.93,
  irpef             = 199.87,
  rounding          = 0,
  net_paid          = 1500.00,
  tfr_accrued       = 120.51,
  note              = 'LUL giugno 2026. Contributi datore ricavati dall''F24 del mese (§235), non dal cedolino.'
FROM public.hr_people p
WHERE s.person_id = p.id AND p.full_name = 'Michele Cristallo' AND s.month = DATE '2026-06-01';

-- ── Sabrina Nastro — apprendistato 1º anno, regime impatriati ───────────────
-- La riduzione IRPEF da rientro (662,40) è il motivo per cui prende 1.568 netti
-- pagando 2,38 di IRPEF: senza, l'imponibile fiscale sarebbe 1.324,79.
UPDATE public.hr_payslips s SET
  base_pay          = 1131.68,   -- 136 h × 8,32119
  holidays_taken    = 161.30,    -- 3 giorni di ferie
  fourteenth        = 116.50,
  travel            = 213.00,    -- 10 trasferte × 21,30
  allowances        = 31.79,     -- indennità L. 207/2024
  total_earnings    = 1654.27,
  contributory_base = 1409.00,   -- era 1.654,27
  taxable_base      = 662.39,    -- era 1.569,58: mancava la riduzione impatriati
  employee_contrib  = 84.69,
  irpef             = 2.38,
  rounding          = 0.80,
  net_paid          = 1568.00,
  tfr_accrued       = 107.25,
  note              = 'LUL giugno 2026. Netto concordato 1.600, chiude a 1.568: scostamento da verificare. Riduzione IRPEF rientro 662,40.'
FROM public.hr_people p
WHERE s.person_id = p.id AND p.full_name = 'Sabrina Nastro' AND s.month = DATE '2026-06-01';

-- ── Agostino Abate — tirocinio dal 05/06 ────────────────────────────────────
-- Imponibile previdenziale zero: sul tirocinio non ci sono contributi INPS, e
-- uno zero certo non è un dato mancante.
UPDATE public.hr_payslips s SET
  base_pay          = 800.00,
  travel            = 46.00,     -- 2 trasferte × 23,00
  total_earnings    = 846.00,
  contributory_base = 0,
  taxable_base      = 797.71,    -- era 843,71: le trasferte non sono imponibili
  employee_contrib  = 2.29,
  irpef             = 44.21,
  rounding          = 0.50,
  net_paid          = 800.00,
  tfr_accrued       = 0,
  employer_contrib  = 0,         -- non è una stima: sul tirocinio è zero per legge
  note              = 'LUL giugno 2026. Tirocinio: nessun contributo datore, nessun TFR, nessuna mensilità aggiuntiva.'
FROM public.hr_people p
WHERE s.person_id = p.id AND p.full_name = 'Agostino Abate' AND s.month = DATE '2026-06-01';

-- ── l'F24 di luglio, in scadenza il 20 agosto ───────────────────────────────
-- Dal modello: erario 1001 = 239,48 · crediti 1701 + 1704 = 101,92 + 115,65 ·
-- INPS DM10 = 856,00. Il rigo IVA (6032, 9.669,33) **non** entra qui: è il
-- secondo trimestre, e sta in Fiscale & tasse. Sommarlo al costo del lavoro
-- farebbe costare diecimila euro un mese di stipendi.
INSERT INTO public.hr_f24 (month, erario_gross, credit_offset, erario_balance, inps, inail, other, total, individual_detail, note)
VALUES (DATE '2026-07-01', 239.48, 217.57, 21.91, 856.00, 0, 0, 877.91, false,
  'Modello in scadenza 20/08/2026. Nello stesso F24 c''è anche l''IVA del 2º trimestre (cod. 6032, 9.669,33): il totale versato è 10.547,24, ma l''IVA non è costo del lavoro.')
ON CONFLICT (month) DO UPDATE SET
  erario_gross = EXCLUDED.erario_gross, credit_offset = EXCLUDED.credit_offset,
  erario_balance = EXCLUDED.erario_balance, inps = EXCLUDED.inps,
  total = EXCLUDED.total, note = EXCLUDED.note;

-- ── l'anagrafica allineata ai documenti ─────────────────────────────────────
-- La RAL scritta a mano era più alta del vero: 24.021,75 contro 22.301,76 per
-- Michele, 30.232,35 contro 18.306,00 per Sabrina. Da lì venivano i 2.767 e
-- 2.801 €/mese che la pagina mostrava — quasi novecento euro al mese di costo
-- che non esiste su una persona sola.
--   Michele  12 × 1.730,00 + 1.541,76 (13ª) = 22.301,76
--   Sabrina  12 × 1.409,00 + 1.398,00 (13ª) = 18.306,00
--   Agostino 12 ×   800,00                  =  9.600,00
--
-- §236 — `agreed_net` è il netto **promesso**, non quello uscito: 1.500 a
-- Michele, 1.600 a Sabrina, 800 ad Agostino. È il pavimento del costo, perché
-- trasferte e bonus sono lo strumento con cui ci si arriva — a giugno Michele
-- ci arriva esatto grazie ai 57 € di trasferta, Sabrina si ferma a 1.568 e
-- restano 32 € di patto scoperto. Scrivere 1.568 avrebbe fatto sparire lo
-- scostamento invece di segnalarlo.
UPDATE public.hr_people SET gross_year = 22301.76, agreed_net = 1500
  WHERE full_name = 'Michele Cristallo';
UPDATE public.hr_people SET gross_year = 18306.00, agreed_net = 1600
  WHERE full_name = 'Sabrina Nastro';
UPDATE public.hr_people SET gross_year = 9600.00, agreed_net = 800
  WHERE full_name = 'Agostino Abate';

-- ── le righe di agosto nel conto economico ──────────────────────────────────
-- Agosto porta ancora la stima vecchia (budget = effettivo, nessuno l'ha
-- guardata) e nessun cedolino: si sostituisce col tetto letto dai documenti di
-- giugno. **Luglio non si tocca**: lì l'effettivo è diverso dal preventivato,
-- quindi qualcuno ha registrato i numeri veri di quel mese, e un consuntivo non
-- si sostituisce con una stima per quanto buona sia.
UPDATE public.pl_cost_lines c SET budget = v.tetto, actual = v.tetto,
  note = 'Tetto §236 dal LUL di giugno: retribuzione, contributi ricavati dall''F24, INAIL, TFR, trasferte a copertura del netto concordato e rateo di tredicesima'
FROM public.pl_months m, (VALUES
  ('Michele Cristallo%', 2603.34::numeric),
  ('Sabrina Nastro%',    1942.17::numeric),
  ('Agostino Abate%',     846.00::numeric)
) AS v(pattern, tetto)
WHERE c.month_id = m.id AND m.month = DATE '2026-08-01'
  AND c.category = 'Personale' AND c.paid = false AND c.label LIKE v.pattern;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Dopo: /economics/personale mostra «Quanto costa un dipendente al mese» con
-- tetto 5.392 €/mese sui tre dipendenti (8.192 € con le due P.IVA), punta
-- 8.754 € nel mese delle tredicesime, e l'aliquota datore ricavata dal modello —
-- 29,57%, non il 30% di configurazione. Le due P.IVA restano quello che
-- fatturano: 1.300 e 1.500.
--
-- Sulla tenuta di cassa: **agosto non cambia**, perché il costo del lavoro di
-- agosto esce il 20 settembre e nella finestra di agosto c'è quello di luglio,
-- che resta com'è. Cambia il rotolo dei mesi — da settembre l'area Personale
-- pesa 1.182 € in meno al mese, e sul semestre sono 7.091 €.
