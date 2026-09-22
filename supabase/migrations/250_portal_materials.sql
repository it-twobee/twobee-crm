-- 250 — Lo spazio file del cliente (§397). Prima scrittura che arriva dal
-- portale: fin qui il cliente poteva solo leggere.
-- Prerequisiti: 244 (portale), 246 (isolamento storage), 249 (pubblicazione),
-- 108/109 (metadati file). Additiva, nessun backfill.
BEGIN;
SET LOCAL lock_timeout = '5s';

-- La FK composta verso l'attività ha bisogno di una chiave che la 244 non ha:
-- là l'unicità include il progetto, che qui non c'entra.
DO $$ BEGIN
  ALTER TABLE public.portal_activities ADD CONSTRAINT portal_activities_id_client_key UNIQUE (id, client_id);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.portal_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id),
  -- L'etichetta, non il perimetro: lo spazio è dell'azienda. Senza progetto il
  -- file resta ai referenti con accesso completo, perché `portal_can_access`
  -- con progetto nullo esige già `project_scope='all'`.
  project_id uuid,
  -- Si stacca quando il file viene rimosso davvero: la riga resta come traccia,
  -- i byte no. Finché il materiale è vivo il file deve esserci.
  file_id uuid UNIQUE REFERENCES public.files(id) ON DELETE SET NULL,
  storage_key text NOT NULL CHECK (length(btrim(storage_key)) > 0),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 240),
  mime text,
  size bigint NOT NULL CHECK (size > 0 AND size <= 1073741824),
  kind text NOT NULL CHECK (kind IN ('immagine','video','audio','documento')),
  uploaded_by uuid NOT NULL REFERENCES public.profiles(id),
  -- Il cliente non legge `profiles`: il nome di chi ha caricato viaggia qui.
  uploaded_by_name text NOT NULL CHECK (length(btrim(uploaded_by_name)) > 0),
  activity_id uuid,
  idempotency_key uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid REFERENCES public.profiles(id),
  FOREIGN KEY (project_id, client_id) REFERENCES public.projects(id, client_id),
  FOREIGN KEY (activity_id, client_id) REFERENCES public.portal_activities(id, client_id),
  UNIQUE (uploaded_by, idempotency_key),
  CHECK ((deleted_at IS NULL) = (deleted_by IS NULL)),
  CHECK (deleted_at IS NOT NULL OR file_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS portal_materials_client ON public.portal_materials(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS portal_materials_project ON public.portal_materials(project_id, created_at DESC);

ALTER TABLE public.portal_materials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.portal_materials FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.portal_materials TO service_role;
-- `storage_key` e `file_id` restano fuori: il download passa dal backend.
GRANT SELECT (id, client_id, project_id, name, mime, size, kind, uploaded_by,
  uploaded_by_name, activity_id, created_at, deleted_at) ON public.portal_materials TO authenticated;

DROP POLICY IF EXISTS portal_staff_read ON public.portal_materials;
CREATE POLICY portal_staff_read ON public.portal_materials FOR SELECT TO authenticated
  USING (public.portal_is_staff());
-- Lo spazio è dell'azienda: lo vedono tutti i suoi referenti, nel limite dei
-- progetti a cui sono abilitati. Un file eliminato non torna indietro a nessuno.
DROP POLICY IF EXISTS portal_material_read ON public.portal_materials;
CREATE POLICY portal_material_read ON public.portal_materials FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND public.portal_can_access(client_id, project_id));

CREATE OR REPLACE FUNCTION public.portal_guard_material()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Carica chi partecipa, non chi consulta: `portal_assert_actor` esclude il
    -- lettore e verifica azienda, scope e revoca.
    PERFORM public.portal_assert_actor(NEW.uploaded_by, NEW.client_id, NEW.project_id);
    IF NEW.file_id IS NULL OR NEW.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'Un materiale nasce con il suo file, e non nasce già rimosso';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.files f WHERE f.id = NEW.file_id
      AND f.object_key = NEW.storage_key AND f.folder = 'materiali'
      AND f.entity_type = 'client' AND f.entity_id = NEW.client_id) THEN
      RAISE EXCEPTION 'Il file non appartiene allo spazio di questa azienda';
    END IF;
    IF NEW.activity_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.portal_activities a WHERE a.id = NEW.activity_id
        AND a.client_id = NEW.client_id AND a.published_at IS NOT NULL) THEN
      RAISE EXCEPTION 'Attività non disponibile per un materiale';
    END IF;
    RETURN NEW;
  END IF;
  -- Dopo il caricamento il file è quello che è: le sole due modifiche ammesse
  -- sono rimuoverlo, e poi staccare il metadato quando i byte sono spariti.
  IF (NEW.client_id, NEW.project_id, NEW.storage_key, NEW.name, NEW.size, NEW.kind,
      NEW.uploaded_by, NEW.activity_id, NEW.idempotency_key, NEW.created_at)
    IS DISTINCT FROM
     (OLD.client_id, OLD.project_id, OLD.storage_key, OLD.name, OLD.size, OLD.kind,
      OLD.uploaded_by, OLD.activity_id, OLD.idempotency_key, OLD.created_at) THEN
    RAISE EXCEPTION 'Un materiale caricato si può solo rimuovere';
  END IF;
  IF OLD.deleted_at IS NULL THEN
    IF NEW.deleted_at IS NULL OR NEW.file_id IS DISTINCT FROM OLD.file_id THEN
      RAISE EXCEPTION 'Un materiale caricato si può solo rimuovere';
    END IF;
  ELSIF (NEW.deleted_at, NEW.deleted_by) IS DISTINCT FROM (OLD.deleted_at, OLD.deleted_by)
    OR NEW.file_id IS NOT NULL THEN
    RAISE EXCEPTION 'Un materiale rimosso non torna indietro';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS portal_guard_material ON public.portal_materials;
