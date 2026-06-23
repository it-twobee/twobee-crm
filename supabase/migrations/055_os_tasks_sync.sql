-- ── 054: aggiungi colonne dipendenze ────────────────────────────────────────
ALTER TABLE public.os_tasks
  ADD COLUMN IF NOT EXISTS depends_on UUID[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS implementation_order INTEGER;

CREATE INDEX IF NOT EXISTS idx_os_tasks_status ON public.os_tasks(status);
CREATE INDEX IF NOT EXISTS idx_os_tasks_order  ON public.os_tasks(implementation_order, priority);

-- ── Marca come completati i task già eseguiti ────────────────────────────────
UPDATE public.os_tasks SET status = 'completato', completed_at = NOW()
WHERE title IN (
  'Applicare migration chat_channels.project_id su Supabase',
  'Applicare migration 044_decisions.sql su Supabase',
  'Applicare migration 046_os_tasks.sql su Supabase',
  'Widget Strategic Objectives',
  'AI & Automation Center widget',
  'DashboardGrid → pulsante reset layout localStorage nel CustomizePanel',
  'Dashboard page.tsx → gestire errori delle 17 query senza crash',
  'ensureProjectChannels → aggiungere check exists prima di INSERT',
  'ensureProjectChannels() → filtrare per project_id dopo migration',
  'Sidebar.tsx → import Compass e isSuperAdmin duplicato',
  'TwoBeeOSClient.tsx → rimuovere codice tab obsolete',
  'ProjectChatSection → sostituire fallback con query per project_id'
);

-- ── Imposta ordine di implementazione e dipendenze sui task aperti ───────────

-- Dipendente da: migration project_id (già completata)
UPDATE public.os_tasks SET implementation_order = 5
WHERE title = 'Verificare isolamento canali per progetto dopo migration';

-- Dipendente da: timesheet (task di costruzione base)
UPDATE public.os_tasks SET implementation_order = 20
WHERE title = 'MarginRadar → sostituire MARGIN_BY_PACKAGE hardcoded con dati reali';

-- Timesheet è prerequisito di MarginRadar e Financial Control reale
UPDATE public.os_tasks SET implementation_order = 15
WHERE title = 'Timesheet — tabella costi orari e UI registrazione ore';

-- Refactor ProjectPageClient: ottimizzazione, non bloccante
UPDATE public.os_tasks SET implementation_order = 40
WHERE title = 'ProjectPageClient.tsx → split 2980 righe in subcomponent per tab';

-- Features di arricchimento: bassa urgenza
UPDATE public.os_tasks SET implementation_order = 50
WHERE title = 'Tab Relazione → completare con timeline engagement e note storiche';

UPDATE public.os_tasks SET implementation_order = 55
WHERE title = 'Tab Fatturazione → collegare a Financial Control aggregato';

UPDATE public.os_tasks SET implementation_order = 30
WHERE title = 'Growth Performance aggregato cross-client';

UPDATE public.os_tasks SET implementation_order = 35
WHERE title = 'SmartInsights → promuovere AIExecutiveBrief come principale';

-- Default per tutti quelli senza ordine esplicito
UPDATE public.os_tasks SET implementation_order = 60
WHERE implementation_order IS NULL AND status = 'aperto';
