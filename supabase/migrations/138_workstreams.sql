-- 138 — Workstream (UI: "Area di lavoro").
-- Additiva + idempotente. Rinomina project_phases (5 righe, 0 task collegate).
--
-- PERCHÉ UN RENAME E NON UNA TABELLA NUOVA
-- project_phases (134) ha già project_id, name, position, date, owner_id, status,
-- requires_client_approval e deliverables: è il 70% del modello Workstream, con la
-- stessa semantica dichiarata nella 134 ("lo sprint è temporale, la fase è logica").
-- Due tabelle con lo stesso significato e nomi diversi sarebbero il danno peggiore.
--
-- SCRITTURA: admin + PM del progetto (decisione D-3). La 134 era admin-only.

-- ─── 1. Rename tabella ──────────────────────────────────────────────────────
DO $$ BEGIN
  IF to_regclass('public.project_phases') IS NOT NULL
     AND to_regclass('public.project_workstreams') IS NULL THEN
    ALTER TABLE public.project_phases RENAME TO project_workstreams;
  END IF;
END $$;

-- ─── 2. Colonne mancanti (§5 del brief) ─────────────────────────────────────
ALTER TABLE public.project_workstreams ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.project_workstreams ADD COLUMN IF NOT EXISTS workstream_type TEXT;
ALTER TABLE public.project_workstreams ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'media';
ALTER TABLE public.project_workstreams ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'internal';
ALTER TABLE public.project_workstreams ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.project_workstreams DROP CONSTRAINT IF EXISTS pws_priority_chk;
ALTER TABLE public.project_workstreams ADD CONSTRAINT pws_priority_chk
  CHECK (priority IN ('alta','media','bassa'));

ALTER TABLE public.project_workstreams DROP CONSTRAINT IF EXISTS pws_visibility_chk;
ALTER TABLE public.project_workstreams ADD CONSTRAINT pws_visibility_chk
  CHECK (visibility IN ('internal','client','partner'));

-- ─── 3. Rinomina vincoli e indici ereditati ─────────────────────────────────
ALTER TABLE public.project_workstreams DROP CONSTRAINT IF EXISTS pph_status_chk;
ALTER TABLE public.project_workstreams DROP CONSTRAINT IF EXISTS pws_status_chk;
ALTER TABLE public.project_workstreams ADD CONSTRAINT pws_status_chk
  CHECK (status IN ('da_avviare','in_corso','completata','bloccata','saltata'));

DROP INDEX IF EXISTS idx_pph_project;
CREATE INDEX IF NOT EXISTS idx_pws_project
  ON public.project_workstreams(project_id, position);

-- ─── 4. tasks.phase_id → tasks.workstream_id (0 righe valorizzate) ──────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='tasks' AND column_name='phase_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='tasks' AND column_name='workstream_id') THEN
    ALTER TABLE public.tasks RENAME COLUMN phase_id TO workstream_id;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tasks_workstream
  ON public.tasks(workstream_id) WHERE workstream_id IS NOT NULL;

-- sprints.phase_id (134) non serve più: il Workstream sostituisce lo sprint.
COMMENT ON COLUMN public.sprints.phase_id IS 'DEPRECATA — vedi project_workstreams (138)';

-- ─── 5. updated_at ──────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS pws_updated_at ON public.project_workstreams;
CREATE TRIGGER pws_updated_at BEFORE UPDATE ON public.project_workstreams
  FOR EACH ROW EXECUTE FUNCTION public.set_growth_updated_at();

-- ─── 6. RLS: admin + PM in scrittura ────────────────────────────────────────
ALTER TABLE public.project_workstreams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pph_staff_read"  ON public.project_workstreams;
DROP POLICY IF EXISTS "pph_admin_write" ON public.project_workstreams;

DROP POLICY IF EXISTS "pws_staff_read" ON public.project_workstreams;
CREATE POLICY "pws_staff_read" ON public.project_workstreams
  FOR SELECT USING (public.is_staff());

DROP POLICY IF EXISTS "pws_admin_pm_write" ON public.project_workstreams;
CREATE POLICY "pws_admin_pm_write" ON public.project_workstreams
  FOR ALL USING (
    public.get_my_role() = 'admin'
    OR project_id IN (SELECT p.id FROM public.projects p WHERE p.manager_id = auth.uid())
  ) WITH CHECK (
    public.get_my_role() = 'admin'
    OR project_id IN (SELECT p.id FROM public.projects p WHERE p.manager_id = auth.uid())
  );

-- ─── Verifica ───────────────────────────────────────────────────────────────
SELECT count(*) AS workstream FROM public.project_workstreams;
