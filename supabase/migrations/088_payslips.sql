-- Buste paga.
--
-- Dati retributivi: il dipendente vede SOLO le proprie, nessun collega.
-- Solo admin/super_admin caricano, modificano, eliminano e leggono le altrui.
-- I file stanno nel bucket privato `payslips` (da creare a mano dal Dashboard
-- Supabase: i bucket non sono creabili da migration) e si scaricano con signed
-- URL a scadenza breve generati server-side. Mai URL pubblici.

CREATE TABLE IF NOT EXISTS public.payslips (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  year        INT  NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  month       INT  NOT NULL CHECK (month BETWEEN 1 AND 12),
  file_path   TEXT NOT NULL,
  file_name   TEXT,
  notes       TEXT,
  uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payslips_profile_period
  ON public.payslips(profile_id, year, month);
CREATE INDEX IF NOT EXISTS idx_payslips_profile ON public.payslips(profile_id);

ALTER TABLE public.payslips ENABLE ROW LEVEL SECURITY;

-- Lettura: la propria busta paga, oppure qualunque busta se admin.
DROP POLICY IF EXISTS payslips_select ON public.payslips;
CREATE POLICY payslips_select ON public.payslips
  FOR SELECT USING (
    profile_id = auth.uid() OR public.get_my_role() = 'admin'
  );

-- Scrittura: solo admin. Un dipendente non carica né modifica buste paga,
-- nemmeno le proprie (sarebbe un canale per alterare il documento).
DROP POLICY IF EXISTS payslips_insert ON public.payslips;
CREATE POLICY payslips_insert ON public.payslips
  FOR INSERT WITH CHECK (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS payslips_update ON public.payslips;
CREATE POLICY payslips_update ON public.payslips
  FOR UPDATE USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS payslips_delete ON public.payslips;
CREATE POLICY payslips_delete ON public.payslips
  FOR DELETE USING (public.get_my_role() = 'admin');
