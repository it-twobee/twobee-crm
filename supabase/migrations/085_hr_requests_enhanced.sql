-- Migration 085: HR Requests potenziato — orari, upload file, contrattualistica ferie

-- ─── Nuovi campi su hr_requests ─────────────────────────────────────────────
ALTER TABLE public.hr_requests
  ADD COLUMN IF NOT EXISTS is_full_day BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS start_time TIME,
  ADD COLUMN IF NOT EXISTS end_time TIME;

-- ─── Tabella contratti dipendenti con ferie/permessi annuali ─────────────────
CREATE TABLE IF NOT EXISTS public.employee_contracts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  contract_type   TEXT NOT NULL DEFAULT 'indeterminato'
    CHECK (contract_type IN ('indeterminato', 'determinato', 'stage', 'freelance', 'collaborazione', 'apprendistato')),
  start_date      DATE NOT NULL,
  end_date        DATE,
  annual_vacation_days  INT NOT NULL DEFAULT 26,
  annual_leave_hours    INT NOT NULL DEFAULT 56,
  weekly_hours    INT NOT NULL DEFAULT 40,
  ral             DECIMAL(10,2),
  level           TEXT,
  ccnl            TEXT DEFAULT 'Commercio',
  notes           TEXT,
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_contracts_active
  ON public.employee_contracts(profile_id) WHERE is_active = true;

ALTER TABLE public.employee_contracts ENABLE ROW LEVEL SECURITY;

-- La risorsa vede solo il proprio contratto
CREATE POLICY "ec_read_own" ON public.employee_contracts
  FOR SELECT USING (
    profile_id = auth.uid()
    OR public.get_my_role() = 'admin'
    OR public.is_founder()
  );

-- Solo admin/founder modifica
CREATE POLICY "ec_write_admin" ON public.employee_contracts
  FOR ALL USING (
    public.get_my_role() = 'admin'
    OR public.is_founder()
  );

-- ─── Funzione calcolo ferie maturate e residue ─────────────────────────────
CREATE OR REPLACE FUNCTION public.get_vacation_balance(p_profile_id UUID, p_year INT DEFAULT EXTRACT(YEAR FROM now())::INT)
RETURNS TABLE(
  annual_days INT,
  accrued_days NUMERIC,
  used_days NUMERIC,
  remaining_days NUMERIC,
  annual_leave_hours INT,
  used_leave_hours NUMERIC,
  remaining_leave_hours NUMERIC
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_contract RECORD;
  v_months NUMERIC;
  v_used_vacation NUMERIC;
  v_used_leave NUMERIC;
BEGIN
  SELECT ec.* INTO v_contract
  FROM public.employee_contracts ec
  WHERE ec.profile_id = p_profile_id AND ec.is_active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 0, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 0, 0::NUMERIC, 0::NUMERIC;
    RETURN;
  END IF;

  -- Mesi maturati nell'anno (da inizio anno o data assunzione, quello che è dopo)
  v_months := LEAST(
    EXTRACT(MONTH FROM now()),
    CASE
      WHEN EXTRACT(YEAR FROM v_contract.start_date) = p_year
      THEN EXTRACT(MONTH FROM now()) - EXTRACT(MONTH FROM v_contract.start_date) + 1
      ELSE EXTRACT(MONTH FROM now())
    END
  );
  IF v_months < 0 THEN v_months := 0; END IF;

  -- Ferie usate nell'anno
  SELECT COALESCE(SUM(
    CASE
      WHEN hr.end_date IS NOT NULL
      THEN (hr.end_date - hr.start_date + 1)
      ELSE CASE WHEN hr.is_full_day THEN 1 ELSE 0.5 END
    END
  ), 0) INTO v_used_vacation
  FROM public.hr_requests hr
  WHERE hr.profile_id = p_profile_id
    AND hr.type = 'ferie'
    AND hr.status IN ('pending', 'approved')
    AND EXTRACT(YEAR FROM hr.start_date) = p_year;

  -- Permessi usati (ore)
  SELECT COALESCE(SUM(
    CASE
      WHEN hr.start_time IS NOT NULL AND hr.end_time IS NOT NULL
      THEN EXTRACT(EPOCH FROM (hr.end_time - hr.start_time)) / 3600
      ELSE CASE WHEN hr.is_full_day THEN 8 ELSE 4 END
    END
  ), 0) INTO v_used_leave
  FROM public.hr_requests hr
  WHERE hr.profile_id = p_profile_id
    AND hr.type = 'permesso'
    AND hr.status IN ('pending', 'approved')
    AND EXTRACT(YEAR FROM hr.start_date) = p_year;

  RETURN QUERY SELECT
    v_contract.annual_vacation_days,
    ROUND(v_contract.annual_vacation_days * v_months / 12, 1),
    v_used_vacation,
    ROUND(v_contract.annual_vacation_days * v_months / 12 - v_used_vacation, 1),
    v_contract.annual_leave_hours,
    v_used_leave,
    ROUND(v_contract.annual_leave_hours - v_used_leave, 1);
END;
$$;
