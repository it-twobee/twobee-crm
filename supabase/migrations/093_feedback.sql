-- ─── Feedback & idee: portale admin (raccolta) + operativo (proposta) ────────
-- Un feedback è sempre legato a una sezione: o una esistente (target_section_key,
-- che punta a workspace_sections.key o a una chiave di sezione admin), oppure la
-- proposta di una sezione nuova (proposed_section_name, con target_section_key NULL).

CREATE TABLE IF NOT EXISTS public.feedback (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id             UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source_portal         TEXT NOT NULL DEFAULT 'workspace' CHECK (source_portal IN ('admin','workspace')),
  kind                  TEXT NOT NULL DEFAULT 'improvement'
                          CHECK (kind IN ('improvement','new_section','idea','bug')),
  target_section_key    TEXT,          -- sezione esistente collegata; NULL se proposta nuova
  proposed_section_name TEXT,          -- nome della nuova sezione proposta
  title                 TEXT NOT NULL,
  description           TEXT NOT NULL,
  impact                TEXT NOT NULL DEFAULT 'media' CHECK (impact IN ('bassa','media','alta')),
  status                TEXT NOT NULL DEFAULT 'nuovo'
                          CHECK (status IN ('nuovo','in_valutazione','pianificato','in_corso','realizzato','archiviato')),
  admin_note            TEXT,
  vote_count            INT NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feedback_section_idx ON public.feedback (target_section_key);
CREATE INDEX IF NOT EXISTS feedback_status_idx  ON public.feedback (status);

-- Voti: una idea/feedback può essere votato dagli altri per prioritizzare.
CREATE TABLE IF NOT EXISTS public.feedback_votes (
  feedback_id UUID NOT NULL REFERENCES public.feedback(id) ON DELETE CASCADE,
  profile_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (feedback_id, profile_id)
);

-- vote_count denormalizzato: mantenuto dal trigger.
CREATE OR REPLACE FUNCTION public.sync_feedback_votes() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.feedback SET vote_count = vote_count + 1 WHERE id = NEW.feedback_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.feedback SET vote_count = GREATEST(0, vote_count - 1) WHERE id = OLD.feedback_id;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_feedback_votes ON public.feedback_votes;
CREATE TRIGGER trg_feedback_votes
  AFTER INSERT OR DELETE ON public.feedback_votes
  FOR EACH ROW EXECUTE FUNCTION public.sync_feedback_votes();

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_votes ENABLE ROW LEVEL SECURITY;

-- Lo staff interno (admin + team) legge tutto: è una raccolta condivisa.
CREATE POLICY "feedback_read_staff" ON public.feedback
  FOR SELECT USING (public.get_my_role() IN ('admin','team'));

-- Ognuno crea il proprio; il cliente non entra in questa tabella.
CREATE POLICY "feedback_insert_own" ON public.feedback
  FOR INSERT WITH CHECK (author_id = auth.uid() AND public.get_my_role() IN ('admin','team'));

-- L'autore modifica il proprio; l'admin gestisce stato/note di tutti.
CREATE POLICY "feedback_update_own" ON public.feedback
  FOR UPDATE USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());
CREATE POLICY "feedback_admin_all" ON public.feedback
  FOR ALL USING (public.get_my_role() = 'admin');

CREATE POLICY "feedback_votes_read" ON public.feedback_votes
  FOR SELECT USING (public.get_my_role() IN ('admin','team'));
CREATE POLICY "feedback_votes_own" ON public.feedback_votes
  FOR ALL USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());

-- ─── Sezione workspace "Feedback" ────────────────────────────────────────────
-- (dipende dalle colonne group_key/group_order della 087: eseguire dopo la 087)
INSERT INTO public.workspace_sections
  (key, label, description, route, icon, sort_order, group_key, group_order, is_active)
VALUES
  ('feedback', 'Feedback', 'Proponi miglioramenti e nuove sezioni', '/workspace/feedback', 'Lightbulb', 2, 'team', 3, true)
ON CONFLICT (key) DO UPDATE
  SET label = EXCLUDED.label, description = EXCLUDED.description, route = EXCLUDED.route,
      icon = EXCLUDED.icon, group_key = EXCLUDED.group_key, group_order = EXCLUDED.group_order,
      is_active = true;

INSERT INTO public.workspace_section_permissions (section_id, app_role, can_view, can_create, can_edit, can_delete)
SELECT s.id, r.app_role, true, true, true, false
FROM public.workspace_sections s
CROSS JOIN (VALUES ('manager'),('senior'),('junior'),('stage'),('freelance'),('partner')) AS r(app_role)
WHERE s.key = 'feedback'
  AND NOT EXISTS (
    SELECT 1 FROM public.workspace_section_permissions p
    WHERE p.section_id = s.id AND p.app_role = r.app_role
  );
