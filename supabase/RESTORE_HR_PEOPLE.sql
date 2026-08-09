-- ═══════════════════════════════════════════════════════════════════════════
-- RIPRISTINO ORGANICO — 2026-08-09
--
-- Quattro persone su cinque sono state eliminate da `hr_people` per togliere
-- il loro costo dal mese di maggio. Eliminare una persona la toglie da **tutti**
-- i mesi e si porta dietro i cedolini (FK ON DELETE CASCADE): dei tre cedolini
-- di giugno non è rimasto niente.
--
-- I valori qui sotto sono quelli letti dal database poco prima della
-- cancellazione — stessi id, quindi tornano al loro posto anche i riferimenti.
-- Idempotente: rilanciarlo non duplica niente.
--
-- Blocco 4: le date di assunzione che decidono in quali mesi la persona pesa.
-- Da qui in poi non serve più eliminare nessuno: `inForce` filtra per mese, e
-- lo stipendio del mese esce comunque il 20 di quello dopo (§224).
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;

-- ── 1. le quattro persone, com'erano ────────────────────────────────────────
INSERT INTO public.hr_people (
  id, profile_id, full_name, role_label, contract_kind, gross_year, months, fte,
  benefits_year, meal_days, meal_value, with_rivalsa, startup_rate,
  from_month, to_month, start_date, end_date, tfr_opening, is_active, note, sort_order,
  status, ccnl, contract_level, part_time_pct, agreed_net, iban, vat_number, tax_regime,
  applies_vat, applies_withholding, pension_fund_pct, admin_note,
  birth_date, has_children, children_count, dependent_spouse,
  hired_on, never_stable, incentive_code, apprentice_year,
  impatriate_from, impatriate_children, protected_category
) VALUES
(
  '4b1bf42f-de3d-47f8-936d-66a28233a4d5', 'b6814438-7ff1-455c-bdc0-030fc27de1cd',
  'Michele Cristallo', 'IT Specialist', 'indeterminato', 24021.75, 14, 1,
  200, 0, 0, false, false,
  5, 12, DATE '2026-05-06', NULL, 0, true, NULL, 10,
  'attiva', 'H011 (codice cedolino) — livello 6, 168 h/mese, 26 gg', '6', NULL, 1300, NULL, NULL, NULL,
  false, false, 0,
  $nota$Dati da LUL giugno 2026 e C2/storico CPI Nocera Inferiore del 16/03/2026. CF CRSMHL91A10G230K, nato il 10/01/1991 a Pagani (SA): 35 anni, quindi apprendistato e esonero under 30 non sono possibili. ESONERI: nessuno spetta. Il C2 riporta un rapporto a TEMPO INDETERMINATO con AFFINITY SRL dal 05/11/2024 (part-time 30 h, sviluppatore software), quindi il requisito "mai assunto a tempo indeterminato" del nuovo esonero 2026 non c'è: i ~14.400 € ipotizzati non sono dovuti. DA VERIFICARE col consulente: al 16/03/2026 quel rapporto risultava ancora aperto e Two Bee lo ha assunto il 06/05/2026 — controllare cessazione o cumulo di rapporti. Il cedolino riporta anche una scadenza 05/2029 (36 mesi dall'assunzione): capire a cosa si riferisce, perché non è una scadenza da tempo indeterminato. È tutor aziendale del tirocinio di Agostino Abate.$nota$,
  DATE '1991-01-10', false, 0, false,
  DATE '2026-05-06', false, NULL, 1,
  NULL, false, false
),
(
  'a07cca59-676b-4e51-87e9-db9b4ee37555', '9c4eb033-dce9-4fd0-814c-9814ad8ee6ad',
  'Sabrina Nastro', 'Marketing Specialist', 'apprendistato', 30232.35, 14, 1,
  200, 0, 0, false, false,
  6, 12, DATE '2026-06-03', NULL, 0, true,
  $n2$Netto concordato 1.600: giugno chiude a 1.568, scostamento da verificare. Controllare trasferte, riduzione imponibile IRPEF e residuo ferie negativo.$n2$, 20,
  'attiva', 'H011 (codice cedolino) — livello 6, 168 h/mese, 26 gg', '6', NULL, 1400, NULL, NULL, NULL,
  false, false, 0,
  $nota$Dati da LUL giugno 2026 e attestato CPI Castellammare di Stabia del 27/03/2026. CF NSTSRN98E57L845Q, nata il 17/05/1998 a Vico Equense (NA): 28 anni, quindi l'apprendistato professionalizzante è legittimo (limite 29 anni compiuti). Assunta il 03/06/2026, apprendistato in corso: 1º anno, aliquota datore 3,11% fino a maggio 2027; il cedolino riporta scadenza 06/2029, cioè i 36 mesi di formazione. Prima dell'assunzione risultava DISOCCUPATA dal 29/08/2025 (210 giorni al 27/03/2026). ALLA CONFERMA in indeterminato: l'aliquota agevolata prosegue 12 mesi e in quella finestra si può sommare l'esonero strutturale under 30 (50% dei contributi entro 3.000 €/anno per 36 mesi), ma serve il requisito "mai assunta a tempo indeterminato": chiedere il suo C2/storico, la DID da sola non lo dimostra. Compirà 30 anni il 17/05/2028.$nota$,
  DATE '1998-05-17', false, 0, false,
  DATE '2026-06-03', false, NULL, 1,
  DATE '2026-01-01', false, false
),
(
  '4c0743f2-1e2d-4fbc-908f-1bb92469560b', 'beee9012-5434-4bd2-9f21-3cf8f2c16ec2',
  'Agostino Abate', 'Media Buyer Junior', 'tirocinio', 12000, 12, 1,
  0, 0, 0, false, false,
  6, 12, DATE '2026-06-05', DATE '2027-06-04', 0, true,
  $n3$Indennità 800 + trasferte. Nessun TFR, nessuna mensilità aggiuntiva.$n3$, 30,
  'attiva', NULL, NULL, NULL, 800, NULL, NULL, NULL,
  false, false, 0,
  $nota$Dati dal Progetto Formativo Individuale prot. 767/2026 (convenzione 03/06/2026, DGR Campania 103/2018). CF BTAGTN99E19C525O, nato il 19/05/1999 a Cerreto Sannita (BN): 27 anni. Tirocinio di 12 mesi dal 05/06/2026 al 04/06/2027, indennità 800 €/mese. Soggetto promotore TALENTI S.R.L. (P.IVA 04404410617), tutor didattico Alessandra Schepis; tutor aziendale Michele Cristallo. ALLA FINE DEL TIROCINIO (giugno 2027) avrà 28 anni: l'apprendistato professionalizzante è ancora possibile fino al 19/05/2029, e fino a nove dipendenti costa il 3,11% invece del 30%. Sul tirocinio non ci sono contributi datore da esonerare: nessun esonero è applicabile ora.$nota$,
  DATE '1999-05-19', false, 0, false,
  DATE '2026-06-05', false, NULL, 1,
  NULL, false, false
),
(
  'e5f6e2b4-45c7-4503-a3bb-10b3febb10f9', '2c01b230-c1ba-49fc-9a54-eb569c44c830',
  'Annalisa Smiraglia', 'Consulenza marketing e digital', 'piva_forfettario', 18000, 12, 1,
  0, 0, 0, false, true,
  6, 12, NULL, NULL, 0, true,
  $n4$Regime confermato dalle fatture di giugno e agosto: nessuna IVA, nessuna ritenuta, imponibile = importo pagato. Manca la partita IVA in anagrafica.$n4$, 50,
  'attiva', NULL, NULL, NULL, NULL, NULL, NULL, 'forfettario',
  false, false, 0, NULL,
  NULL, false, 0, false,
  DATE '2026-06-01', false, NULL, 1,
  NULL, false, false
)
ON CONFLICT (id) DO NOTHING;

