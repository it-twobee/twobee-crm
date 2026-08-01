-- 182 — Il cedolino batte la stima.
--
-- La 181 calcolava il costo di una persona **partendo dalla RAL**: utile per
-- decidere se assumere, inutile per sapere cosa è successo a giugno. Da qui in
-- poi la fonte è il documento vero — il cedolino, la fattura, l'F24 — e la
-- stima resta solo dove il documento non c'è ancora, dichiarata come tale.
--
-- LA REGOLA CHE TIENE IN PIEDI TUTTO. Tre valori diversi che nessuno deve
-- sommare fra loro:
--
--   COSTO ECONOMICO   quanto pesa il mese sul conto economico, per competenza:
--                     competenze + contributi datore + INAIL + TFR maturato.
--                     Il TFR c'è anche se non è ancora uscito un euro.
--
--   USCITA DI CASSA   quanto è uscito davvero dalla banca: il netto ai
--                     dipendenti, l'F24, le fatture pagate. Il TFR **non** sta
--                     qui finché non lo si liquida — e quando lo si liquida non
--                     torna nel costo, perché era già stato contato allora.
--
--   NETTO PERCEPITO   quanto ha ricevuto la persona. Per un dipendente si legge
--                     dal cedolino. Per una P.IVA **non esiste**: Two Bee
--                     conosce l'importo della fattura, non le imposte personali
--                     del professionista. Chiamarlo «netto» sarebbe inventarlo.
--
-- Sommare netto + F24 + costo aziendale conta gli stessi soldi tre volte. Le
-- tabelle qui sotto tengono i tre piani separati per costruzione, non per
-- disciplina di chi inserisce.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) Anagrafica: i campi che servono davvero a un'amministrazione
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.hr_people
  ADD COLUMN IF NOT EXISTS status          TEXT NOT NULL DEFAULT 'attiva'
    CHECK (status IN ('attiva','sospesa','cessata')),
  ADD COLUMN IF NOT EXISTS ccnl            TEXT,
  ADD COLUMN IF NOT EXISTS contract_level  TEXT,
  ADD COLUMN IF NOT EXISTS part_time_pct   NUMERIC(5,4),
  ADD COLUMN IF NOT EXISTS agreed_net      NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS iban            TEXT,
  ADD COLUMN IF NOT EXISTS vat_number      TEXT,
  ADD COLUMN IF NOT EXISTS tax_regime      TEXT,
  ADD COLUMN IF NOT EXISTS applies_vat     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS applies_withholding BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pension_fund_pct NUMERIC(6,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS admin_note      TEXT;

-- soci e fornitori operativi: la 181 non li prevedeva
ALTER TABLE public.hr_people DROP CONSTRAINT IF EXISTS hr_people_contract_kind_check;
ALTER TABLE public.hr_people ADD CONSTRAINT hr_people_contract_kind_check
  CHECK (contract_kind IN (
    'indeterminato','determinato','apprendistato','tirocinio','cococo',
    'piva_ordinario','piva_forfettario','occasionale',
    'socio_compenso','socio_fattura','fornitore'));

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) Cedolini: dipendenti, apprendisti, tirocinanti
-- ═══════════════════════════════════════════════════════════════════════════
-- Ogni colonna ha il suo nome esatto. «Lordo» è ambiguo — contrattuale?
-- competenze? imponibile? — e l'ambiguità qui costa: le tre cose sono numeri
-- diversi e chi le confonde sbaglia il costo.
CREATE TABLE IF NOT EXISTS public.hr_payslips (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id         UUID NOT NULL REFERENCES public.hr_people(id) ON DELETE CASCADE,
  month             DATE NOT NULL,

  -- ── competenze ──────────────────────────────────────────────────────────
  base_pay          NUMERIC(10,2) NOT NULL DEFAULT 0,
  holidays_taken    NUMERIC(10,2) NOT NULL DEFAULT 0,
  leave_paid        NUMERIC(10,2) NOT NULL DEFAULT 0,
  public_holidays   NUMERIC(10,2) NOT NULL DEFAULT 0,
  thirteenth        NUMERIC(10,2) NOT NULL DEFAULT 0,
  fourteenth        NUMERIC(10,2) NOT NULL DEFAULT 0,
  overtime          NUMERIC(10,2) NOT NULL DEFAULT 0,
  bonus             NUMERIC(10,2) NOT NULL DEFAULT 0,
  allowances        NUMERIC(10,2) NOT NULL DEFAULT 0,
  reimbursements    NUMERIC(10,2) NOT NULL DEFAULT 0,
  travel            NUMERIC(10,2) NOT NULL DEFAULT 0,
  /* Il totale del cedolino si TRASCRIVE, non si ricalcola: se la somma delle
     voci non lo raggiunge vuol dire che manca una riga, e il tool deve dirlo
     invece di nasconderlo dietro un totale che si è calcolato da solo. */
  total_earnings    NUMERIC(10,2) NOT NULL DEFAULT 0,

  -- ── imponibili: due, e diversi fra loro ─────────────────────────────────
  contributory_base NUMERIC(10,2) NOT NULL DEFAULT 0,
  taxable_base      NUMERIC(10,2) NOT NULL DEFAULT 0,

  -- ── trattenute alla persona ─────────────────────────────────────────────
  employee_contrib  NUMERIC(10,2) NOT NULL DEFAULT 0,
  irpef             NUMERIC(10,2) NOT NULL DEFAULT 0,
  surcharges        NUMERIC(10,2) NOT NULL DEFAULT 0,
  other_deductions  NUMERIC(10,2) NOT NULL DEFAULT 0,
  rounding          NUMERIC(8,2)  NOT NULL DEFAULT 0,
  net_paid          NUMERIC(10,2) NOT NULL DEFAULT 0,

  -- ── oneri del datore: NULL = non ancora avuti dal consulente ────────────
  -- Zero e «non lo so» sono cose diverse: uno dice che non si paga, l'altro
  -- che manca il dato. Con NULL il tool stima e lo dichiara.
  employer_contrib  NUMERIC(10,2),
  inail             NUMERIC(10,2),
  other_employer    NUMERIC(10,2) NOT NULL DEFAULT 0,
  tfr_accrued       NUMERIC(10,2) NOT NULL DEFAULT 0,

  -- ── pagamenti ───────────────────────────────────────────────────────────
  net_paid_on       DATE,
  f24_paid_on       DATE,
  payment_status    TEXT NOT NULL DEFAULT 'da_pagare'
    CHECK (payment_status IN ('da_pagare','pagato','parziale')),
  note              TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (person_id, month)
);

