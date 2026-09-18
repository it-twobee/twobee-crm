-- 231 — chi ha assegnato la task (§347)
--
-- «Questa task è mia, ma chi me l'ha data?» non aveva risposta: `tasks` sa chi
-- l'ha **creata** (`created_by`), non chi ha deciso che la facesse quella
-- persona — e sono due cose diverse ogni volta che una task cambia mano.
-- `task_assignees` è la sorgente canonica dell'assegnazione (CLAUDE.md) ma
-- registrava solo chi e quando, non **da parte di chi**.
--
-- La colonna sta qui e non su `tasks` perché qui sta il fatto che descrive:
-- l'assegnazione. Su `tasks` sarebbe una seconda copia da tenere allineata a
-- mano ogni volta che il titolare cambia, cioè un numero plausibile e sbagliato
-- in attesa di essere letto.
--
-- **Nessun backfill, e non per pigrizia**: l'unica traccia possibile era
-- `activity_log`, dove le righe delle task sono tutte anteriori al reset del
-- dominio progetto e hanno `user_id` nullo. Riempirla con `tasks.created_by`
-- sarebbe stato inventare un'attribuzione: chi crea e chi assegna coincidono
-- spesso, non sempre, e una volta scritta nessuno potrebbe più distinguere il
-- fatto dall'ipotesi. Le assegnazioni già in archivio restano senza autore, e
-- l'interfaccia lo dichiara invece di indovinare.
--
-- Rilanciabile: `ADD COLUMN IF NOT EXISTS`.

BEGIN;

ALTER TABLE public.task_assignees
  ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.task_assignees.assigned_by IS
  'Chi ha deciso questa assegnazione (§347). NULL = assegnata prima che lo registrassimo, o dal motore delle ricorrenze senza un autore.';

-- chi legge la lista chiede «le righe di queste task»: l'indice c'è già su
-- task_id dalla 147, qui non serve altro.

COMMIT;

-- verifica: la colonna c'è, e quante assegnazioni restano senza autore
SELECT
  count(*)                                   AS assegnazioni,
  count(*) FILTER (WHERE assigned_by IS NULL) AS senza_autore
FROM public.task_assignees;
