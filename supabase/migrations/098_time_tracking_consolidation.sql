-- TIME-01: fonte unica di time-tracking = time_entries.
-- Consolida i tre sistemi (time_entries / task_time_logs / tasks.logged_hours):
--   • time_entries  = SORGENTE CANONICA (una riga per registrazione).
--   • tasks.logged_hours = cache derivata, ora alimentata da time_entries.
--   • task_time_logs = deprecata (0 righe in prod): trigger vecchio rimosso.
-- Additiva e idempotente. Supera la 050 (mai eseguita): esegui SOLO questa.

-- ── 1) Tabella canonica ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.time_entries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id  UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  client_id   UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  task_id     UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  hours       NUMERIC(5,2) NOT NULL CHECK (hours > 0 AND hours <= 24),
  category    TEXT NOT NULL DEFAULT 'sviluppo',
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_time_entries_profile ON public.time_entries(profile_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_date    ON public.time_entries(date);
CREATE INDEX IF NOT EXISTS idx_time_entries_project ON public.time_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_task    ON public.time_entries(task_id);

-- ── 2) RLS: staff legge tutto (timesheet HR), ognuno scrive le proprie righe ──
-- Sostituisce la policy permissiva USING(true) della 050 (se mai applicata).
DROP POLICY IF EXISTS "auth can manage time_entries" ON public.time_entries;
DROP POLICY IF EXISTS time_entries_select ON public.time_entries;
DROP POLICY IF EXISTS time_entries_insert ON public.time_entries;
DROP POLICY IF EXISTS time_entries_update ON public.time_entries;
DROP POLICY IF EXISTS time_entries_delete ON public.time_entries;

CREATE POLICY time_entries_select ON public.time_entries
  FOR SELECT USING (public.is_staff() OR profile_id = auth.uid());
CREATE POLICY time_entries_insert ON public.time_entries
  FOR INSERT WITH CHECK (profile_id = auth.uid() OR public.get_my_role() = 'admin');
CREATE POLICY time_entries_update ON public.time_entries
  FOR UPDATE USING (profile_id = auth.uid() OR public.get_my_role() = 'admin')
             WITH CHECK (profile_id = auth.uid() OR public.get_my_role() = 'admin');
CREATE POLICY time_entries_delete ON public.time_entries
  FOR DELETE USING (profile_id = auth.uid() OR public.get_my_role() = 'admin');

-- ── 3) Backfill project_id/client_id dalla task (il writer passa solo task_id) ─
CREATE OR REPLACE FUNCTION public.time_entries_fill_context()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.task_id IS NOT NULL AND NEW.project_id IS NULL THEN
    SELECT project_id INTO NEW.project_id FROM public.tasks WHERE id = NEW.task_id;
  END IF;
  IF NEW.project_id IS NOT NULL AND NEW.client_id IS NULL THEN
    SELECT client_id INTO NEW.client_id FROM public.projects WHERE id = NEW.project_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_time_entries_fill_context ON public.time_entries;
CREATE TRIGGER trg_time_entries_fill_context
  BEFORE INSERT OR UPDATE ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.time_entries_fill_context();

-- ── 4) Cache tasks.logged_hours = SUM(time_entries.hours) per task ────────────
CREATE OR REPLACE FUNCTION public.time_entries_sync_logged_hours()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (TG_OP = 'DELETE' OR TG_OP = 'UPDATE') AND OLD.task_id IS NOT NULL THEN
    UPDATE public.tasks
      SET logged_hours = COALESCE((SELECT SUM(hours) FROM public.time_entries WHERE task_id = OLD.task_id), 0)
      WHERE id = OLD.task_id;
  END IF;
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW.task_id IS NOT NULL THEN
    UPDATE public.tasks
      SET logged_hours = COALESCE((SELECT SUM(hours) FROM public.time_entries WHERE task_id = NEW.task_id), 0)
      WHERE id = NEW.task_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_time_entries_sync_logged_hours ON public.time_entries;
CREATE TRIGGER trg_time_entries_sync_logged_hours
  AFTER INSERT OR UPDATE OR DELETE ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.time_entries_sync_logged_hours();

-- ── 5) Deprecazione task_time_logs: via il vecchio trigger su logged_hours ────
-- (la tabella resta per storico ma non alimenta più la cache; 0 righe in prod)
DROP TRIGGER IF EXISTS trg_update_logged_hours ON public.task_time_logs;
