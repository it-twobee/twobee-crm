-- Migration 080: documents.visibility + chat_channels tipo partner_customer_care

-- ─── documents: campo visibility ─────────────────────────────────────────────
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'internal'
    CHECK (visibility IN (
      'internal',
      'operations_visible',
      'partner_visible',
      'client_visible',
      'private_admin',
      'private_founder',
      'shared_in_report',
      'draft'
    ));

-- ─── RLS documenti: visibility-aware ─────────────────────────────────────────
-- Rimuove policy esistente se presente, poi ricrea
DROP POLICY IF EXISTS "documents_read" ON public.documents;
DROP POLICY IF EXISTS "documents_select" ON public.documents;

CREATE POLICY "documents_visibility_read" ON public.documents
  FOR SELECT USING (
    CASE visibility
      WHEN 'private_founder'    THEN public.is_founder()
      WHEN 'private_admin'      THEN public.get_my_role() = 'admin' OR public.is_founder()
      WHEN 'internal'           THEN public.get_my_role() IN ('admin', 'team') OR public.is_founder()
      WHEN 'operations_visible' THEN
        public.is_workspace_user()
        OR public.get_my_role() IN ('admin', 'team')
        OR public.is_founder()
      WHEN 'partner_visible'    THEN
        public.is_partner_user()
        OR public.get_my_role() IN ('admin', 'team')
        OR public.is_founder()
      WHEN 'client_visible'     THEN
        client_id = public.get_my_client_id_as_client()
        OR public.get_my_role() IN ('admin', 'team')
        OR public.is_founder()
      WHEN 'shared_in_report'   THEN true
      WHEN 'draft'              THEN public.get_my_role() = 'admin' OR public.is_founder()
      ELSE false
    END
  );

-- Scrittura documenti: team/admin + founder (invariato, aggiunge visibility)
DROP POLICY IF EXISTS "documents_write" ON public.documents;
CREATE POLICY "documents_write" ON public.documents
  FOR INSERT WITH CHECK (
    public.get_my_role() IN ('admin', 'team')
    OR public.is_founder()
    OR public.is_workspace_user()
    OR public.is_partner_user()
  );

DROP POLICY IF EXISTS "documents_update" ON public.documents;
CREATE POLICY "documents_update" ON public.documents
  FOR UPDATE USING (
    uploaded_by = auth.uid()
    OR public.get_my_role() = 'admin'
    OR public.is_founder()
  );

-- ─── chat_channels: aggiungi tipo partner_customer_care ──────────────────────
ALTER TABLE public.chat_channels
  DROP CONSTRAINT IF EXISTS chat_channels_type_check;
ALTER TABLE public.chat_channels
  ADD CONSTRAINT chat_channels_type_check
    CHECK (type IN (
      'cliente', 'interno', 'task', 'customer_care',
      'cliente_interno', 'partner_customer_care'
    ));
