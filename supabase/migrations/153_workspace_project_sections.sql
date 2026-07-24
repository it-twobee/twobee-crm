-- 153 - Project V2 / Fase 5: riattiva le sezioni Workspace del nuovo motore
--
-- Le righe esistono gia (route /workspace/attivita e /workspace/progetti,
-- gruppo 'lavori'): la 146 le aveva spente. Ora che le pagine esistono, si
-- riaccendono. Restano spente workload/portfolio/task/cestino (fasi future).

BEGIN;

UPDATE public.workspace_sections
SET is_active = true, updated_at = now()
WHERE key IN ('mie_attivita', 'progetti');

COMMIT;

-- verifica: devono risultare attive con le route corrette
SELECT key, label, route, is_active, sort_order, group_key
FROM public.workspace_sections
WHERE key IN ('mie_attivita', 'progetti')
ORDER BY sort_order;
