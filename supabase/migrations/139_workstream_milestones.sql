-- 139 — Milestone V2 come entità.
-- Additiva + idempotente. Dipende dalla 138.
--
-- PERCHÉ UNA TABELLA E NON IL FLAG tasks.is_milestone
-- Il flag esiste (011) ma ha 0 righe: non c'è retrocompatibilità da difendere.
-- Una milestone ha campi che una task non deve avere (data prevista vs effettiva,
-- approvazione, criterio di completamento): tenerli su tasks significa 6 colonne
-- nulle su ogni task operativa e un WHERE is_milestone=false dimenticato da
-- qualche parte che fa comparire le milestone nelle liste task.
--
-- tasks.milestone_id ESISTE GIÀ e punta a un'altra task, ma ha 0 righe
-- valorizzate: la ripunto qui invece di aggiungere una colonna gemella.

CREATE TABLE IF NOT EXISTS public.workstream_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workstream_id UUID NOT NULL REFERENCES public.project_workstreams(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  milestone_type TEXT NOT NULL DEFAULT 'delivery',
  status TEXT NOT NULL DEFAULT 'da_avviare',
  owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  expected_date DATE,
  actual_date DATE,
  deliverables JSONB NOT NULL DEFAULT '[]',
  completion_criteria TEXT,
  approval_required BOOLEAN NOT NULL DEFAULT false,
  approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  visibility TEXT NOT NULL DEFAULT 'internal',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- project_id è denormalizzato: serve alle RLS per non risalire ogni volta
-- al workstream. Il trigger sotto garantisce che resti coerente.

ALTER TABLE public.workstream_milestones DROP CONSTRAINT IF EXISTS wm_type_chk;
ALTER TABLE public.workstream_milestones ADD CONSTRAINT wm_type_chk
  CHECK (milestone_type IN ('delivery','approval','checkpoint','release','control','recurring_cycle'));

ALTER TABLE public.workstream_milestones DROP CONSTRAINT IF EXISTS wm_status_chk;
ALTER TABLE public.workstream_milestones ADD CONSTRAINT wm_status_chk
  CHECK (status IN ('da_avviare','in_corso','completata','bloccata','saltata'));

ALTER TABLE public.workstream_milestones DROP CONSTRAINT IF EXISTS wm_visibility_chk;
ALTER TABLE public.workstream_milestones ADD CONSTRAINT wm_visibility_chk
  CHECK (visibility IN ('internal','client','partner'));

CREATE INDEX IF NOT EXISTS idx_wm_workstream
  ON public.workstream_milestones(workstream_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_wm_project
  ON public.workstream_milestones(project_id);

-- ─── project_id coerente col workstream ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.wm_sync_project()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  SELECT w.project_id INTO NEW.project_id
  FROM public.project_workstreams w WHERE w.id = NEW.workstream_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS wm_sync_project ON public.workstream_milestones;
CREATE TRIGGER wm_sync_project BEFORE INSERT OR UPDATE OF workstream_id
  ON public.workstream_milestones
  FOR EACH ROW EXECUTE FUNCTION public.wm_sync_project();

DROP TRIGGER IF EXISTS wm_updated_at ON public.workstream_milestones;
CREATE TRIGGER wm_updated_at BEFORE UPDATE ON public.workstream_milestones
  FOR EACH ROW EXECUTE FUNCTION public.set_growth_updated_at();

-- ─── tasks.milestone_id → workstream_milestones ─────────────────────────────
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS milestone_id UUID;

DO $$
DECLARE fk TEXT;
BEGIN
  SELECT conname INTO fk FROM pg_constraint
  WHERE conrelid = 'public.tasks'::regclass AND contype = 'f'
    AND conkey = ARRAY[(SELECT attnum FROM pg_attribute
        WHERE attrelid='public.tasks'::regclass AND attname='milestone_id')];
  IF fk IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.tasks DROP CONSTRAINT %I', fk);
  END IF;
END $$;

ALTER TABLE public.tasks ADD CONSTRAINT tasks_milestone_id_fkey
  FOREIGN KEY (milestone_id) REFERENCES public.workstream_milestones(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_milestone
  ON public.tasks(milestone_id) WHERE milestone_id IS NOT NULL;

-- La milestone NON è obbligatoria sulla task (decisione D-2): le occorrenze
-- ricorrenti non ne hanno una sensata. Obbligatorio è solo il workstream.
COMMENT ON COLUMN public.tasks.is_milestone IS 'DEPRECATA — vedi workstream_milestones (139)';

-- ─── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.workstream_milestones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wm_staff_read" ON public.workstream_milestones;
CREATE POLICY "wm_staff_read" ON public.workstream_milestones
  FOR SELECT USING (public.is_staff());

DROP POLICY IF EXISTS "wm_admin_pm_write" ON public.workstream_milestones;
CREATE POLICY "wm_admin_pm_write" ON public.workstream_milestones
  FOR ALL USING (
    public.get_my_role() = 'admin'
    OR project_id IN (SELECT p.id FROM public.projects p WHERE p.manager_id = auth.uid())
  ) WITH CHECK (
    public.get_my_role() = 'admin'
    OR project_id IN (SELECT p.id FROM public.projects p WHERE p.manager_id = auth.uid())
  );

-- ─── Verifica ───────────────────────────────────────────────────────────────
SELECT count(*) AS milestone FROM public.workstream_milestones;
