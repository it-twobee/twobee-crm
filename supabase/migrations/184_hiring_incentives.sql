-- 184 — Agevolazioni: quello che lo Stato non ti chiede.
--
-- Il costo del lavoro in Italia non è una moltiplicazione: è una moltiplicazione
-- meno gli esoneri. Un under 30 mai assunto a tempo indeterminato costa metà
-- contributi per tre anni (entro 3.000 € l'anno); un apprendista in un'azienda
-- fino a nove dipendenti costa il 3,11% invece del 30% nel primo anno; una
-- persona rientrata dall'estero paga IRPEF su metà del reddito per cinque anni,
-- e il costo per l'azienda non cambia di un euro. Fino a questa migration il
-- tool calcolava il costo pieno per tutti: sbagliava per eccesso, che sui piani
-- del personale è il modo migliore per non assumere nessuno.
--
-- Quattro cose:
--
--   1) hr_payroll_params guadagna le aliquote 2026 vere (IRPEF al 33% sul
--      secondo scaglione, buono pasto a 10 €, premi di risultato all'1% entro
--      5.000 €), le aliquote dell'apprendistato per anno e dimensione, e due
--      fatti dell'azienda — fino a nove dipendenti? unità produttiva in ZES? —
--      da cui dipende quale sconto spetta.
--
--   2) hr_incentives: il catalogo degli esoneri, con percentuale, tetti,
--      finestra delle assunzioni ammesse e riferimento normativo. Sta nel
--      database per la stessa ragione delle aliquote: fra il 2024 e il 2026 le
--      misure sui giovani hanno cambiato pelle tre volte, e il codice non è il
--      posto dove si rincorre una norma.
--
--   3) hr_people guadagna i dati che decidono l'eleggibilità: data di
--      assunzione, «mai assunto a tempo indeterminato», esonero applicato, anno
--      di apprendistato, rientro dei cervelli, categoria protetta per la
--      maxi-deduzione.
--
--   4) tax_config guadagna le maggiorazioni di deduzione (maxi-deduzione 120 e
--      130%, iper-ammortamento 2026) perché sono imposte risparmiate, e la
--      sezione Fiscale le deve poter dire.
--
-- **I valori seed non sono un dato ufficiale.** `verified_at` è NULL apposta:
-- finché resta NULL l'interfaccia dichiara che sta stimando. In particolare il
-- nuovo esonero 2026 (L. 199/2025, art. 1 co. 153-155) rinvia importi e
-- requisiti a un decreto ministeriale: le cifre seminate qui sono anticipazioni
-- di stampa, non norma, e la riga lo scrive.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) Aliquote 2026 e due fatti dell'azienda
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.hr_payroll_params
  -- apprendistato fino a 9 dipendenti: l'aliquota cambia ogni anno di contratto
  -- (1,5% · 3% · 10%, più 1,61% di NASpI e fondi interprofessionali)
  ADD COLUMN IF NOT EXISTS inps_apprentice_y1_pct       NUMERIC(6,4) NOT NULL DEFAULT 0.0311,
  ADD COLUMN IF NOT EXISTS inps_apprentice_y2_pct       NUMERIC(6,4) NOT NULL DEFAULT 0.0461,
  ADD COLUMN IF NOT EXISTS inps_apprentice_y3_pct       NUMERIC(6,4) NOT NULL DEFAULT 0.1161,
  -- l'apprendista versa 5,84% invece di 9,19%: a parità di lordo il netto è più alto
  ADD COLUMN IF NOT EXISTS inps_apprentice_employee_pct NUMERIC(6,4) NOT NULL DEFAULT 0.0584,
  -- fino a 9 dipendenti: non è un'aliquota, è la condizione da cui dipendono
  ADD COLUMN IF NOT EXISTS small_company                BOOLEAN NOT NULL DEFAULT true,
  -- unità produttiva nella ZES unica Mezzogiorno: alza i tetti degli esoneri
  ADD COLUMN IF NOT EXISTS zes                          BOOLEAN NOT NULL DEFAULT false,
  -- rientro dei cervelli (D.Lgs. 209/2023, art. 5)
  ADD COLUMN IF NOT EXISTS impatriate_pct               NUMERIC(6,4) NOT NULL DEFAULT 0.5000,
  ADD COLUMN IF NOT EXISTS impatriate_children_pct      NUMERIC(6,4) NOT NULL DEFAULT 0.6000,
  ADD COLUMN IF NOT EXISTS impatriate_cap               NUMERIC(12,2) NOT NULL DEFAULT 600000,
  ADD COLUMN IF NOT EXISTS impatriate_years             INT NOT NULL DEFAULT 5;

COMMENT ON COLUMN public.hr_payroll_params.small_company IS
  'Fino a 9 dipendenti: decide l''aliquota dell''apprendistato (3,11% il primo anno invece di 11,61%).';
