-- 230 — via la riga «task», che è il fantasma di questa stessa sezione (§346)
--
-- In `workspace_sections` ci sono **due** righe per la stessa cosa:
--
--   ad_hoc  → «Task»  → /workspace/ad-hoc   attiva, è la pagina vera
--   task    → «Task»  → /workspace/task     spenta, la pagina non esiste
--
-- La seconda è il residuo di prima del reset del dominio progetto (144/146): la
-- rotta `/workspace/task` è stata cancellata insieme al resto, la riga no. Dopo
-- la 229 le due si chiamano anche uguali, e quella morta si porta dietro i
-- permessi di manager, senior, junior, stage e freelance: è **una spunta di
-- distanza** dal diventare una voce di menu che rimbalza (§211), con lo stesso
-- nome di quella che funziona.
--
-- Oggi è difesa due volte — `is_active = false` in tabella e `task` dentro
-- `HIDDEN_WORKSPACE_KEYS` nel layout — e due difese su un dato che non serve a
-- niente non sono prudenza: sono il motivo per cui nessuno lo tocca più. Le
-- altre chiavi di quell'elenco (chat, portfolio, workload, cestino) restano:
-- quelle sono funzioni tolte che possono tornare, e la riga è il posto dove
-- ritroveranno ordine, gruppo e permessi. `task` non può tornare, perché è già
-- tornata con un altro nome.
--
-- I permessi se ne vanno con lei: `ON DELETE CASCADE` dalla 079.
--
-- Rilanciabile: il secondo giro non trova più niente da cancellare.

BEGIN;

DELETE FROM public.workspace_sections
 WHERE key = 'task'
   AND route = '/workspace/task'
   AND NOT is_active;

COMMIT;

-- verifica: resta una sola «Task», ed è quella che ha una pagina
SELECT key, label, route, is_active
FROM public.workspace_sections
WHERE label ILIKE 'task%' OR key IN ('task', 'ad_hoc')
ORDER BY key;
