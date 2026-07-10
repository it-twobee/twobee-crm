-- Decision Center — estende la tabella `decisions` creata dalla 044.
--
-- ATTENZIONE: la 044 aveva già creato public.decisions con
--   status (aperta|in_revisione|decisa|archiviata), priority, outcome, decided_by
-- Una CREATE TABLE IF NOT EXISTS qui non farebbe nulla e lascerebbe la UI a
-- scrivere su colonne inesistenti. Aggiungiamo solo ciò che manca davvero e
-- riusiamo priority/outcome invece di duplicarli con impact/decision.

ALTER TABLE public.decisions
  ADD COLUMN IF NOT EXISTS options   JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS rationale TEXT,
  ADD COLUMN IF NOT EXISTS area      TEXT,
  ADD COLUMN IF NOT EXISTS due_date  DATE;

CREATE INDEX IF NOT EXISTS idx_decisions_status ON public.decisions(status);
CREATE INDEX IF NOT EXISTS idx_decisions_due_date ON public.decisions(due_date);

-- RLS: già abilitata dalla 044 con policy decisions_rls (admin|team).
-- Il Decision Center è founder/super_admin only, ma il gate sta nella pagina
-- server-side: non stringiamo la policy per non rompere altri consumer.
ALTER TABLE public.decisions ENABLE ROW LEVEL SECURITY;
