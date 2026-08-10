-- 211 — §283 · Una task completata si può riaprire, e dopo sessanta giorni sparisce
--
-- Spuntare «fatta» la faceva sparire, e non c'era modo di tornare indietro: nel
-- workspace la query stessa la escludeva (`neq('status','completato')`), negli
-- elenchi ad hoc il filtro di partenza è «aperte». Una spunta per sbaglio — e
-- succede, la casella è grande quanto il dito — significava riscrivere la task
-- da capo, con la descrizione, l'assegnatario e la scadenza persi.
--
-- Servono due cose, e sono due meccanismi diversi:
--
--   1. **restano raggiungibili**, in una sezione loro: chiusa, contata, con la
--      data in cui sono state completate e il gesto per riaprirle;
--   2. **non si accumulano**: dopo 60 giorni se ne vanno da sole. Un elenco di
--      completate che cresce all'infinito è un elenco che nessuno apre più, e
--      allora tanto valeva cancellarle subito.
--
-- **La data la scrive un trigger, non le azioni.** `updateTaskStatus` la
-- scriveva, `setAdHocTaskStatus` e `updateAdHocTask` no: le task ad hoc chiuse
-- restavano senza `completed_at` e la retention non avrebbe avuto niente da cui
-- contare. Tre percorsi che scrivono la stessa regola sono tre posti dove
-- dimenticarla — e infatti due su tre l'avevano dimenticata. Da qui in poi la
-- regola sta nel database: chiunque scriva `status`, la data segue.

BEGIN;

-- ── 1 · la data di completamento la tiene il database ───────────────────────
CREATE OR REPLACE FUNCTION public.tasks_completed_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'completato' THEN
    -- si scrive solo alla **transizione**: un update che tocca il titolo di una
    -- task già chiusa non deve spostarne in avanti la scadenza della retention
    IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'completato' OR NEW.completed_at IS NULL THEN
      NEW.completed_at := COALESCE(NEW.completed_at, now());
    END IF;
  ELSE
    -- riaprire azzera: da quel momento è una task viva come le altre
    NEW.completed_at := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_tasks_completed_at ON public.tasks;
CREATE TRIGGER trg_tasks_completed_at
  BEFORE INSERT OR UPDATE OF status ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.tasks_completed_at();

-- Le già completate senza data: si assume l'ultima modifica. È un'assunzione, e
-- si dichiara — ma è meglio di NULL, che le renderebbe eterne.
UPDATE public.tasks
   SET completed_at = COALESCE(updated_at, created_at, now())
 WHERE status = 'completato' AND completed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_completed_at ON public.tasks (completed_at)
  WHERE completed_at IS NOT NULL;

COMMENT ON COLUMN public.tasks.completed_at IS
  '§283 — quando è stata completata. La scrive il trigger, non le azioni: tre percorsi che scrivono la stessa regola sono tre posti dove dimenticarla. Riaprire azzera.';

-- ── 2 · dopo sessanta giorni se ne vanno ────────────────────────────────────
-- Il parametro è un argomento e non una colonna di configurazione: sessanta
-- giorni è una decisione presa, e una manopola in più sarebbe una manopola che
-- nessuno tocca. Chi vuole cambiarlo cambia la riga del cron, e si vede.
CREATE OR REPLACE FUNCTION public.purge_completed_tasks(p_days INT DEFAULT 60)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n INT;
BEGIN
  IF p_days IS NULL OR p_days <= 0 THEN RETURN 0; END IF;
  /* Solo le completate **con una data**: una senza è una task di cui non
     sappiamo quando è stata chiusa, e cancellarla sarebbe un'ipotesi travestita
     da pulizia. Il trigger fa sì che da qui in avanti non ne esistano più. */
  WITH morte AS (
    DELETE FROM public.tasks
     WHERE status = 'completato'
       AND completed_at IS NOT NULL
       AND completed_at < now() - make_interval(days => p_days)
    RETURNING 1
  )
  SELECT count(*) INTO v_n FROM morte;
  RETURN v_n;
END $$;

REVOKE ALL ON FUNCTION public.purge_completed_tasks(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_completed_tasks(INT) TO service_role;

COMMENT ON FUNCTION public.purge_completed_tasks(INT) IS
  '§283 — cancella le task completate da più di N giorni (60 di norma). Ne conta quante: un numero che nessuno vede è una cancellazione di cui nessuno si accorge.';

-- ── 3 · il cron notturno ────────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM cron.unschedule('purge-completed-tasks');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.schedule('purge-completed-tasks', '20 3 * * *',
    $cron$ SELECT public.purge_completed_tasks(60); $cron$);
EXCEPTION WHEN undefined_table OR undefined_function OR invalid_schema_name THEN
  RAISE NOTICE 'pg_cron non disponibile: le completate restano finché non si esegue purge_completed_tasks()';
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