CREATE INDEX IF NOT EXISTS idx_hr_payslips_month ON public.hr_payslips (month);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) Fatture dei collaboratori: qui non esistono lordo e netto
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.hr_invoices (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id      UUID NOT NULL REFERENCES public.hr_people(id) ON DELETE CASCADE,
  month          DATE NOT NULL,
  invoice_number TEXT,
  invoice_date   DATE,
  taxable        NUMERIC(10,2) NOT NULL DEFAULT 0,
  pension_fund   NUMERIC(10,2) NOT NULL DEFAULT 0,
  vat            NUMERIC(10,2) NOT NULL DEFAULT 0,
  /* L'IVA detraibile non è un costo: si recupera. Trattarla come costo gonfia
     il conto economico del 22% su ogni fattura. */
  vat_deductible BOOLEAN NOT NULL DEFAULT true,
  withholding    NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_invoice  NUMERIC(10,2) NOT NULL DEFAULT 0,
  /* Quello che esce dalla banca: totale meno la ritenuta, che Two Bee versa
     allo Stato per conto del professionista. */
  amount_to_pay  NUMERIC(10,2) NOT NULL DEFAULT 0,
  paid_on        DATE,
  payment_status TEXT NOT NULL DEFAULT 'da_pagare'
    CHECK (payment_status IN ('da_pagare','pagata','parziale')),
  has_document   BOOLEAN NOT NULL DEFAULT false,
  note           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (person_id, month, invoice_number)
);