COMMENT ON COLUMN public.hr_payroll_params.impatriate_pct IS
  'Quota di reddito esente da IRPEF. Non tocca i contributi né il costo aziendale: alza solo il netto.';

-- Le novità 2026 sulle aliquote già esistenti (L. 199/2025):
--  · secondo scaglione IRPEF dal 35% al 33% (28.000-50.000 €)
--  · buono pasto elettronico esente da 8 a 10 € al giorno
--  · premi di risultato: imposta sostitutiva dall'5% all'1%, tetto da 3.000 a 5.000 €
--  · apprendistato oltre 9 dipendenti: 11,61% (era seminato 11,50%)
UPDATE public.hr_payroll_params SET
  irpef_brackets = '[{"upTo":28000,"rate":0.23},{"upTo":50000,"rate":0.33},{"upTo":null,"rate":0.43}]'::jsonb,
  meal_voucher_exempt = 10,
  productivity_bonus_pct = 0.0100,
  productivity_bonus_cap = 5000,
  inps_apprentice_pct = 0.1161,
  note = COALESCE(note || ' ', '') ||
    'Aggiornato dalla 184 con le novità 2026 (L. 199/2025): IRPEF 33% sul secondo scaglione, '
    'buono pasto 10 €, premi di risultato 1% entro 5.000 €. Da far confermare al consulente.',
  updated_at = now()
