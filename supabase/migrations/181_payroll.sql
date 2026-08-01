-- 181 — Personale: quanto costa davvero una persona, e da dove viene il numero.
--
-- La voce «Persone» del conto economico era una spesa scritta a mano come le
-- altre: 8.640 € al mese, cinque righe, nessuno in grado di dire come si
-- arrivasse a quella cifra o cosa succedesse assumendo un sesto. Da qui in poi
-- quel numero è **derivato**: c'è un organico, ogni persona ha un contratto, e
-- il costo lo calcola il motore in `lib/payroll.ts`.
--
-- Due tabelle e una regola.
--
--   hr_payroll_params  le aliquote, per anno, con la fonte e la data in cui
--                      qualcuno le ha verificate. Nessuna percentuale sta nel
--                      codice: un'aliquota nel codice è un'aliquota che nessuno
--                      aggiorna, e nel 2027 il conto è sbagliato in silenzio.
--
--   hr_people          l'organico: contratto, retribuzione, mensilità, benefit.
--                      Una riga per persona, anche per chi è a P.IVA — il costo
--                      di un fornitore ricorrente è costo del personale a tutti
--                      gli effetti, anche se non passa dalla busta paga.
--
-- La regola: **i valori seed non sono un dato ufficiale.** Sono la fotografia
-- della normativa per come è nota a chi scrive, `verified_at` è NULL apposta, e
-- finché resta NULL l'interfaccia dichiara che sta stimando. Il consulente del
-- lavoro conferma, si segna la data, e da lì i numeri hanno un padre.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) Aliquote e parametri, per anno
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.hr_payroll_params (
  year                        INT PRIMARY KEY,

  -- contributi previdenziali
  inps_employer_pct           NUMERIC(6,4) NOT NULL DEFAULT 0.3000,
  inps_apprentice_pct         NUMERIC(6,4) NOT NULL DEFAULT 0.1150,
  inps_employee_pct           NUMERIC(6,4) NOT NULL DEFAULT 0.0919,
  inail_pct                   NUMERIC(6,4) NOT NULL DEFAULT 0.0050,
  fixed_term_extra_pct        NUMERIC(6,4) NOT NULL DEFAULT 0.0140,
  gestione_separata_pct       NUMERIC(6,4) NOT NULL DEFAULT 0.2607,
  gestione_separata_cap       NUMERIC(12,2) NOT NULL DEFAULT 120607,

  -- TFR (art. 2120 c.c.): una mensilità ogni 13,5, meno il Fondo di garanzia
  tfr_divisor                 NUMERIC(6,3) NOT NULL DEFAULT 13.5,
  tfr_fund_pct                NUMERIC(6,4) NOT NULL DEFAULT 0.0050,
  tfr_reval_fixed_pct         NUMERIC(6,4) NOT NULL DEFAULT 0.0150,
  tfr_reval_inflation_share   NUMERIC(6,4) NOT NULL DEFAULT 0.7500,

  -- IRPEF: scaglioni come JSON, perché il numero di scaglioni cambia con le riforme
  irpef_brackets              JSONB NOT NULL DEFAULT
    '[{"upTo":28000,"rate":0.23},{"upTo":50000,"rate":0.35},{"upTo":null,"rate":0.43}]'::jsonb,
  regional_surcharge_pct      NUMERIC(6,4) NOT NULL DEFAULT 0.0173,
  municipal_surcharge_pct     NUMERIC(6,4) NOT NULL DEFAULT 0.0080,
  employee_deduction          NUMERIC(10,2) NOT NULL DEFAULT 1955,
  employee_deduction_cap      NUMERIC(10,2) NOT NULL DEFAULT 28000,

  -- regime forfettario
  flat_tax_pct                NUMERIC(6,4) NOT NULL DEFAULT 0.1500,
  flat_tax_startup_pct        NUMERIC(6,4) NOT NULL DEFAULT 0.0500,
  flat_tax_profitability      NUMERIC(6,4) NOT NULL DEFAULT 0.7800,
  flat_tax_ceiling            NUMERIC(12,2) NOT NULL DEFAULT 85000,
  withholding_pct             NUMERIC(6,4) NOT NULL DEFAULT 0.2000,
  vat_pct                     NUMERIC(6,4) NOT NULL DEFAULT 0.2200,

  -- welfare: le leve legali per far arrivare di più senza spendere di più
  fringe_benefit_cap          NUMERIC(10,2) NOT NULL DEFAULT 1000,
  fringe_benefit_cap_children NUMERIC(10,2) NOT NULL DEFAULT 2000,
  meal_voucher_exempt         NUMERIC(6,2) NOT NULL DEFAULT 8,
  productivity_bonus_pct      NUMERIC(6,4) NOT NULL DEFAULT 0.0500,
  productivity_bonus_cap      NUMERIC(10,2) NOT NULL DEFAULT 3000,

  -- da dove vengono e chi li ha confermati: senza, restano una stima
  source                      TEXT,
  verified_at                 DATE,
  verified_by                 TEXT,
  note                        TEXT,
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.hr_payroll_params IS
  'Aliquote per anno. verified_at NULL = valori di partenza, non confermati da un consulente.';

INSERT INTO public.hr_payroll_params (year, source, note) VALUES (
  2026,
  'Valori di partenza, non verificati',
  'L''aliquota INPS a carico azienda dipende dal CCNL e dalla dimensione: 29-32% nel terziario. '
  'L''INAIL dipende dalla lavorazione. Far confermare tutto al consulente del lavoro e compilare verified_at.'
) ON CONFLICT (year) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) L'organico
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.hr_people (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- collegabile a un profilo del tool, ma non obbligatorio: un collaboratore
  -- esterno può costare senza avere un account
  profile_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  full_name      TEXT NOT NULL,
  role_label     TEXT,
  contract_kind  TEXT NOT NULL DEFAULT 'indeterminato' CHECK (contract_kind IN (
                   'indeterminato','determinato','apprendistato','tirocinio',
                   'cococo','piva_ordinario','piva_forfettario','occasionale')),
  -- subordinati: RAL annua lorda, tredicesima e quattordicesima incluse.
  -- autonomi: compenso annuo concordato.
  gross_year     NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (gross_year >= 0),
  months         INT NOT NULL DEFAULT 14 CHECK (months BETWEEN 12 AND 14),
  fte            NUMERIC(4,3) NOT NULL DEFAULT 1 CHECK (fte > 0 AND fte <= 1),
  benefits_year  NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (benefits_year >= 0),
  meal_days      INT NOT NULL DEFAULT 0 CHECK (meal_days >= 0 AND meal_days <= 366),
  meal_value     NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (meal_value >= 0),
  with_rivalsa   BOOLEAN NOT NULL DEFAULT false,
  startup_rate   BOOLEAN NOT NULL DEFAULT false,
  -- chi entra a settembre non costa dodici mesi
  from_month     INT NOT NULL DEFAULT 1  CHECK (from_month BETWEEN 1 AND 12),
  to_month       INT NOT NULL DEFAULT 12 CHECK (to_month   BETWEEN 1 AND 12),
  start_date     DATE,
  end_date       DATE,
  -- TFR già accantonato negli anni precedenti: serve a sapere il debito vero
  tfr_opening    NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (tfr_opening >= 0),
  is_active      BOOLEAN NOT NULL DEFAULT true,
  note           TEXT,
  sort_order     INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hr_people_active ON public.hr_people (is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_hr_people_profile ON public.hr_people (profile_id);

CREATE OR REPLACE FUNCTION public.hr_people_touch()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_hr_people_touch ON public.hr_people;
CREATE TRIGGER trg_hr_people_touch BEFORE UPDATE ON public.hr_people
  FOR EACH ROW EXECUTE FUNCTION public.hr_people_touch();

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) RLS: è il dato più personale che ci sia
-- ═══════════════════════════════════════════════════════════════════════════
-- Le retribuzioni dei colleghi non le vede nessuno tranne gli admin. Nemmeno i
-- manager: sapere quanto prende chi ti sta accanto non serve a lavorare.
ALTER TABLE public.hr_payroll_params ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_people         ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_payroll_params_admin ON public.hr_payroll_params;
CREATE POLICY hr_payroll_params_admin ON public.hr_payroll_params FOR ALL
  USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS hr_people_admin ON public.hr_people;
DROP POLICY IF EXISTS hr_people_own   ON public.hr_people;
CREATE POLICY hr_people_admin ON public.hr_people FOR ALL
  USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');
-- ciascuno può leggere la propria riga: è la sua retribuzione, non un segreto
CREATE POLICY hr_people_own ON public.hr_people FOR SELECT
  USING (profile_id = auth.uid());

NOTIFY pgrst, 'reload schema';
