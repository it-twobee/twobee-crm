-- Migration 082: hr_requests — ferie, permessi, malattia, spese

CREATE TABLE IF NOT EXISTS public.hr_requests (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type           TEXT NOT NULL
    CHECK (type IN ('ferie', 'permesso', 'malattia', 'spesa', 'documento_hr')),
  status         TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  start_date     DATE,
  end_date       DATE,
  notes          TEXT,
  amount         DECIMAL(10,2),
  attachment_url TEXT,
  reviewed_by    UUID REFERENCES public.profiles(id),
  reviewed_at    TIMESTAMPTZ,
  review_note    TEXT,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hr_requests_profile ON public.hr_requests(profile_id);
CREATE INDEX IF NOT EXISTS idx_hr_requests_status  ON public.hr_requests(status);

ALTER TABLE public.hr_requests ENABLE ROW LEVEL SECURITY;

-- La risorsa vede solo le proprie richieste; admin/founder vedono tutte
CREATE POLICY "hr_requests_read" ON public.hr_requests
  FOR SELECT USING (
    profile_id = auth.uid()
    OR public.get_my_role() = 'admin'
    OR public.is_founder()
    OR public.has_permission('can_approve_hr')
  );

-- La risorsa può creare le proprie richieste
CREATE POLICY "hr_requests_insert" ON public.hr_requests
  FOR INSERT WITH CHECK (profile_id = auth.uid());

-- La risorsa può cancellare le proprie richieste pending; admin può tutto
CREATE POLICY "hr_requests_update" ON public.hr_requests
  FOR UPDATE USING (
    (profile_id = auth.uid() AND status = 'pending')
    OR public.get_my_role() = 'admin'
    OR public.is_founder()
    OR public.has_permission('can_approve_hr')
  );
