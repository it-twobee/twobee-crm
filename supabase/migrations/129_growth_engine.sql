-- FASE 4 — Motore Growth: routine ricorrenti e iniziative una tantum.
-- Additiva + idempotente.
--
-- PERCHÉ NON `tasks.recurrence`
-- La colonna `tasks.recurrence` esiste dalla 011 (settimanale|quindicinale|
-- mensile) e non è mai stata usata da nessuno: mette la regola di ricorrenza
-- SULLA SINGOLA TASK, e da lì i due esiti possibili sono entrambi cattivi.
--   • una task madre che si auto-clona → nessuna traccia di quale occorrenza
--     appartenga a quale periodo, e "modifica solo questa" vs "modifica il
--     template futuro" (§12) diventa irrisolvibile;
--   • N task pre-generate a inizio contratto → nessuna idempotenza, e cambiare
--     la frequenza significa cancellare il futuro.
-- Qui la REGOLA (growth_routines) è separata dalle sue OCCORRENZE (tasks).
--
-- IDEMPOTENZA (§20.11): l'unicità è `UNIQUE(routine_id, period_key)` nel
-- database, non un `if` nel codice. Il generatore può girare ogni notte, a mano,
-- due volte in parallelo: non produce mai duplicati.
--
-- FOCUS E-COMMERCE / LEAD GEN: nessuna colonna nuova. `projects.project_type`
-- ha già 'ecommerce' e 'lead_gen', e `client_kpis` ha già i due blocchi KPI
-- distinti. Il focus decide quali routine si seminano e quali KPI mostra la
-- Panoramica Growth — è codice, non schema.

-- ─── 1. La regola ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.growth_routines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  frequency TEXT NOT NULL
    CHECK (frequency IN ('settimanale','quindicinale','mensile','trimestrale')),
  default_owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  default_estimated_hours NUMERIC(6,2) NOT NULL DEFAULT 1,
  starts_on DATE NOT NULL DEFAULT CURRENT_DATE,
  ends_on DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  /** Da quale voce del seed aziendale nasce: serve a capire cosa è stato divergiuto. */
  template_key TEXT,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gr_project ON public.growth_routines(project_id);
CREATE INDEX IF NOT EXISTS idx_gr_active ON public.growth_routines(is_active, frequency);

-- ─── 2. Le iniziative una tantum ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.growth_initiatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  start_date DATE,
  end_date DATE,
  budget NUMERIC(12,2),
  owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pianificata'
    CHECK (status IN ('pianificata','in_corso','completata','annullata')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gi_project ON public.growth_initiatives(project_id);

-- ─── 3. Le occorrenze sono task normali ─────────────────────────────────────
-- Il dominio task resta unico (§20.16): cambiano tre colonne, non la tabella.

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS routine_id UUID REFERENCES public.growth_routines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS initiative_id UUID REFERENCES public.growth_initiatives(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS period_key TEXT;

-- QUESTA riga è l'idempotenza del §20.11. NON parziale: un indice con WHERE
-- impedirebbe ON CONFLICT (vedi 130).
CREATE UNIQUE INDEX IF NOT EXISTS uq_tasks_routine_period
  ON public.tasks(routine_id, period_key);

CREATE INDEX IF NOT EXISTS idx_tasks_initiative ON public.tasks(initiative_id)
  WHERE initiative_id IS NOT NULL;

-- ─── 4. Stato 'non_svolta' (decisione Q21, variante C+) ─────────────────────
-- Settimanali e quindicinali si auto-chiudono quando nasce il periodo dopo:
-- una settimana saltata è persa, non recuperabile, e lasciarla scaduta a vita
-- riempie le liste di rumore. Mensili e trimestrali restano scadute: un report
-- lo consegni comunque, anche in ritardo.

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('da_fare','in_corso','in_revisione','completato','richiesta_supporto','non_svolta'));

-- ─── 5. RLS ─────────────────────────────────────────────────────────────────
-- Lettura a tutto lo staff (è operatività, non economia). Scrittura ad admin;
-- il PM passa dalle server action con service role, come per workload-tasks.

ALTER TABLE public.growth_routines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gr_staff_read" ON public.growth_routines;
CREATE POLICY "gr_staff_read" ON public.growth_routines
  FOR SELECT USING (public.is_staff());
DROP POLICY IF EXISTS "gr_admin_write" ON public.growth_routines;
CREATE POLICY "gr_admin_write" ON public.growth_routines
  FOR ALL USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

ALTER TABLE public.growth_initiatives ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gi_staff_read" ON public.growth_initiatives;
CREATE POLICY "gi_staff_read" ON public.growth_initiatives
  FOR SELECT USING (public.is_staff());
DROP POLICY IF EXISTS "gi_admin_write" ON public.growth_initiatives;
CREATE POLICY "gi_admin_write" ON public.growth_initiatives
  FOR ALL USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

CREATE OR REPLACE FUNCTION public.set_growth_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS gr_updated_at ON public.growth_routines;
CREATE TRIGGER gr_updated_at BEFORE UPDATE ON public.growth_routines
  FOR EACH ROW EXECUTE FUNCTION public.set_growth_updated_at();

DROP TRIGGER IF EXISTS gi_updated_at ON public.growth_initiatives;
CREATE TRIGGER gi_updated_at BEFORE UPDATE ON public.growth_initiatives
  FOR EACH ROW EXECUTE FUNCTION public.set_growth_updated_at();

-- Verifica
SELECT 'growth_routines' AS t, COUNT(*) FROM public.growth_routines
UNION ALL SELECT 'growth_initiatives', COUNT(*) FROM public.growth_initiatives;

-- Rollback:
--   DROP INDEX uq_tasks_routine_period;
--   ALTER TABLE public.tasks DROP COLUMN routine_id, DROP COLUMN initiative_id, DROP COLUMN period_key;
--   DROP TABLE public.growth_routines, public.growth_initiatives;
--   ...ripristinare tasks_status_check senza 'non_svolta'.
