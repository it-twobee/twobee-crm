-- Fase 1d — Richieste dirette (Admin→Risorsa) e Richiesta supporto (§6.2/6.3, D12).
-- Modellate come task (NO tabella dedicata) + notifiche. Additiva + idempotente.

-- Nuovo stato non-terminale: 'richiesta_supporto' = in attesa di accettazione.
-- L'accettazione porta a 'da_fare'; il rifiuto elimina la task-richiesta (mai
-- diventata lavoro reale) e notifica il richiedente.
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('da_fare', 'in_corso', 'in_revisione', 'completato', 'richiesta_supporto'));

-- Collegamento alla task originale (da cui è partita la richiesta) e al richiedente.
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS origin_task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS requested_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_origin      ON public.tasks(origin_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_requested_by ON public.tasks(requested_by);
CREATE INDEX IF NOT EXISTS idx_tasks_status_request ON public.tasks(status) WHERE status = 'richiesta_supporto';
