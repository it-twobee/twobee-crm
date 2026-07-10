-- Documenti personali della risorsa, con scadenze e rinnovi.
--
-- Owner-only: ognuno vede e gestisce i propri. L'admin può leggerli e caricarli
-- (serve per l'onboarding e per la conformità), ma non è un archivio condiviso:
-- nessun collega vede i documenti di un altro.

CREATE TABLE IF NOT EXISTS public.personal_documents (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  doc_type             TEXT NOT NULL,
  label                TEXT NOT NULL,
  file_path            TEXT,
  file_name            TEXT,
  issued_at            DATE,
  expires_at           DATE,
  reminder_days_before INT NOT NULL DEFAULT 30 CHECK (reminder_days_before BETWEEN 0 AND 365),
  notes                TEXT,
  created_by           UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_personal_documents_profile ON public.personal_documents(profile_id);
CREATE INDEX IF NOT EXISTS idx_personal_documents_expires ON public.personal_documents(expires_at);

ALTER TABLE public.personal_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS personal_documents_select ON public.personal_documents;
CREATE POLICY personal_documents_select ON public.personal_documents
  FOR SELECT USING (
    profile_id = auth.uid() OR public.get_my_role() = 'admin'
  );

DROP POLICY IF EXISTS personal_documents_insert ON public.personal_documents;
CREATE POLICY personal_documents_insert ON public.personal_documents
  FOR INSERT WITH CHECK (
    profile_id = auth.uid() OR public.get_my_role() = 'admin'
  );

DROP POLICY IF EXISTS personal_documents_update ON public.personal_documents;
CREATE POLICY personal_documents_update ON public.personal_documents
  FOR UPDATE USING (
    profile_id = auth.uid() OR public.get_my_role() = 'admin'
  ) WITH CHECK (
    profile_id = auth.uid() OR public.get_my_role() = 'admin'
  );

DROP POLICY IF EXISTS personal_documents_delete ON public.personal_documents;
CREATE POLICY personal_documents_delete ON public.personal_documents
  FOR DELETE USING (
    profile_id = auth.uid() OR public.get_my_role() = 'admin'
  );
