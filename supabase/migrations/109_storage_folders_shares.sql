-- 109 — Storage: cartelle/sottocartelle + condivisioni esterne.
-- Estende lo storage interno (108) con:
--   • file_folders: alberatura virtuale (parent_id self-ref) dentro un contesto
--     (folder-categoria + entity_type/entity_id). I binari restano su MinIO.
--   • files.folder_id: file dentro una cartella (NULL = radice del contesto).
--   • file_shares: link pubblici, non indovinabili, revocabili, con scadenza opz.
-- Additiva + idempotente.

-- ── Cartelle ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.file_folders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  parent_id   uuid REFERENCES public.file_folders(id) ON DELETE CASCADE,
  folder      text NOT NULL DEFAULT 'misc',
  entity_type text,
  entity_id   uuid,
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS file_folders_parent_idx  ON public.file_folders (parent_id);
CREATE INDEX IF NOT EXISTS file_folders_context_idx ON public.file_folders (folder, entity_type, entity_id);

ALTER TABLE public.files ADD COLUMN IF NOT EXISTS folder_id uuid REFERENCES public.file_folders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS files_folder_id_idx ON public.files (folder_id);

-- ── Condivisioni ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.file_shares (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id     uuid NOT NULL REFERENCES public.files(id) ON DELETE CASCADE,
  token       text NOT NULL UNIQUE,
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  expires_at  timestamptz,
  revoked     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS file_shares_file_idx ON public.file_shares (file_id);

-- ── RLS (difesa in profondità; il backend usa service role) ──────────────────
ALTER TABLE public.file_folders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS file_folders_admin_all ON public.file_folders;
CREATE POLICY file_folders_admin_all ON public.file_folders
  FOR ALL USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');
DROP POLICY IF EXISTS file_folders_owner_all ON public.file_folders;
CREATE POLICY file_folders_owner_all ON public.file_folders
  FOR ALL USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());
DROP POLICY IF EXISTS file_folders_team_select ON public.file_folders;
CREATE POLICY file_folders_team_select ON public.file_folders
  FOR SELECT USING (
    public.get_my_role() = 'team'
    AND folder NOT IN ('payslips', 'personal', 'best_ideas')
  );

ALTER TABLE public.file_shares ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS file_shares_admin_all ON public.file_shares;
CREATE POLICY file_shares_admin_all ON public.file_shares
  FOR ALL USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');
DROP POLICY IF EXISTS file_shares_owner_all ON public.file_shares;
CREATE POLICY file_shares_owner_all ON public.file_shares
  FOR ALL USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());
