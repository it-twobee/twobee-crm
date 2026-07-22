-- 140 — Ricorrenze generalizzate.
-- Additiva + idempotente. Dipende dalla 138/139.
--
-- growth_routines (129) fa già tutto quello che il §9 chiede — template separato
-- dall'occorrenza, generazione idempotente garantita dal DB — ma è legata al
-- Growth. Una Social Media Management ha routine settimanali quanto una Lead Gen.
--
-- COSA NON RINOMINO E PERCHÉ
-- tasks.routine_id e tasks.period_key restano com'erano. Sono le due colonne su
-- cui poggia uq_tasks_routine_period, l'indice che impedisce le occorrenze
-- doppie, ed è l'unica parte del motore già in produzione (27 task generate).
-- Rinominarle per coerenza estetica significa toccare il generatore funzionante
-- senza guadagnare nulla. I nomi sono già neutri: una "routine" resta una routine.

-- ─── 1. Rename tabella ──────────────────────────────────────────────────────
DO $$ BEGIN
  IF to_regclass('public.growth_routines') IS NOT NULL
     AND to_regclass('public.recurring_task_templates') IS NULL THEN
    ALTER TABLE public.growth_routines RENAME TO recurring_task_templates;
  END IF;
END $$;

-- ─── 2. Aggancio alla nuova gerarchia ───────────────────────────────────────
ALTER TABLE public.recurring_task_templates
  ADD COLUMN IF NOT EXISTS workstream_id UUID
  REFERENCES public.project_workstreams(id) ON DELETE SET NULL;

ALTER TABLE public.recurring_task_templates
  ADD COLUMN IF NOT EXISTS milestone_id UUID
  REFERENCES public.workstream_milestones(id) ON DELETE SET NULL;

ALTER TABLE public.recurring_task_templates
  ADD COLUMN IF NOT EXISTS client_id UUID
  REFERENCES public.clients(id) ON DELETE CASCADE;

-- ─── 3. Granularità della ricorrenza (§9) ───────────────────────────────────
ALTER TABLE public.recurring_task_templates ADD COLUMN IF NOT EXISTS recurrence_interval INT NOT NULL DEFAULT 1;
ALTER TABLE public.recurring_task_templates ADD COLUMN IF NOT EXISTS weekdays SMALLINT[];
ALTER TABLE public.recurring_task_templates ADD COLUMN IF NOT EXISTS day_of_month SMALLINT;
ALTER TABLE public.recurring_task_templates ADD COLUMN IF NOT EXISTS generation_lead_days INT NOT NULL DEFAULT 14;
ALTER TABLE public.recurring_task_templates ADD COLUMN IF NOT EXISTS last_generated_at TIMESTAMPTZ;
ALTER TABLE public.recurring_task_templates ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'media';

-- 'giornaliera' non c'era: il minimo era settimanale.
ALTER TABLE public.recurring_task_templates DROP CONSTRAINT IF EXISTS growth_routines_frequency_check;
ALTER TABLE public.recurring_task_templates DROP CONSTRAINT IF EXISTS rtt_frequency_chk;
ALTER TABLE public.recurring_task_templates ADD CONSTRAINT rtt_frequency_chk
  CHECK (frequency IN ('giornaliera','settimanale','quindicinale','mensile','trimestrale'));

ALTER TABLE public.recurring_task_templates DROP CONSTRAINT IF EXISTS rtt_priority_chk;
ALTER TABLE public.recurring_task_templates ADD CONSTRAINT rtt_priority_chk
  CHECK (priority IN ('alta','media','bassa'));

-- ─── 4. Backfill client_id dai progetti ─────────────────────────────────────
UPDATE public.recurring_task_templates r
SET client_id = p.client_id
FROM public.projects p
WHERE p.id = r.project_id AND r.client_id IS NULL;

-- ─── 5. Indici ──────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS idx_gr_project;
DROP INDEX IF EXISTS idx_gr_active;
CREATE INDEX IF NOT EXISTS idx_rtt_project ON public.recurring_task_templates(project_id);
CREATE INDEX IF NOT EXISTS idx_rtt_active  ON public.recurring_task_templates(is_active, frequency);
CREATE INDEX IF NOT EXISTS idx_rtt_workstream
  ON public.recurring_task_templates(workstream_id) WHERE workstream_id IS NOT NULL;

-- uq_tasks_routine_period NON si tocca: è la garanzia di idempotenza.

DROP TRIGGER IF EXISTS gr_updated_at ON public.recurring_task_templates;
DROP TRIGGER IF EXISTS rtt_updated_at ON public.recurring_task_templates;
CREATE TRIGGER rtt_updated_at BEFORE UPDATE ON public.recurring_task_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_growth_updated_at();

-- ─── 6. RLS: admin + PM (era admin-only) ────────────────────────────────────
ALTER TABLE public.recurring_task_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gr_staff_read"  ON public.recurring_task_templates;
DROP POLICY IF EXISTS "gr_admin_write" ON public.recurring_task_templates;

DROP POLICY IF EXISTS "rtt_staff_read" ON public.recurring_task_templates;
CREATE POLICY "rtt_staff_read" ON public.recurring_task_templates
  FOR SELECT USING (public.is_staff());

DROP POLICY IF EXISTS "rtt_admin_pm_write" ON public.recurring_task_templates;
CREATE POLICY "rtt_admin_pm_write" ON public.recurring_task_templates
  FOR ALL USING (
    public.get_my_role() = 'admin'
    OR project_id IN (SELECT p.id FROM public.projects p WHERE p.manager_id = auth.uid())
  ) WITH CHECK (
    public.get_my_role() = 'admin'
    OR project_id IN (SELECT p.id FROM public.projects p WHERE p.manager_id = auth.uid())
  );

-- ─── Verifica: 11 template, 27 occorrenze, nessun duplicato ─────────────────
SELECT
  (SELECT count(*) FROM public.recurring_task_templates) AS template,
  (SELECT count(*) FROM public.tasks WHERE routine_id IS NOT NULL) AS occorrenze,
  (SELECT count(*) FROM (
     SELECT routine_id, period_key FROM public.tasks
     WHERE routine_id IS NOT NULL
     GROUP BY 1,2 HAVING count(*) > 1) d) AS duplicati;
