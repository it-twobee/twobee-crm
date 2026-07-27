-- 157 — Richieste HR: approvazione admin e instradamento automatico
--
-- Una richiesta approvata non resta una riga in `hr_requests`: diventa la cosa
-- che rappresenta. Ferie/permesso/malattia → evento in `calendar_events` (e da lì
-- su Google). Nota spese → riga in `payslips` con kind='nota_spese'. Documento HR
-- → riga in `personal_documents`. Qui aggiungiamo i collegamenti che rendono
-- l'instradamento tracciabile e reversibile (rifiuto/annullo ⇒ si cancella il figlio).
--
-- Nota su `payslips`: aveva UNIQUE(profile_id, year, month), quindi ci stava una
-- sola riga per mese e le note spese non ci sarebbero entrate. L'unicità ora vale
-- solo per le buste vere (kind='busta'): di note spese e rimborsi ce ne sono N.

BEGIN;

-- ── 1) payslips: categoria, importo, origine ───────────────────────────────
ALTER TABLE public.payslips ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'busta';
ALTER TABLE public.payslips ADD COLUMN IF NOT EXISTS amount NUMERIC;
ALTER TABLE public.payslips ADD COLUMN IF NOT EXISTS label TEXT;
ALTER TABLE public.payslips ADD COLUMN IF NOT EXISTS hr_request_id UUID
  REFERENCES public.hr_requests(id) ON DELETE SET NULL;

ALTER TABLE public.payslips DROP CONSTRAINT IF EXISTS payslips_kind_chk;
ALTER TABLE public.payslips ADD CONSTRAINT payslips_kind_chk CHECK (kind IN (
  'busta', 'tredicesima', 'quattordicesima', 'conguaglio', 'bonus',
  'nota_spese', 'rimborso', 'cud', 'altro'
));

-- una sola busta per mese; note spese e rimborsi possono essere molti
DROP INDEX IF EXISTS idx_payslips_profile_period;
CREATE UNIQUE INDEX IF NOT EXISTS idx_payslips_busta_period
  ON public.payslips(profile_id, year, month) WHERE kind = 'busta';
CREATE INDEX IF NOT EXISTS idx_payslips_kind ON public.payslips(profile_id, kind);

-- ── 2) personal_documents: origine ─────────────────────────────────────────
ALTER TABLE public.personal_documents ADD COLUMN IF NOT EXISTS hr_request_id UUID
  REFERENCES public.hr_requests(id) ON DELETE SET NULL;

-- ── 3) calendar_events: assenze riconoscibili e non sovrascrivibili ────────
-- `kind` distingue un'assenza da una riunione: il mirror Google non deve
-- perderne il senso quando l'evento torna indietro dal calendario.
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'evento';
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS hr_request_id UUID
  REFERENCES public.hr_requests(id) ON DELETE CASCADE;

ALTER TABLE public.calendar_events DROP CONSTRAINT IF EXISTS calendar_events_kind_chk;
ALTER TABLE public.calendar_events ADD CONSTRAINT calendar_events_kind_chk CHECK (kind IN (
  'evento', 'ferie', 'permesso', 'malattia'
));
CREATE INDEX IF NOT EXISTS idx_calendar_events_kind ON public.calendar_events(kind)
  WHERE kind <> 'evento';

-- ── 4) hr_requests: cosa ha prodotto l'approvazione ────────────────────────
ALTER TABLE public.hr_requests ADD COLUMN IF NOT EXISTS calendar_event_id UUID
  REFERENCES public.calendar_events(id) ON DELETE SET NULL;
ALTER TABLE public.hr_requests ADD COLUMN IF NOT EXISTS payslip_id UUID
  REFERENCES public.payslips(id) ON DELETE SET NULL;
ALTER TABLE public.hr_requests ADD COLUMN IF NOT EXISTS personal_document_id UUID
  REFERENCES public.personal_documents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_hr_requests_status ON public.hr_requests(status, created_at DESC);

COMMIT;

-- verifica
SELECT 'payslips.kind' AS check, count(*) FILTER (WHERE kind = 'busta') AS buste FROM public.payslips
UNION ALL
SELECT 'hr_requests pending', count(*) FROM public.hr_requests WHERE status = 'pending';
