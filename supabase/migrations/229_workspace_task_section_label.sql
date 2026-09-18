-- 229 — nel workspace la sezione si chiama «Task» (§346)
--
-- La voce di menu diceva ancora «Task Ad Hoc», ma quella pagina non mostra più
-- le sole ad hoc: dal §340 le contiene tutte, di progetto e fuori progetto, con
-- il selettore in cima che rifà la separazione quando serve. L'intestazione
-- della pagina dice «Task» da allora — il menu no, e un nome che promette metà
-- del contenuto fa cercare altrove l'altra metà, che è esattamente il difetto
-- che §340 aveva chiuso.
--
-- Cambia **solo l'etichetta e la descrizione**: la rotta, i permessi e l'ordine
-- restano quelli della 156. Nessuno perde né guadagna una sezione.
--
-- La 156 scriveva `'Task Ad Hoc'` come letterale, con `ON CONFLICT (key) DO
-- UPDATE SET label = EXCLUDED.label`: rilanciarla avrebbe disfatto questa. Il
-- letterale nella 156 è stato allineato, perché «rilanciare il più vecchio non
-- deve disfare il più nuovo» (docs/migrations.md, il caso 221/224).
--
-- Rilanciabile: un UPDATE idempotente.

BEGIN;

UPDATE public.workspace_sections
   SET label       = 'Task',
       description = 'Tutte le task, dentro e fuori dai progetti',
       updated_at  = now()
 WHERE key = 'ad_hoc';

COMMIT;

-- verifica: la voce del menu, e la riga omonima rimasta spenta dalla 000 —
-- `task` punta a `/workspace/task`, che non esiste: è inattiva, quindi non
-- compare, ma è il posto dove qualcuno un giorno accenderà un link che non porta
-- da nessuna parte (§211). Si guarda, non si tocca qui.
SELECT key, label, route, is_active, sort_order
FROM public.workspace_sections
WHERE key IN ('ad_hoc', 'task')
ORDER BY key;