CREATE INDEX IF NOT EXISTS idx_hr_invoices_month ON public.hr_invoices (month);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) F24: un dato aziendale, aggregato per natura
-- ═══════════════════════════════════════════════════════════════════════════
-- Non si ripartisce sui singoli. Il tool può dire quanto è stato trattenuto
-- alle persone (somma dei cedolini) e quindi quanto resta a carico azienda,
-- ma quel resto è un totale: attribuirlo a testa sarebbe inventare.
CREATE TABLE IF NOT EXISTS public.hr_f24 (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month              DATE NOT NULL UNIQUE,
  erario_gross       NUMERIC(10,2) NOT NULL DEFAULT 0,
  credit_offset      NUMERIC(10,2) NOT NULL DEFAULT 0,
  erario_balance     NUMERIC(10,2) NOT NULL DEFAULT 0,
  inps               NUMERIC(10,2) NOT NULL DEFAULT 0,
  inail              NUMERIC(10,2) NOT NULL DEFAULT 0,
  other              NUMERIC(10,2) NOT NULL DEFAULT 0,
  total              NUMERIC(10,2) NOT NULL DEFAULT 0,
  paid_on            DATE,
  /* true solo quando esiste il prospetto individuale del consulente: finché è
     false, il costo per persona resta una stima e la pagina lo scrive. */
  individual_detail  BOOLEAN NOT NULL DEFAULT false,
  note               TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 5) TFR: un registro, non un calcolo al volo
-- ═══════════════════════════════════════════════════════════════════════════
-- Il maturato lo dicono i cedolini. Qui si registra cosa se n'è fatto:
-- versato a un fondo, liquidato alla persona, anticipato. La differenza fra
-- maturato e movimentato è il debito verso chi lavora — e va guardata.
CREATE TABLE IF NOT EXISTS public.hr_tfr_movements (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id  UUID NOT NULL REFERENCES public.hr_people(id) ON DELETE CASCADE,
  month      DATE NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('fondo','liquidazione','anticipo','rivalutazione')),
  amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hr_tfr_person ON public.hr_tfr_movements (person_id, month);

-- ── aggiornamento automatico di updated_at ──────────────────────────────────
DROP TRIGGER IF EXISTS trg_hr_payslips_touch ON public.hr_payslips;
CREATE TRIGGER trg_hr_payslips_touch BEFORE UPDATE ON public.hr_payslips
  FOR EACH ROW EXECUTE FUNCTION public.hr_people_touch();
DROP TRIGGER IF EXISTS trg_hr_invoices_touch ON public.hr_invoices;
CREATE TRIGGER trg_hr_invoices_touch BEFORE UPDATE ON public.hr_invoices
  FOR EACH ROW EXECUTE FUNCTION public.hr_people_touch();
DROP TRIGGER IF EXISTS trg_hr_f24_touch ON public.hr_f24;
CREATE TRIGGER trg_hr_f24_touch BEFORE UPDATE ON public.hr_f24
  FOR EACH ROW EXECUTE FUNCTION public.hr_people_touch();

-- ── RLS: retribuzioni e fatture, admin e basta ──────────────────────────────
ALTER TABLE public.hr_payslips      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_invoices      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_f24           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_tfr_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_payslips_admin ON public.hr_payslips;
DROP POLICY IF EXISTS hr_payslips_own   ON public.hr_payslips;
CREATE POLICY hr_payslips_admin ON public.hr_payslips FOR ALL
  USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');
-- il proprio cedolino si può leggere: è suo
CREATE POLICY hr_payslips_own ON public.hr_payslips FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.hr_people p WHERE p.id = person_id AND p.profile_id = auth.uid()));

DROP POLICY IF EXISTS hr_invoices_admin ON public.hr_invoices;
DROP POLICY IF EXISTS hr_invoices_own   ON public.hr_invoices;
CREATE POLICY hr_invoices_admin ON public.hr_invoices FOR ALL
  USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');
CREATE POLICY hr_invoices_own ON public.hr_invoices FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.hr_people p WHERE p.id = person_id AND p.profile_id = auth.uid()));

DROP POLICY IF EXISTS hr_f24_admin ON public.hr_f24;
CREATE POLICY hr_f24_admin ON public.hr_f24 FOR ALL
  USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS hr_tfr_admin ON public.hr_tfr_movements;