-- ── 2. i cedolini di giugno, spariti col CASCADE ────────────────────────────
-- Stessi valori della 182: employer_contrib e inail restano NULL perché l'F24
-- è aggregato e non li dice (§182 — «il documento batte la stima», e quello che
-- il documento non dice non si inventa).
INSERT INTO public.hr_payslips
  (person_id, month, base_pay, travel, total_earnings, contributory_base, taxable_base,
   employee_contrib, irpef, rounding, net_paid, tfr_accrued, note)
SELECT p.id, DATE '2026-06-01', v.base_pay, v.travel, v.total_earnings,
       v.contributory_base, v.taxable_base, v.employee_contrib, v.irpef,
       v.rounding, v.net_paid, v.tfr, v.note
FROM (VALUES
  ('Michele Cristallo', 1861.80::numeric,  0.00::numeric, 1861.80::numeric, 1861.80::numeric, 1699.87::numeric,
   161.93::numeric, 199.87::numeric, 0.00::numeric,  1500.00::numeric, 120.51::numeric,
   'Contributi datore e INAIL da prospetto consulente.'),
  ('Sabrina Nastro',    1654.27::numeric,  0.00::numeric, 1654.27::numeric, 1654.27::numeric, 1569.58::numeric,
    84.69::numeric,   2.38::numeric, 0.80::numeric,  1568.00::numeric, 107.25::numeric,
   'Netto concordato 1.600: scostamento di 32 da chiarire col consulente.'),
  ('Agostino Abate',     800.00::numeric, 46.00::numeric,  846.00::numeric,    0.00::numeric,  843.71::numeric,
     2.29::numeric,  44.21::numeric, 0.50::numeric,   800.00::numeric,   0.00::numeric,
   'Tirocinio: nessun TFR e nessuna contribuzione previdenziale ordinaria.')
) AS v(full_name, base_pay, travel, total_earnings, contributory_base, taxable_base,
       employee_contrib, irpef, rounding, net_paid, tfr, note)