WHERE year = 2026;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) Il catalogo degli esoneri
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.hr_incentives (
  code                  TEXT PRIMARY KEY,
  label                 TEXT NOT NULL,
  -- una riga che dice cos'è, per chi non fa contratti di mestiere
  what                  TEXT NOT NULL,

  -- quanto vale: quota dei contributi DATORE che non si versa, e i tetti
  exempt_pct            NUMERIC(6,4) NOT NULL DEFAULT 1 CHECK (exempt_pct >= 0 AND exempt_pct <= 1),
  monthly_cap           NUMERIC(10,2),
  yearly_cap            NUMERIC(10,2),
  -- nella ZES Mezzogiorno il tetto mensile è più alto, quando la misura lo prevede
  zes_monthly_cap       NUMERIC(10,2),
  duration_months       INT NOT NULL DEFAULT 24 CHECK (duration_months > 0),

  -- a chi spetta: quello che il tool può verificare da sé
  window_from           DATE,
  window_to             DATE,
  max_age               INT,
  requires_never_stable BOOLEAN NOT NULL DEFAULT false,
  requires_net_increase BOOLEAN NOT NULL DEFAULT false,
  zes_only              BOOLEAN NOT NULL DEFAULT false,
  kinds                 TEXT[] NOT NULL DEFAULT ARRAY['indeterminato'],

  -- quello che il tool NON può verificare resta scritto, non dedotto
  conditions            TEXT[] NOT NULL DEFAULT '{}',
  -- true = si propone solo a mano: i requisiti non stanno in anagrafica
  manual_only           BOOLEAN NOT NULL DEFAULT false,
  -- true = non più attivabile. Resta in tabella per non riproporla e non dimenticarla
  closed                BOOLEAN NOT NULL DEFAULT false,
  active                BOOLEAN NOT NULL DEFAULT true,

  legal_ref             TEXT NOT NULL,
  source_url            TEXT,
  note                  TEXT,
  -- NULL = valori di partenza: la pagina dichiara che sta stimando
  verified_at           DATE,
  verified_by           TEXT,
  sort_order            INT NOT NULL DEFAULT 0,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.hr_incentives IS
  'Esoneri contributivi sulle assunzioni. verified_at NULL = numeri non confermati da un consulente.';
COMMENT ON COLUMN public.hr_incentives.conditions IS
  'Condizioni che il tool non può verificare: si mostrano, non si danno per vere.';

INSERT INTO public.hr_incentives (
  code, label, what, exempt_pct, monthly_cap, yearly_cap, zes_monthly_cap, duration_months,
  window_from, window_to, max_age, requires_never_stable, requires_net_increase, zes_only,
  kinds, conditions, manual_only, closed, legal_ref, note, sort_order
) VALUES
  ('under30_strutturale', 'Esonero strutturale under 30',
   'Metà dei contributi a carico azienda per tre anni, su chi non ha ancora trent''anni e non è mai stato assunto a tempo indeterminato.',
   0.50, 250, 3000, NULL, 36,
   NULL, NULL, 29, true, false, false,
   ARRAY['indeterminato','apprendistato'],
   ARRAY[
     'Mai assunto a tempo indeterminato da nessuno: apprendistato, intermittente e lavoro domestico non contano.',
     'Non si applica ai profili dirigenziali.',
     'Sull''apprendista vale nei dodici mesi successivi alla conferma in indeterminato.'
   ],
   false, false, 'L. 205/2017, art. 1 co. 100-108',
   'È l''unica misura sui giovani davvero strutturale: non ha una finestra da rispettare.', 10),

  ('esonero_2026', 'Nuovo esonero occupazione stabile 2026',
   'Esonero dei contributi datore sulle assunzioni a tempo indeterminato del 2026: giovani, donne svantaggiate e ZES Mezzogiorno.',
   1.00, 650, 8000, 800, 24,
   '2026-01-01', '2026-12-31', NULL, false, true, false,
   ARRAY['indeterminato'],
   ARRAY[
     'Importi e requisiti li fissa un decreto del Ministero del Lavoro: fino a quel decreto le cifre qui sono anticipazioni di stampa, non norma.',
     'Vale per assunzioni a tempo indeterminato e trasformazioni fatte fra il 1º gennaio e il 31 dicembre 2026.',
     'Esclusi i premi INAIL e i profili dirigenziali.',
     'Risorse stanziate a tetto di spesa: l''ordine di arrivo conta.'
   ],
   false, false, 'L. 199/2025 (bilancio 2026), art. 1 co. 153-155',
   'Le tre platee e i tetti differenziati vanno riletti quando esce il decreto attuativo.', 20),

  ('under35_coesione', 'Bonus giovani under 35 (decreto Coesione)',
   'Azzeramento dei contributi datore per due anni sugli under 35 mai occupati stabilmente. Finestra chiusa: resta per le posizioni già in corso.',
   1.00, 500, NULL, 650, 24,
   '2024-09-01', '2025-12-31', 34, true, true, false,
   ARRAY['indeterminato'],
   ARRAY[
     'La finestra delle nuove assunzioni è chiusa: la legge di bilancio 2026 non l''ha prorogata e l''ha sostituita col nuovo esonero.',
     'Chi l''ha già attivata la porta a termine per i 24 mesi: va tenuta in conto nel costo, non riproposta.',
     'Sulle code di stabilizzazione dei primi mesi 2026 le fonti divergono: verificare col consulente prima di contarci.'
   ],
   false, true, 'D.L. 60/2024 (Coesione), art. 22', NULL, 30),

  ('donne_svantaggiate', 'Bonus assunzione donne svantaggiate',
   'Esonero sui contributi datore per l''assunzione di donne senza impiego regolarmente retribuito da almeno ventiquattro mesi.',
   1.00, 650, NULL, 800, 24,
   NULL, NULL, NULL, false, true, false,
   ARRAY['indeterminato','determinato'],
   ARRAY[
     'Serve la condizione di svantaggio documentata: 24 mesi senza impiego regolarmente retribuito, 6 nelle aree svantaggiate.',
     'Richiede incremento occupazionale netto.',
     'Non è in anagrafica il dato che serve a proporlo da sé: si valuta caso per caso.'
   ],
   true, false, 'D.L. 60/2024, art. 23 · L. 92/2012, art. 4 co. 8-11', NULL, 40),

  ('over50', 'Bonus over 50 disoccupati',
   'Metà dei contributi datore per l''assunzione di chi ha più di cinquant''anni ed è disoccupato da oltre dodici mesi.',
   0.50, NULL, NULL, NULL, 18,
   NULL, NULL, NULL, false, false, false,
   ARRAY['indeterminato','determinato'],
   ARRAY[
     'Disoccupazione da oltre dodici mesi da dimostrare.',
     'Diciotto mesi sull''indeterminato, dodici sul determinato.'
   ],
   true, false, 'L. 92/2012, art. 4 co. 8-11', NULL, 50),

  ('decontribuzione_sud', 'Decontribuzione Sud PMI',
   'Sconto sui contributi datore per le imprese con unità produttive nel Mezzogiorno, in riduzione anno per anno.',
   0.20, 125, NULL, NULL, 12,
   NULL, NULL, NULL, false, false, true,
   ARRAY['indeterminato'],
   ARRAY[
     'Solo unità produttive nelle regioni del Mezzogiorno.',
     'La percentuale scende ogni anno fino al 2029: quella del 2026 va verificata prima di usarla.',
     'Autorizzazione europea e regime de minimis: lo verifica il consulente, non il tool.'
   ],
   true, false, 'L. 207/2024 (bilancio 2025), art. 1 co. 406-412', NULL, 60)
ON CONFLICT (code) DO NOTHING;

CREATE OR REPLACE FUNCTION public.hr_incentives_touch()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_hr_incentives_touch ON public.hr_incentives;
CREATE TRIGGER trg_hr_incentives_touch BEFORE UPDATE ON public.hr_incentives
  FOR EACH ROW EXECUTE FUNCTION public.hr_incentives_touch();

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) L'organico: i dati che decidono l'eleggibilità
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.hr_people
  -- da qui corrono la finestra della misura e i mesi di durata
  ADD COLUMN IF NOT EXISTS hired_on            DATE,
  -- requisito degli esoneri giovani: lo dichiara la persona, non lo sa il tool
  ADD COLUMN IF NOT EXISTS never_stable        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS incentive_code      TEXT REFERENCES public.hr_incentives(code) ON DELETE SET NULL,
  -- 1, 2 o 3: l'aliquota dell'apprendistato cambia ogni anno di contratto
  ADD COLUMN IF NOT EXISTS apprentice_year     INT NOT NULL DEFAULT 1 CHECK (apprentice_year BETWEEN 1 AND 3),
  -- rientro dei cervelli: primo anno di residenza fiscale in Italia
  ADD COLUMN IF NOT EXISTS impatriate_from     DATE,
  ADD COLUMN IF NOT EXISTS impatriate_children BOOLEAN NOT NULL DEFAULT false,
  -- categoria meritevole di maggior tutela: maxi-deduzione al 130% invece del 120%
  ADD COLUMN IF NOT EXISTS protected_category  BOOLEAN NOT NULL DEFAULT false;