DROP POLICY IF EXISTS hr_tfr_own   ON public.hr_tfr_movements;
CREATE POLICY hr_tfr_admin ON public.hr_tfr_movements FOR ALL
  USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');
CREATE POLICY hr_tfr_own ON public.hr_tfr_movements FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.hr_people p WHERE p.id = person_id AND p.profile_id = auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════════
-- 6) L'organico reale di Two Bee, e i cedolini di giugno 2026
-- ═══════════════════════════════════════════════════════════════════════════
-- Idempotente: si riconosce per nome, quindi rilanciare non duplica.
INSERT INTO public.hr_people
  (full_name, role_label, contract_kind, gross_year, months, fte, agreed_net, sort_order, note)
SELECT * FROM (VALUES
  ('Michele Cristallo',  'IT Specialist',                   'indeterminato',   0::numeric, 14, 1::numeric, NULL::numeric,      10,
   'Costo datoriale individuale da acquisire dal consulente paghe.'),
  ('Sabrina Nastro',     'Marketing Specialist',            'apprendistato',   0::numeric, 14, 1::numeric, 1600.00::numeric,   20,
   'Netto concordato 1.600: giugno chiude a 1.568, scostamento da verificare. Controllare trasferte, riduzione imponibile IRPEF e residuo ferie negativo.'),
  ('Agostino Abate',     'Media Buyer Junior',              'tirocinio',       0::numeric, 12, 1::numeric, 800.00::numeric,    30,
   'Indennità 800 + trasferte. Nessun TFR, nessuna mensilità aggiuntiva.'),
  ('Gabriele Saraiello', 'Marketing Automation Specialist', 'piva_ordinario',  15600::numeric, 12, 1::numeric, NULL::numeric,  40,
   'IVA e regime fiscale da configurare sulla base della fattura.'),
  ('Annalisa Smiraglia', 'Consulenza marketing e digital',  'piva_ordinario',  18000::numeric, 12, 1::numeric, NULL::numeric,  50,
   'Primo periodo 15/06/2026 - 15/07/2026. Cassa previdenziale, IVA e maggiorazioni da leggere dalla fattura.')
) AS v(full_name, role_label, contract_kind, gross_year, months, fte, agreed_net, sort_order, note)
WHERE NOT EXISTS (SELECT 1 FROM public.hr_people p WHERE p.full_name = v.full_name);

-- ── cedolini di giugno 2026, trascritti dai documenti ───────────────────────
-- employer_contrib e inail restano NULL: l'F24 è aggregato e non li dice.
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

-- ── fatture di giugno: importi noti, IVA e ritenuta da leggere dai documenti ─
INSERT INTO public.hr_invoices (person_id, month, taxable, total_invoice, amount_to_pay, has_document, note)
SELECT p.id, DATE '2026-06-01', v.taxable, v.taxable, v.taxable, false, v.note
FROM (VALUES
  ('Gabriele Saraiello', 1300.00::numeric, 'Importi IVA, cassa e ritenuta da inserire dalla fattura ricevuta.'),
  ('Annalisa Smiraglia',  750.00::numeric, 'Mezzo mese: primo periodo dal 15/06. Verificare sulla fattura.')
) AS v(full_name, taxable, note)
JOIN public.hr_people p ON p.full_name = v.full_name
WHERE NOT EXISTS (
  SELECT 1 FROM public.hr_invoices i WHERE i.person_id = p.id AND i.month = DATE '2026-06-01');

-- ── F24 di giugno 2026 ──────────────────────────────────────────────────────
INSERT INTO public.hr_f24 (month, erario_gross, credit_offset, erario_balance, inps, total, individual_detail, note)
VALUES (DATE '2026-06-01', 246.46, 107.04, 139.42, 802.00, 941.42, false,
  'Dato aggregato. La ripartizione individuale del contributo datoriale richiede il prospetto costo aziendale per dipendente, il riepilogo contributivo individuale o il dettaglio UniEmens.')
ON CONFLICT (month) DO NOTHING;

NOTIFY pgrst, 'reload schema';
