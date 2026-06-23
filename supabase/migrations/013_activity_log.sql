-- ═══════════════════════════════════════════════════════════════
-- ACTIVITY LOG — Cronologia automatica di tutte le modifiche
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.activity_log (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  entity_type  TEXT        NOT NULL,  -- 'client','task','deal','invoice','ticket','objective','key_result'
  entity_id    UUID        NOT NULL,
  entity_label TEXT,                  -- nome leggibile (es. company_name, title)
  action       TEXT        NOT NULL CHECK (action IN ('create','update','delete')),
  snapshot     JSONB       NOT NULL,  -- stato NUOVO (insert/update) o VECCHIO (delete)
  diff         JSONB,                 -- {campo: {old: x, new: y}} — solo per update
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS activity_log_entity_idx  ON public.activity_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS activity_log_user_idx    ON public.activity_log (user_id);
CREATE INDEX IF NOT EXISTS activity_log_created_idx ON public.activity_log (created_at DESC);

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "activity_log_view"   ON public.activity_log;
DROP POLICY IF EXISTS "activity_log_insert" ON public.activity_log;
CREATE POLICY "activity_log_view"   ON public.activity_log FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "activity_log_insert" ON public.activity_log FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ═══════════════════════════════════════════════════════════════
-- FUNZIONE TRIGGER GENERICA
-- Calcola il diff tra OLD e NEW e inserisce in activity_log.
-- user_id viene passato tramite SET LOCAL app.current_user_id.
-- ═══════════════════════════════════════════════════════════════
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
  -- Ricava l'utente dalla variabile di sessione (impostata dal client)
  BEGIN
    v_user_id := NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  -- Anche da auth.uid() se disponibile
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
    -- Calcola diff: solo campi che sono cambiati
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

  -- Ricava label leggibile dalla tabella
  v_label := CASE TG_TABLE_NAME
    WHEN 'clients'      THEN (v_snapshot->>'company_name')
    WHEN 'tasks'        THEN (v_snapshot->>'title')
    WHEN 'deals'        THEN (v_snapshot->>'title')
    WHEN 'invoices'     THEN CONCAT('Fattura ', v_snapshot->>'invoice_number', ' - ', v_snapshot->>'month')
    WHEN 'tickets'      THEN (v_snapshot->>'title')
    WHEN 'objectives'   THEN (v_snapshot->>'title')
    WHEN 'key_results'  THEN (v_snapshot->>'title')
    WHEN 'projects'     THEN (v_snapshot->>'name')
    ELSE v_entity_id::TEXT
  END;

  INSERT INTO public.activity_log (user_id, entity_type, entity_id, entity_label, action, snapshot, diff)
  VALUES (v_user_id, TG_TABLE_NAME, v_entity_id, v_label, v_action, v_snapshot, v_diff);

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- TRIGGER sulle tabelle principali
-- Usa DO $$ per applicarli solo se la tabella esiste già
-- (le migration 011 e 012 potrebbero non essere ancora applicate)
-- ═══════════════════════════════════════════════════════════════

-- Tabelle core — esistono dalla migration iniziale
CREATE OR REPLACE TRIGGER trg_log_clients
  AFTER INSERT OR UPDATE OR DELETE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();

CREATE OR REPLACE TRIGGER trg_log_tasks
  AFTER INSERT OR UPDATE OR DELETE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();

CREATE OR REPLACE TRIGGER trg_log_invoices
  AFTER INSERT OR UPDATE OR DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();

CREATE OR REPLACE TRIGGER trg_log_projects
  AFTER INSERT OR UPDATE OR DELETE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();

-- Tabelle da migration 011 (Area Commerciale + Customer Care)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'deals') THEN
    CREATE OR REPLACE TRIGGER trg_log_deals
      AFTER INSERT OR UPDATE OR DELETE ON public.deals
      FOR EACH ROW EXECUTE FUNCTION public.log_activity();
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tickets') THEN
    CREATE OR REPLACE TRIGGER trg_log_tickets
      AFTER INSERT OR UPDATE OR DELETE ON public.tickets
      FOR EACH ROW EXECUTE FUNCTION public.log_activity();
  END IF;
END $$;

-- Tabelle da migration 012 (Strategia)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'objectives') THEN
    CREATE OR REPLACE TRIGGER trg_log_objectives
      AFTER INSERT OR UPDATE OR DELETE ON public.objectives
      FOR EACH ROW EXECUTE FUNCTION public.log_activity();
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'key_results') THEN
    CREATE OR REPLACE TRIGGER trg_log_key_results
      AFTER INSERT OR UPDATE OR DELETE ON public.key_results
      FOR EACH ROW EXECUTE FUNCTION public.log_activity();
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- NOTA: dopo aver eseguito le migration 011 e 012, esegui
-- manualmente questi trigger aggiuntivi se non sono stati creati:
-- ═══════════════════════════════════════════════════════════════
-- CREATE OR REPLACE TRIGGER trg_log_deals
--   AFTER INSERT OR UPDATE OR DELETE ON public.deals
--   FOR EACH ROW EXECUTE FUNCTION public.log_activity();
--
-- CREATE OR REPLACE TRIGGER trg_log_tickets
--   AFTER INSERT OR UPDATE OR DELETE ON public.tickets
--   FOR EACH ROW EXECUTE FUNCTION public.log_activity();
--
-- CREATE OR REPLACE TRIGGER trg_log_objectives
--   AFTER INSERT OR UPDATE OR DELETE ON public.objectives
--   FOR EACH ROW EXECUTE FUNCTION public.log_activity();
--
-- CREATE OR REPLACE TRIGGER trg_log_key_results
--   AFTER INSERT OR UPDATE OR DELETE ON public.key_results
--   FOR EACH ROW EXECUTE FUNCTION public.log_activity();
