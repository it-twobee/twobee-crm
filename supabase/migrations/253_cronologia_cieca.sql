-- §412 — la cronologia non vedeva più le task, e da lì «a parecchi conta zero».
--
-- Il sintomo: nella vista sull'utilizzo la colonna delle modifiche diceva 0 per
-- quasi tutti. Non era un difetto della vista. `activity_log` **non riceve una
-- riga da `tasks` dal 20 luglio 2026** — e le task si muovono ogni giorno: 149
-- toccate negli ultimi trenta, 45 portate a «completato». Stessa storia per
-- `projects` (ultima riga il 20 luglio, ultima modifica vera il 22 settembre) e
-- per `invoices` (ultima riga il 19 luglio).
--
-- La causa è meccanica e ha una data: la **144** ha droppato il dominio progetti
-- con `CASCADE` — e `CASCADE` porta via anche i trigger — e la **147** ha
-- ricostruito `projects`, `tasks`, `milestones` e `project_workstreams` con i
-- soli trigger di `updated_at`. `trg_log_tasks` e `trg_log_projects` non sono
-- mai tornati. Nessuno se n'è accorto perché una cronologia che si svuota non
-- dà errore: dà una pagina vuota, che sembra una giornata tranquilla.
--
-- Chi lavora in workspace lavora su task e tappe. Finché quelle due tabelle non
-- scrivono, il registro può dire solo che non hanno fatto niente — che è la
-- categoria di errore peggiore: plausibile, e sbagliata.
--
-- Qui dentro due cose.
--   1. `log_activity()` impara l'etichetta di `milestones` e
--      `project_workstreams`: sono il dominio progetti di adesso, e senza
--      etichetta la cronologia mostrerebbe un UUID.
--   2. I trigger si rimettono su **tutte** le tabelle con cronologia che
--      esistono davvero, in un giro solo che le chiede a `to_regclass` invece
--      di fidarsi di un elenco scritto a mano — perché è esattamente un elenco
--      scritto a mano che si è disallineato la prima volta.
--
-- Il corpo della funzione è quello della **179** (attore da `x-actor-id`,
-- controllo che l'id sia un profilo vero, update a vuoto che non scrive):
-- ricopiato per intero di proposito. `CREATE OR REPLACE` sostituisce tutto, e
-- una versione «solo con le mie aggiunte» riporterebbe indietro l'attribuzione.
--
-- Rilanciabile. Non ricostruisce il passato: da qui in avanti il registro vede.

BEGIN;

CREATE OR REPLACE FUNCTION public.log_activity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_action    TEXT;
  v_snapshot  JSONB;
  v_diff      JSONB := NULL;
  v_user_id   UUID;
  v_label     TEXT;
  v_entity_id UUID;
BEGIN
  -- a) l'attore dichiarato dal client che scrive col service role
  BEGIN
    v_user_id := NULLIF(current_setting('request.headers', TRUE)::json->>'x-actor-id', '')::UUID;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  -- b) la variabile di sessione, se qualcuno la imposta
  IF v_user_id IS NULL THEN
    BEGIN
      v_user_id := NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID;
    EXCEPTION WHEN OTHERS THEN
      v_user_id := NULL;
    END;
  END IF;

  -- c) la sessione dell'utente, quando la scrittura passa dal suo client
  IF v_user_id IS NULL THEN
    BEGIN
      v_user_id := auth.uid();
    EXCEPTION WHEN OTHERS THEN
      v_user_id := NULL;
    END;
  END IF;

  -- l'id dichiarato deve essere un profilo vero, altrimenti la FK rifiuta
  -- la riga e si perde l'intera voce di cronologia per un header sbagliato
  IF v_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id) THEN
    v_user_id := NULL;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_action := 'create';
    v_snapshot := to_jsonb(NEW);
    v_entity_id := (NEW).id;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update';
    v_snapshot := to_jsonb(NEW);
    v_entity_id := (NEW).id;
    SELECT jsonb_object_agg(key, jsonb_build_object('old', old_obj->key, 'new', new_obj->key))
    INTO v_diff
    FROM (SELECT to_jsonb(OLD) AS old_obj, to_jsonb(NEW) AS new_obj) AS rows,
         jsonb_each(to_jsonb(OLD)) AS kv(key, val)
    WHERE (old_obj->key) IS DISTINCT FROM (new_obj->key)
      AND key NOT IN ('updated_at', 'created_at');
    -- un UPDATE che non cambia niente non è una voce di cronologia
    IF v_diff IS NULL OR v_diff = '{}'::jsonb THEN
      RETURN NEW;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'delete';
    v_snapshot := to_jsonb(OLD);
    v_entity_id := (OLD).id;
  END IF;

  v_label := CASE TG_TABLE_NAME
    WHEN 'clients'             THEN COALESCE(v_snapshot->>'display_name', v_snapshot->>'company_name')
    WHEN 'tasks'               THEN (v_snapshot->>'title')
    WHEN 'deals'               THEN (v_snapshot->>'title')
    WHEN 'invoices'            THEN CONCAT('Fattura ', v_snapshot->>'invoice_number', ' - ', v_snapshot->>'month')
    WHEN 'tickets'             THEN (v_snapshot->>'title')
    WHEN 'objectives'          THEN (v_snapshot->>'title')
    WHEN 'key_results'         THEN (v_snapshot->>'title')
    WHEN 'projects'            THEN (v_snapshot->>'name')
    WHEN 'decisions'           THEN (v_snapshot->>'title')
    -- §412 — il dominio progetti di adesso: senza queste due righe la
    -- cronologia di una tappa mostrerebbe un UUID al posto del titolo
    WHEN 'milestones'          THEN (v_snapshot->>'title')
    WHEN 'project_workstreams' THEN (v_snapshot->>'name')
    ELSE v_entity_id::TEXT
  END;

  INSERT INTO public.activity_log (user_id, entity_type, entity_id, entity_label, action, snapshot, diff)
  VALUES (v_user_id, TG_TABLE_NAME, v_entity_id, v_label, v_action, v_snapshot, v_diff);

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

COMMIT;

-- verifica 1: la funzione conosce le due tabelle nuove
SELECT
  position('milestones' in pg_get_functiondef(p.oid)) > 0          AS sa_le_tappe,
  position('project_workstreams' in pg_get_functiondef(p.oid)) > 0 AS sa_i_workstream
FROM pg_proc p
WHERE p.proname = 'log_activity' AND pg_function_is_visible(p.oid);

-- ═══════════════════════════════════════════════════════════════
-- I TRIGGER — su quello che esiste, non su quello che ricordiamo
-- ═══════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'clients', 'projects', 'project_workstreams', 'milestones', 'tasks',
    'deals', 'invoices', 'tickets', 'objectives', 'key_results', 'decisions'
  ] LOOP
    -- una tabella che non c'è non è un errore: il dominio è cambiato due volte
    -- e cambierà ancora. Quello che conta è che chi c'è scriva.
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_log_' || t, t);
      EXECUTE format(
        'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I
           FOR EACH ROW EXECUTE FUNCTION public.log_activity()',
        'trg_log_' || t, t);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- verifica 2: l'elenco di chi adesso scrive in cronologia. `tasks`,
-- `projects`, `milestones` e `project_workstreams` devono esserci.
SELECT c.relname AS tabella, t.tgname AS trigger, t.tgenabled AS stato
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND t.tgname LIKE 'trg_log_%' AND NOT t.tgisinternal
ORDER BY c.relname;
