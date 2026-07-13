-- 108 — Storage interno (MinIO su VPS). Metadati dei file caricati dalla UI del CRM.
-- I binari vivono su MinIO (bucket `twobee-crm`, interno alla VPS, mai esposto);
-- qui teniamo SOLO i metadati. L'accesso passa sempre dal backend (/api/files/*),
-- che usa il service role → RLS come difesa in profondità, non come unica barriera.
-- Additiva + idempotente.

CREATE TABLE IF NOT EXISTS public.files (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket       text NOT NULL DEFAULT 'twobee-crm',
  object_key   text NOT NULL,
  folder       text NOT NULL DEFAULT 'misc',
  entity_type  text,
  entity_id    uuid,
  name         text NOT NULL,
  mime         text,
  size         bigint,
  uploaded_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS files_object_key_uidx ON public.files (object_key);
CREATE INDEX IF NOT EXISTS files_folder_idx     ON public.files (folder);
CREATE INDEX IF NOT EXISTS files_entity_idx     ON public.files (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS files_uploaded_by_idx ON public.files (uploaded_by);

ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

-- Admin: pieno accesso.
DROP POLICY IF EXISTS files_admin_all ON public.files;
CREATE POLICY files_admin_all ON public.files
  FOR ALL USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- Owner: legge / crea / cancella i propri file.
DROP POLICY IF EXISTS files_owner_select ON public.files;
CREATE POLICY files_owner_select ON public.files
  FOR SELECT USING (uploaded_by = auth.uid());

DROP POLICY IF EXISTS files_owner_insert ON public.files;
CREATE POLICY files_owner_insert ON public.files
  FOR INSERT WITH CHECK (uploaded_by = auth.uid());

DROP POLICY IF EXISTS files_owner_delete ON public.files;
CREATE POLICY files_owner_delete ON public.files
  FOR DELETE USING (uploaded_by = auth.uid());

-- Team: legge i file delle cartelle NON sensibili (le sensibili restano owner/admin).
DROP POLICY IF EXISTS files_team_select ON public.files;
CREATE POLICY files_team_select ON public.files
  FOR SELECT USING (
    public.get_my_role() = 'team'
    AND folder NOT IN ('payslips', 'personal', 'best_ideas')
  );
