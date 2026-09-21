-- Allegati interni: staff attivo, contesto verificato e scritture solo backend.
BEGIN;
SET LOCAL lock_timeout='5s';

CREATE OR REPLACE FUNCTION public.storage_is_staff(p_write boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.is_active IS DISTINCT FROM false
    AND ((p.role='admin' AND p.app_role IN ('super_admin','founder','admin'))
      OR (p.role='team' AND p.app_role IN ('manager','senior','junior','stage','freelance','partner','viewer')))
    AND (NOT p_write OR p.app_role<>'viewer'));
$$;

CREATE OR REPLACE FUNCTION public.storage_context_access(p_folder text,p_entity_type text,p_entity_id uuid,p_write boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE admin boolean;
BEGIN
  IF NOT public.storage_is_staff(p_write) OR p_folder IS NULL
    OR p_folder NOT IN ('clients','payslips','personal','best_ideas','chat','knowledge','feedback','misc') THEN RETURN false; END IF;
  admin := public.get_my_role()='admin';
  IF (p_entity_type IS NULL) <> (p_entity_id IS NULL) THEN RETURN false; END IF;
  IF p_folder='clients' AND p_entity_type IS DISTINCT FROM 'client' THEN RETURN false; END IF;
  IF p_folder='feedback' AND p_entity_type IS DISTINCT FROM 'feedback' THEN RETURN false; END IF;
  IF p_entity_type IS NULL THEN RETURN true; END IF;
  -- Invoker: la visibilità del contesto passa dalla RLS della sua tabella.
  CASE p_entity_type
    WHEN 'client' THEN RETURN EXISTS(SELECT 1 FROM public.clients c WHERE c.id=p_entity_id AND (admin OR c.workspace_hidden IS DISTINCT FROM true));
    WHEN 'project' THEN RETURN EXISTS(SELECT 1 FROM public.projects p WHERE p.id=p_entity_id AND p.deleted_at IS NULL);
    WHEN 'profile' THEN RETURN EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=p_entity_id AND (admin OR p.id=auth.uid()));
    WHEN 'feedback' THEN RETURN EXISTS(SELECT 1 FROM public.feedback f WHERE f.id=p_entity_id AND (NOT p_write OR admin OR f.author_id=auth.uid()));
    WHEN 'channel' THEN RETURN EXISTS(SELECT 1 FROM public.chat_channels c WHERE c.id=p_entity_id);
    ELSE RETURN false;
  END CASE;