JOIN public.hr_people p ON p.full_name = v.full_name
WHERE NOT EXISTS (
  SELECT 1 FROM public.hr_payslips s WHERE s.person_id = p.id AND s.month = DATE '2026-06-01');

-- ── 3. la fattura di giugno di Annalisa (Gabriele non è stato toccato) ───────
INSERT INTO public.hr_invoices (person_id, month, taxable, total_invoice, amount_to_pay, has_document, note)
SELECT p.id, DATE '2026-06-01', 750.00, 750.00, 750.00, false,
  'Mezzo mese: primo periodo dal 15/06. Verificare sulla fattura.'
FROM public.hr_people p
WHERE p.full_name = 'Annalisa Smiraglia'
  AND NOT EXISTS (SELECT 1 FROM public.hr_invoices i WHERE i.person_id = p.id AND i.month = DATE '2026-06-01');

-- ── 4. da quale mese ciascuno pesa ──────────────────────────────────────────
-- `hired_on` è l'unica cosa che decide in quali mesi una persona entra nel
-- conto economico. Il pagamento resta il 20 del mese dopo (regola `mese_succ_20`
-- dell'area Personale, §224): non si configura, discende dalla natura della voce.
UPDATE public.hr_people SET hired_on = DATE '2026-04-01', from_month = 4
  WHERE full_name = 'Gabriele Saraiello';
UPDATE public.hr_people SET hired_on = DATE '2026-06-01', from_month = 6
  WHERE full_name = 'Annalisa Smiraglia';
-- Michele (06/05) e Agostino (05/06) hanno già la data giusta dal LUL.
-- Sabrina: il LUL e il CPI dicono 03/06/2026, e il cedolino di giugno è il
-- primo. Se ha lavorato anche a maggio è un altro rapporto e va scritto qui:
-- UPDATE public.hr_people SET hired_on = DATE '2026-05-01', from_month = 5
--   WHERE full_name = 'Sabrina Nastro';

-- ── 5. le righe di maggio di chi non era ancora in forza ────────────────────
-- Agostino entra il 5 giugno: la sua riga di maggio non è mai stata pagata e
-- non doveva esserci. Si toglie solo quella non pagata — una riga pagata è un
-- fatto, e si cancella solo dopo aver capito a cosa corrispondeva quel bonifico.
DELETE FROM public.pl_cost_lines c
USING public.pl_months m
WHERE c.month_id = m.id AND m.month = DATE '2026-05-01'
  AND c.category = 'Personale' AND c.paid = false
  AND c.label LIKE 'Agostino Abate%';

COMMIT;

-- Rimasta fuori di proposito: la riga di maggio di Annalisa Smiraglia (1.500 €)
-- risulta **pagata il 20/06**. O era in forza a maggio — e allora la data giusta
-- è maggio, non giugno — o quel bonifico paga altro. Va guardato prima di
-- toccarlo: cancellare un pagamento registrato è l'unico errore che non si vede
-- più. Quando è chiaro, una delle due:
--   UPDATE public.hr_people SET hired_on = DATE '2026-05-01' WHERE full_name = 'Annalisa Smiraglia';
--   -- oppure
--   DELETE FROM public.pl_cost_lines c USING public.pl_months m
--    WHERE c.month_id = m.id AND m.month = DATE '2026-05-01'
--      AND c.category = 'Personale' AND c.label LIKE 'Annalisa Smiraglia%';
