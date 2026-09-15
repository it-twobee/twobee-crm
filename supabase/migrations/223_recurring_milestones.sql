-- ═══════════════════════════════════════════════════════════════════════════
-- 223 — §337 · Milestone ricorrenti, e un motore solo per le ricorrenze
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Due cose, e la seconda è la ragione della prima.
--
-- **Le milestone ricorrenti non c'erano.** Il doc 16 dice «mai una workstream
-- nuova per settimana/mese» e ha ragione — la workstream è un contenitore
-- stabile — ma una **tappa** che torna esiste eccome: la chiusura del mese, la
-- review trimestrale, il piano stagionale. Finora si scrivevano a mano una per
-- una, cioè non si scrivevano. Ora sono una regola che genera milestone vere,
-- come le task (doc 08): ognuna col suo stato, il suo responsabile e la sua
-- storia. Una riga sola con la data che avanza sarebbe stata più semplice e
-- avrebbe cancellato il passato: non si saprebbe più se la chiusura di
-- settembre è stata fatta in ritardo, perché quella riga adesso parla di
-- ottobre.
--
-- **E il motore delle ricorrenze torna a essere uno.** La 152 aveva messo la
-- regola in SQL dentro `generate_recurring_task_occurrences()`, schedulata via
-- `pg_cron` dentro un `EXCEPTION WHEN undefined_function`: su questo database
-- pg_cron non c'è, la migration è passata lo stesso e non l'ha più detto. Il
-- risultato misurato prima di questa migration: **185 template attivi, zero
-- occorrenze, `last_generated_at` NULL su tutti**. Una funzione che non gira
-- non è un motore, è un commento.
--
-- La regola si sposta in `lib/recurrence.ts`, dove è pura, ha un gate e — è il
-- punto — serve anche alla pagina: per dire «la prossima è il 22» prima di
-- salvare e per mostrare sul calendario solo la tappa più vicina. Tenerla anche
-- qui avrebbe voluto dire due implementazioni della stessa regola, che danno la
-- stessa risposta finché qualcuno non corregge una delle due.

BEGIN;

-- ── le milestone sanno da quale serie vengono ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.recurring_milestone_templates (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id            UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  project_id           UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  workstream_id        UUID NOT NULL REFERENCES public.project_workstreams(id) ON DELETE CASCADE,
  title                TEXT NOT NULL,
  description          TEXT,
  frequency            TEXT NOT NULL CHECK (frequency IN ('daily','weekly','biweekly','monthly','quarterly','custom')),
  interval             INT NOT NULL DEFAULT 1,
  weekdays             INT[],
  day_of_month         INT,
  start_date           DATE NOT NULL,
  end_date             DATE,
  -- quanto avanti si materializzano le tappe. Su una milestone il senso è
  -- diverso che su una task: serve a **vederla sul calendario** prima che
  -- arrivi, non a lavorarci sopra.
  generation_lead_days INT NOT NULL DEFAULT 90,
  owner_id             UUID REFERENCES public.profiles(id),
  approval_required    BOOLEAN NOT NULL DEFAULT false,
  deliverable          TEXT,
  visibility           TEXT NOT NULL DEFAULT 'internal' CHECK (visibility IN ('internal','client_visible')),
  active               BOOLEAN NOT NULL DEFAULT true,
  last_generated_at    TIMESTAMPTZ,
  created_by           UUID REFERENCES public.profiles(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rmt_active     ON public.recurring_milestone_templates(active);
CREATE INDEX IF NOT EXISTS idx_rmt_project    ON public.recurring_milestone_templates(project_id);
CREATE INDEX IF NOT EXISTS idx_rmt_workstream ON public.recurring_milestone_templates(workstream_id);

DROP TRIGGER IF EXISTS trg_rmt_updated ON public.recurring_milestone_templates;
CREATE TRIGGER trg_rmt_updated BEFORE UPDATE ON public.recurring_milestone_templates
  FOR EACH ROW EXECUTE FUNCTION public.tbv2_set_updated_at();

ALTER TABLE public.milestones
  ADD COLUMN IF NOT EXISTS recurring_template_id UUID
    REFERENCES public.recurring_milestone_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS generated_for_date DATE,
  ADD COLUMN IF NOT EXISTS is_recurring_instance BOOLEAN NOT NULL DEFAULT false;

-- L'anti-duplicato è la sola cosa che rende sicuro rigenerare: la finestra si
-- sovrappone a ogni giro, e senza questo indice ogni passaggio riscriverebbe
-- le stesse tappe. Stessa forma dell'unico su `tasks` (147).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_milestone_occurrence
  ON public.milestones (recurring_template_id, generated_for_date)
  WHERE recurring_template_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_milestones_series
  ON public.milestones (recurring_template_id) WHERE recurring_template_id IS NOT NULL;

-- ── RLS: le stesse porte dei template di task (148) ──────────────────────────
ALTER TABLE public.recurring_milestone_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rmt_admin_all ON public.recurring_milestone_templates;
CREATE POLICY rmt_admin_all ON public.recurring_milestone_templates
  FOR ALL USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS rmt_team_read ON public.recurring_milestone_templates;
CREATE POLICY rmt_team_read ON public.recurring_milestone_templates
  FOR SELECT USING (public.get_my_role() IN ('admin','team'));

-- ── la finestra di generazione delle task ────────────────────────────────────
-- Tre giorni erano la scelta del doc 08 contro la proliferazione, e con la
-- generazione che non partiva mai il problema non si è mai presentato. Ma tre
-- giorni vogliono dire che chi riceve una ricorrente non la vede finché non è
-- praticamente da fare, e «le mie attività» non serve più a organizzarsi la
-- settimana. Trenta giorni, e resta per template: chi produce troppo si abbassa
-- da solo, e il numero è scritto dove lo si vede.
ALTER TABLE public.recurring_task_templates
  ALTER COLUMN generation_lead_days SET DEFAULT 30;
UPDATE public.recurring_task_templates
   SET generation_lead_days = 30
 WHERE generation_lead_days = 3;

-- ── il motore SQL si ritira ──────────────────────────────────────────────────
-- Non si lascia in piedi una seconda implementazione della stessa regola: il
-- giorno in cui pg_cron comparisse, ricomincerebbe a generare con la finestra
-- di tre giorni e nessuno collegherebbe le due cose.
DO $$
BEGIN
  PERFORM cron.unschedule('generate-recurring-tasks');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'nessuna schedulazione pg_cron da togliere';
END $$;

DROP FUNCTION IF EXISTS public.generate_recurring_task_occurrences();

COMMIT;

-- verifica: le due colonne e la tabella devono esserci
SELECT
  (SELECT count(*) FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'recurring_milestone_templates') AS tabella,
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'milestones'
      AND column_name IN ('recurring_template_id','generated_for_date','is_recurring_instance')) AS colonne;