CREATE TRIGGER portal_guard_material BEFORE INSERT OR UPDATE ON public.portal_materials
  FOR EACH ROW EXECUTE FUNCTION public.portal_guard_material();

-- Un materiale che risponde a una richiesta la porta in verifica al team, come
-- fa una risposta scritta: il file è arrivato, non è stato approvato.
CREATE OR REPLACE FUNCTION public.portal_material_marks_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE task uuid;
BEGIN
  IF NEW.activity_id IS NULL THEN RETURN NULL; END IF;
  UPDATE public.portal_activities SET status = 'in_verifica'
    WHERE id = NEW.activity_id AND kind <> 'approvazione' AND status <> 'completata'
    RETURNING source_task_id INTO task;
  IF task IS NOT NULL THEN
    UPDATE public.tasks SET status = 'in_review'
      WHERE id = task AND status NOT IN ('in_review','completato') AND deleted_at IS NULL;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS portal_material_marks_activity ON public.portal_materials;
CREATE TRIGGER portal_material_marks_activity AFTER INSERT ON public.portal_materials
  FOR EACH ROW EXECUTE FUNCTION public.portal_material_marks_activity();

DROP TRIGGER IF EXISTS portal_log_event ON public.portal_materials;
CREATE TRIGGER portal_log_event AFTER INSERT OR UPDATE OR DELETE ON public.portal_materials
  FOR EACH ROW EXECUTE FUNCTION public.portal_log_event();

-- Lo spazio del cliente è una cartella dello storage interno, con una regola
-- in più: sta sempre sotto un'azienda, e non produce mai link anonimi.
CREATE OR REPLACE FUNCTION public.storage_context_access(p_folder text,p_entity_type text,p_entity_id uuid,p_write boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE admin boolean;
BEGIN
  IF NOT public.storage_is_staff(p_write) OR p_folder IS NULL
    OR p_folder NOT IN ('clients','payslips','personal','best_ideas','chat','knowledge','feedback','misc','deliverables','materiali') THEN RETURN false; END IF;
  admin := public.get_my_role()='admin';
  IF (p_entity_type IS NULL) <> (p_entity_id IS NULL) THEN RETURN false; END IF;
  IF p_folder='clients' AND p_entity_type IS DISTINCT FROM 'client' THEN RETURN false; END IF;
  IF p_folder='feedback' AND p_entity_type IS DISTINCT FROM 'feedback' THEN RETURN false; END IF;
  IF p_folder='deliverables' AND p_entity_type IS DISTINCT FROM 'project' THEN RETURN false; END IF;
  IF p_folder='materiali' AND p_entity_type IS DISTINCT FROM 'client' THEN RETURN false; END IF;
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
REVOKE ALL ON FUNCTION public.storage_context_access(text,text,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.storage_context_access(text,text,uuid,boolean) TO authenticated,service_role;

REVOKE ALL ON FUNCTION public.portal_guard_material(), public.portal_material_marks_activity() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
