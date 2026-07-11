-- LOG-01: audit log uniforme.
-- L'audit log è centralizzato in un trigger DB (log_activity, 013) — non nelle
-- server action. Qui: (1) estendo la copertura a `decisions` (Decision Center,
-- prima non tracciato); (2) chiudo la falla RLS: il log era leggibile da QUALSIASI
-- utente autenticato (anche client/guest) → ora solo staff. Additiva e idempotente.

-- ── 1) Funzione trigger: aggiunge la label per `decisions` ────────────────────
CREATE OR REPLACE FUNCTION public.log_activity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_action      TEXT;
  v_snapshot    JSONB;
  v_diff        JSONB := NULL;
  v_user_id     UUID;
  v_label       TEXT;
  v_entity_id   UUID;
BEGIN
  BEGIN
    v_user_id := NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;
  IF v_user_id IS NULL THEN
    BEGIN
      v_user_id := auth.uid();
    EXCEPTION WHEN OTHERS THEN
      v_user_id := NULL;
    END;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_action   := 'create';
    v_snapshot := to_jsonb(NEW);
    v_entity_id := (NEW).id;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action   := 'update';
    v_snapshot := to_jsonb(NEW);
    v_entity_id := (NEW).id;
    SELECT jsonb_object_agg(key, jsonb_build_object('old', old_obj->key, 'new', new_obj->key))
    INTO v_diff
    FROM (SELECT to_jsonb(OLD) AS old_obj, to_jsonb(NEW) AS new_obj) AS rows,
         jsonb_each(to_jsonb(OLD)) AS kv(key, val)
    WHERE (old_obj->key) IS DISTINCT FROM (new_obj->key)
      AND key NOT IN ('updated_at', 'created_at');
  ELSIF TG_OP = 'DELETE' THEN
    v_action   := 'delete';
    v_snapshot := to_jsonb(OLD);
    v_entity_id := (OLD).id;
  END IF;

  v_label := CASE TG_TABLE_NAME
    WHEN 'clients'      THEN (v_snapshot->>'company_name')
    WHEN 'tasks'        THEN (v_snapshot->>'title')
    WHEN 'deals'        THEN (v_snapshot->>'title')
    WHEN 'invoices'     THEN CONCAT('Fattura ', v_snapshot->>'invoice_number', ' - ', v_snapshot->>'month')
    WHEN 'tickets'      THEN (v_snapshot->>'title')
    WHEN 'objectives'   THEN (v_snapshot->>'title')
    WHEN 'key_results'  THEN (v_snapshot->>'title')
    WHEN 'projects'     THEN (v_snapshot->>'name')
    WHEN 'decisions'    THEN (v_snapshot->>'title')
    ELSE v_entity_id::TEXT
  END;

  INSERT INTO public.activity_log (user_id, entity_type, entity_id, entity_label, action, snapshot, diff)
  VALUES (v_user_id, TG_TABLE_NAME, v_entity_id, v_label, v_action, v_snapshot, v_diff);

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

-- ── 2) Copertura mancante: Decision Center ────────────────────────────────────
CREATE OR REPLACE TRIGGER trg_log_decisions
  AFTER INSERT OR UPDATE OR DELETE ON public.decisions
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();

-- ── 3) RLS: il log lo legge/scrive solo lo staff (era aperto a tutti) ─────────
-- I trigger inseriscono in SECURITY DEFINER → non toccati dalla policy INSERT.
DROP POLICY IF EXISTS "activity_log_view"   ON public.activity_log;
DROP POLICY IF EXISTS "activity_log_insert" ON public.activity_log;
CREATE POLICY "activity_log_view"   ON public.activity_log FOR SELECT USING (public.is_staff());
CREATE POLICY "activity_log_insert" ON public.activity_log FOR INSERT WITH CHECK (public.is_staff());