END;
$$;
REVOKE ALL ON FUNCTION public.storage_is_staff(boolean),public.storage_context_access(text,text,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.storage_is_staff(boolean),public.storage_context_access(text,text,uuid,boolean) TO authenticated,service_role;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['files','file_folders','file_shares'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    -- Il browser non deve poter forgiare object_key, owner, contesti o token.
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
    EXECUTE format('DROP POLICY IF EXISTS storage_active_staff ON public.%I',t);
    EXECUTE format('CREATE POLICY storage_active_staff ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.storage_is_staff()) WITH CHECK (public.storage_is_staff(true))',t);
  END LOOP;
END $$;
DROP POLICY IF EXISTS storage_file_context ON public.files;
CREATE POLICY storage_file_context ON public.files AS RESTRICTIVE FOR SELECT TO authenticated
  USING(public.storage_context_access(folder,entity_type,entity_id));
DROP POLICY IF EXISTS storage_folder_context ON public.file_folders;
CREATE POLICY storage_folder_context ON public.file_folders AS RESTRICTIVE FOR SELECT TO authenticated
  USING(public.storage_context_access(folder,entity_type,entity_id));
DROP POLICY IF EXISTS storage_share_file ON public.file_shares;
CREATE POLICY storage_share_file ON public.file_shares AS RESTRICTIVE FOR SELECT TO authenticated
  USING(EXISTS(SELECT 1 FROM public.files f WHERE f.id=file_id));

CREATE OR REPLACE FUNCTION public.storage_guard_parent_context()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE parent public.file_folders; parent_key uuid;
BEGIN
  IF TG_TABLE_NAME='files' THEN parent_key:=NEW.folder_id;
  ELSE
    parent_key:=NEW.parent_id;
    IF TG_OP='UPDATE' AND (NEW.folder,NEW.entity_type,NEW.entity_id) IS DISTINCT FROM (OLD.folder,OLD.entity_type,OLD.entity_id)
      AND (EXISTS(SELECT 1 FROM public.file_folders WHERE parent_id=NEW.id) OR EXISTS(SELECT 1 FROM public.files WHERE folder_id=NEW.id)) THEN
      RAISE EXCEPTION 'Una cartella non vuota non può cambiare contesto' USING ERRCODE='23514';
    END IF;
    IF parent_key=NEW.id THEN RAISE EXCEPTION 'Una cartella non può contenere sé stessa' USING ERRCODE='23514'; END IF;
    IF parent_key IS NOT NULL AND EXISTS (
      WITH RECURSIVE ancestors AS (
        SELECT id,parent_id FROM public.file_folders WHERE id=parent_key
        UNION
        SELECT f.id,f.parent_id FROM public.file_folders f JOIN ancestors a ON f.id=a.parent_id
      ) SELECT 1 FROM ancestors WHERE id=NEW.id
    ) THEN RAISE EXCEPTION 'Alberatura cartelle non valida' USING ERRCODE='23514'; END IF;
  END IF;
  IF parent_key IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO parent FROM public.file_folders WHERE id=parent_key FOR SHARE;
  IF NOT FOUND OR (NEW.folder,NEW.entity_type,NEW.entity_id) IS DISTINCT FROM (parent.folder,parent.entity_type,parent.entity_id) THEN
    RAISE EXCEPTION 'Cartella e contenuto appartengono a contesti diversi' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.storage_guard_parent_context() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS storage_guard_parent_context ON public.files;
CREATE TRIGGER storage_guard_parent_context BEFORE INSERT OR UPDATE ON public.files FOR EACH ROW EXECUTE FUNCTION public.storage_guard_parent_context();
DROP TRIGGER IF EXISTS storage_guard_parent_context ON public.file_folders;
CREATE TRIGGER storage_guard_parent_context BEFORE INSERT OR UPDATE ON public.file_folders FOR EACH ROW EXECUTE FUNCTION public.storage_guard_parent_context();

CREATE OR REPLACE FUNCTION public.storage_actor_can_manage(p_actor uuid,p_owner uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=p_actor AND p.is_active IS DISTINCT FROM false
    AND ((p.role='admin' AND p.app_role IN ('super_admin','founder','admin'))
      OR (p.role='team' AND p.app_role IN ('manager','senior','junior','stage','freelance','partner') AND p.id=p_owner)));
$$;
REVOKE ALL ON FUNCTION public.storage_actor_can_manage(uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.storage_guard_folder_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor uuid;
BEGIN
  actor:=(nullif(current_setting('request.headers',true),'')::jsonb->>'x-actor-id')::uuid;
  -- Anche i figli aggiunti fra il controllo API e il DELETE passano da questo trigger.
  IF NOT public.storage_actor_can_manage(actor,OLD.created_by) OR EXISTS(
    SELECT 1 FROM public.files f WHERE f.folder_id=OLD.id AND NOT public.storage_actor_can_manage(actor,f.uploaded_by)
  ) THEN RAISE EXCEPTION 'La cartella contiene elementi non eliminabili' USING ERRCODE='42501'; END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.storage_guard_folder_delete() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS storage_guard_folder_delete ON public.file_folders;
CREATE TRIGGER storage_guard_folder_delete BEFORE DELETE ON public.file_folders FOR EACH ROW EXECUTE FUNCTION public.storage_guard_folder_delete();

CREATE OR REPLACE FUNCTION public.storage_replace_share(p_file uuid,p_token text,p_expires_at timestamptz)
RETURNS SETOF public.file_shares LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor uuid; target public.files;
BEGIN
  actor:=(nullif(current_setting('request.headers',true),'')::jsonb->>'x-actor-id')::uuid;
  IF NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=actor AND p.is_active IS DISTINCT FROM false
    AND ((p.role='admin' AND p.app_role IN ('super_admin','founder','admin'))
      OR (p.role='team' AND p.app_role IN ('manager','senior','junior','stage','freelance','partner')))) THEN
    RAISE EXCEPTION 'Condivisione non autorizzata' USING ERRCODE='42501';
  END IF;
  -- Serializza rinnovo e revoca: due richieste parallele non lasciano due token attivi.
  SELECT * INTO target FROM public.files WHERE id=p_file FOR UPDATE;
  IF NOT FOUND OR NOT public.storage_actor_can_manage(actor,target.uploaded_by) THEN
    RAISE EXCEPTION 'File non gestibile' USING ERRCODE='42501';
  END IF;
  IF p_token IS NOT NULL THEN
    IF target.folder NOT IN ('misc','knowledge','feedback') OR (target.entity_type IS NOT NULL AND target.entity_type<>'feedback') THEN
      RAISE EXCEPTION 'Il file richiede un accesso personale' USING ERRCODE='42501';
    END IF;
    IF p_token !~ '^[A-Za-z0-9_-]{32,128}$' OR (p_expires_at IS NOT NULL AND p_expires_at<=now()) THEN
      RAISE EXCEPTION 'Link non valido' USING ERRCODE='22023';
    END IF;
  END IF;
  UPDATE public.file_shares SET revoked=true WHERE file_id=p_file AND NOT revoked;
  IF p_token IS NOT NULL THEN
    RETURN QUERY INSERT INTO public.file_shares(file_id,token,created_by,expires_at)
      VALUES(p_file,p_token,actor,p_expires_at) RETURNING *;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.storage_replace_share(uuid,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.storage_replace_share(uuid,text,timestamptz) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
