-- Workspace: la voce "Progetti" sostituisce "Portfolio".
-- Additiva/idempotente (solo righe di workspace_sections).
--
-- Storia: la 103 aveva disattivato 'progetti' facendo confluire i progetti nel
-- Workload. Ora torna come sezione propria e prende il posto di 'portfolio'
-- (rotta /workspace/portfolio, sort_order 5), che esce di scena.
-- Il Workload resta: è la vista del CARICO, non l'elenco dei progetti.

UPDATE public.workspace_sections
SET is_active = false
WHERE key = 'portfolio';

UPDATE public.workspace_sections
SET is_active = true,
    label = 'Progetti',
    description = 'Progetti del cliente per linea di servizio e motore operativo',
    sort_order = 5
WHERE key = 'progetti';

SELECT key, label, route, sort_order, is_active
FROM public.workspace_sections
WHERE key IN ('progetti','portfolio','workload')
ORDER BY sort_order;