-- chi c'era già ha la data d'inizio rapporto: è la stessa cosa
UPDATE public.hr_people SET hired_on = start_date
WHERE hired_on IS NULL AND start_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hr_people_incentive ON public.hr_people (incentive_code);

COMMENT ON COLUMN public.hr_people.never_stable IS
  'Mai assunto a tempo indeterminato da nessuno: requisito degli esoneri giovani. Va dichiarato, non dedotto.';
COMMENT ON COLUMN public.hr_people.impatriate_from IS
  'Primo anno di residenza fiscale italiana: da lì corrono i cinque periodi agevolati.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) Le maggiorazioni di deduzione della società
-- ═══════════════════════════════════════════════════════════════════════════
-- Non sono contributi: sono imposte. La maxi-deduzione è extracontabile — non
-- tocca il conto economico, si applica in dichiarazione — e l'iper-ammortamento
-- si spalma sugli anni di ammortamento. Stanno in configurazione perché la
-- sezione Fiscale le deve poter quantificare senza numeri nel codice.
ALTER TABLE public.tax_config
  ADD COLUMN IF NOT EXISTS maxi_deduction_pct           NUMERIC(6,4) NOT NULL DEFAULT 0.2000,
  ADD COLUMN IF NOT EXISTS maxi_deduction_protected_pct NUMERIC(6,4) NOT NULL DEFAULT 0.3000,
  ADD COLUMN IF NOT EXISTS hyper_amort_pct              NUMERIC(6,4) NOT NULL DEFAULT 1.8000,
  ADD COLUMN IF NOT EXISTS hyper_amort_cap              NUMERIC(14,2) NOT NULL DEFAULT 2500000;

COMMENT ON COLUMN public.tax_config.maxi_deduction_pct IS
  'Maggiorazione della deduzione sul costo dei nuovi assunti a tempo indeterminato (D.Lgs. 216/2023, art. 4). Solo IRES, non IRAP.';
COMMENT ON COLUMN public.tax_config.hyper_amort_pct IS
  'Iper-ammortamento 2026: maggiorazione del costo dei beni 4.0 nella prima fascia di investimento.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 5) «Persone» diventa «Personale», e da Costi & budget si legge soltanto
-- ═══════════════════════════════════════════════════════════════════════════
-- L'area del costo del lavoro si poteva scrivere a mano come un abbonamento,
-- mentre le stesse cifre le calcolava già l'organico: due posti che scrivono la
-- stessa riga danno sempre due numeri, e vince quello modificato per ultimo.
-- Ora il nome è quello della sezione a cui rimanda, e il piano dei costi la
-- mostra in sola lettura (il blocco vero sta nelle server action).
UPDATE public.cost_centers SET name = 'Personale', updated_at = now()
WHERE lower(trim(name)) = 'persone';

-- le righe già scritte nei mesi passati prendono la nuova etichetta, altrimenti
-- «sostituisci invece di sommare» non le troverebbe più e le raddoppierebbe
UPDATE public.pl_cost_lines SET category = 'Personale' WHERE category = 'Persone';

-- ═══════════════════════════════════════════════════════════════════════════
-- 6) RLS: le agevolazioni sono dati economici, il catalogo è normativa
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.hr_incentives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_incentives_admin ON public.hr_incentives;
DROP POLICY IF EXISTS hr_incentives_read  ON public.hr_incentives;
CREATE POLICY hr_incentives_admin ON public.hr_incentives FOR ALL
  USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');
-- il catalogo in sé non è un dato sensibile: è legge. Le retribuzioni restano
-- chiuse in hr_people, e lì la RLS non cambia.
CREATE POLICY hr_incentives_read ON public.hr_incentives FOR SELECT
  USING (public.is_staff());

NOTIFY pgrst, 'reload schema';
