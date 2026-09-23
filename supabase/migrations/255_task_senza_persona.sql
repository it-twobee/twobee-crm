-- §418 — una task deve sopravvivere alla persona che ci lavorava.
--
-- Chi prova a eliminare un membro dalle impostazioni si ferma qui: il database
-- rifiuta, perché `tasks.assignee_id` punta a `profiles` senza dire cosa fare
-- quando quella riga sparisce — e senza istruzioni Postgres sceglie
-- `NO ACTION`, cioè «blocca». Basta **una** task, anche completata mesi fa,
-- anche assegnata per sbaglio, e quell'account non si cancella più.
--
-- È un'omissione, non una scelta: la 147 ha ricostruito `tasks` scrivendo
-- `assignee_id UUID REFERENCES public.profiles(id)` senza clausola — la stessa
-- migration che si era dimenticata i trigger di cronologia (§412). Nello stesso
-- schema le colonne che dicono **chi ha fatto una cosa** sono già tutte
-- `SET NULL`: `activity_log.user_id` dalla 013, `files.uploaded_by`. Questa è
-- rimasta indietro.
--
-- `SET NULL` è anche la semantica giusta, non solo la più comoda: la task resta,
-- torna senza assegnatario, e chi governa il progetto la riassegna. La riga in
-- `task_assignees` sparisce già in cascata, quindi le due fonti restano
-- d'accordo — la task è davvero libera, non solo priva del primario.
--
-- Vale per **tutte** le colonne di `tasks` che puntano a una persona e che
-- possono stare vuote: si chiedono allo schema invece di elencarle, perché è un
-- elenco scritto a mano che ha creato il problema. Le colonne obbligatorie
-- restano fuori: lì `SET NULL` violerebbe il `NOT NULL` e il rifiuto sarebbe
-- solo più tardi e meno chiaro.
--
-- Rilanciabile: la seconda volta non trova più niente da convertire.

BEGIN;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname, a.attname
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND c.conrelid = 'public.tasks'::regclass
      AND c.confrelid = 'public.profiles'::regclass
      AND array_length(c.conkey, 1) = 1
      AND c.confdeltype IN ('a', 'r')   -- no action, restrict
      AND NOT a.attnotnull              -- una colonna obbligatoria non può diventare NULL
  LOOP
    EXECUTE format('ALTER TABLE public.tasks DROP CONSTRAINT %I', r.conname);
    EXECUTE format(
      'ALTER TABLE public.tasks ADD CONSTRAINT %I FOREIGN KEY (%I)
         REFERENCES public.profiles(id) ON DELETE SET NULL',
      r.conname, r.attname);
    RAISE NOTICE 'tasks.% adesso si slega invece di bloccare', r.attname;
  END LOOP;
END $$;

COMMIT;

-- verifica 1: nessuna colonna di `tasks` verso `profiles` blocca più
SELECT a.attname AS colonna,
  CASE c.confdeltype WHEN 'a' THEN 'no action' WHEN 'r' THEN 'restrict'
                     WHEN 'c' THEN 'cascade'   WHEN 'n' THEN 'set null'
                     WHEN 'd' THEN 'set default' END AS alla_cancellazione
FROM pg_constraint c
JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
WHERE c.contype = 'f' AND c.conrelid = 'public.tasks'::regclass
  AND c.confrelid = 'public.profiles'::regclass
ORDER BY a.attname;

-- verifica 2: l'inventario di chi blocca ancora, in tutto lo schema.
-- Non è un elenco da svuotare: per certe tabelle bloccare è giusto. Serve
-- perché il prossimo vicolo cieco si veda **prima** di aprirlo, invece che
-- davanti a una finestra che dice di no e non dice come uscirne.
SELECT c.conrelid::regclass::text AS tabella, a.attname AS colonna, a.attnotnull AS obbligatoria
FROM pg_constraint c
JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
WHERE c.contype = 'f'
  AND c.confrelid = 'public.profiles'::regclass
  AND array_length(c.conkey, 1) = 1
  AND c.confdeltype IN ('a', 'r')
ORDER BY 1, 2;
