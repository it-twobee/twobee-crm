-- 272 — La sfida LinkedIn del team (§477).
-- Una riga per post: reazioni, commenti e impression come le legge l'estensione
-- dal profilo di chi carica. L'identità la dà il login dell'OS, non il file.
-- Scrive solo `caricaCsvLinkedin` (service role, dopo il controllo di ruolo e
-- la regola del mese in `lib/linkedin.ts`): dal browser nessuna scrittura.
-- Lo staff interno legge tutto — è una classifica —, il portale cliente niente.
-- Prerequisiti: nessuno oltre a `get_my_role()` e `workspace_sections` (087).
-- Additiva e rilanciabile.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.linkedin_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- unico da solo: un post ha un autore, e lo stesso post caricato da due
  -- persone vuol dire che una delle due ha caricato quello di un altro
  post_urn text NOT NULL UNIQUE CHECK (post_urn ~ '^urn:li:(activity|share|ugcPost):[0-9]{15,22}$'),
  url text NOT NULL CHECK (url ~ '^https://www\.linkedin\.com/'),
  -- mese di Roma della pubblicazione, dall'ID del post (non dal file)
  mese text NOT NULL CHECK (mese ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  published_at timestamptz NOT NULL,
  testo text NOT NULL DEFAULT '' CHECK (char_length(testo) <= 280),
  reazioni integer NOT NULL CHECK (reazioni >= 0),
  commenti integer NOT NULL CHECK (commenti >= 0),
  -- NULL = non letto dall'estensione: «n/d», mai zero
  diffusioni integer CHECK (diffusioni >= 0),
  impression integer CHECK (impression >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS linkedin_posts_mese_idx ON public.linkedin_posts (mese, profile_id);

ALTER TABLE public.linkedin_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS linkedin_posts_staff_read ON public.linkedin_posts;
CREATE POLICY linkedin_posts_staff_read ON public.linkedin_posts
  FOR SELECT TO authenticated
  USING (public.get_my_role() IN ('admin', 'team'));

INSERT INTO public.workspace_sections
  (key, label, description, route, icon, sort_order, group_key, group_order, is_active)
SELECT
  'sfida_linkedin', 'Sfida LinkedIn', 'La classifica del mese: impression, reazioni e commenti dei post del team',
  '/workspace/linkedin', 'Trophy',
  COALESCE((SELECT max(sort_order) + 1 FROM public.workspace_sections WHERE group_key = 'team' AND key <> 'sfida_linkedin'), 20),
  'team',
  COALESCE((SELECT min(group_order) FROM public.workspace_sections WHERE group_key = 'team'), 3),
  true
ON CONFLICT (key) DO UPDATE SET
  label       = EXCLUDED.label,
  description = EXCLUDED.description,
  route       = EXCLUDED.route,
  icon        = EXCLUDED.icon,
  group_key   = EXCLUDED.group_key,
  is_active   = true;

INSERT INTO public.workspace_section_permissions
  (section_id, app_role, can_view, can_create, can_edit, can_delete)
SELECT s.id, r.app_role, true, true, false, false
FROM public.workspace_sections AS s
CROSS JOIN (VALUES ('manager'),('senior'),('junior'),('stage'),('freelance'),('partner')) AS r(app_role)
WHERE s.key = 'sfida_linkedin'
  AND NOT EXISTS (
    SELECT 1 FROM public.workspace_section_permissions AS p
    WHERE p.section_id = s.id AND p.app_role = r.app_role
  );

NOTIFY pgrst, 'reload schema';
COMMIT;

-- verifica: tabella con RLS e una sola policy (lettura), la voce nel workspace
SELECT
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'linkedin_posts') AS rls,
  (SELECT count(*) FROM pg_policies WHERE tablename = 'linkedin_posts') AS policy,
  (SELECT count(*) FROM public.workspace_section_permissions p JOIN public.workspace_sections s ON s.id = p.section_id WHERE s.key = 'sfida_linkedin') AS permessi_voce;
