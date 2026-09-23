-- 254 — L'area file si organizza (§413): cartelle che esistono anche vuote,
-- file e cartelle che si spostano e si rinominano.
-- Prerequisiti: 244 (portale), 246 (storage), 250 (spazio cliente), 251 (area
-- cliente). Additiva e rilanciabile. Nessun backfill: le cartelle che ci sono
-- già restano quelle dei percorsi dei file.
BEGIN;
SET LOCAL lock_timeout = '5s';

-- ── 1) Chi organizza ─────────────────────────────────────────────────────────
-- Staff interno attivo, la stessa lista di `portal_is_staff()`. L'attore
-- arriva nell'header perché le scritture passano dal service role; un'azienda
-- nascosta al workspace la tocca solo un admin (§213), anche se la rotta
-- l'ha già controllato: l'header non è un permesso.
CREATE OR REPLACE FUNCTION public.portal_material_actor(p_client uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid; admin boolean;
BEGIN
  actor := nullif(nullif(current_setting('request.headers', true), '')::jsonb->>'x-actor-id', '')::uuid;
  SELECT p.role = 'admin' INTO admin FROM public.profiles p WHERE p.id = actor
    AND p.is_active IS DISTINCT FROM false
    AND (p.app_role IN ('super_admin','founder','admin','manager','senior','junior','stage') OR p.role = 'admin');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solo il team interno organizza l’area di un cliente' USING ERRCODE = '42501';
  END IF;
  IF NOT admin AND EXISTS (SELECT 1 FROM public.clients c WHERE c.id = p_client AND c.workspace_hidden IS TRUE) THEN
    RAISE EXCEPTION 'Azienda non disponibile' USING ERRCODE = '42501';
  END IF;
  RETURN actor;
END;
$$;

-- ── 2) Le cartelle che esistono anche vuote ─────────────────────────────────
-- Il percorso resta la verità del file (§398): questa tabella serve solo alle
-- cartelle senza file dentro. L'albero è l'unione delle due cose.
CREATE TABLE IF NOT EXISTS public.portal_material_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id),
  source text NOT NULL CHECK (source IN ('cliente','team')),
  path text NOT NULL,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Stesse regole del percorso di un file (251): niente risalite, niente
  -- segmenti vuoti, al massimo dieci livelli.
  CONSTRAINT portal_material_folders_path CHECK (length(path) BETWEEN 1 AND 400
    AND path !~ '(^/)|(/$)|(//)|(^\.\.?$)|(^\.\.?/)|(/\.\.?/)|(/\.\.?$)'
    AND array_length(string_to_array(path, '/'), 1) <= 10)
);
-- Differibile: spostare un albero dentro il suo padre scambia i percorsi fra
-- righe della stessa operazione, e il controllo va fatto alla fine.
DO $$ BEGIN
  ALTER TABLE public.portal_material_folders ADD CONSTRAINT portal_material_folders_unique
    UNIQUE (client_id, source, path) DEFERRABLE INITIALLY IMMEDIATE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

ALTER TABLE public.portal_material_folders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.portal_material_folders FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.portal_material_folders TO service_role;
GRANT SELECT (id, client_id, source, path, created_by, created_at) ON public.portal_material_folders TO authenticated;
-- Solo lo staff. Il cliente vede le cartelle del suo spazio quando dentro c'è
-- un file, come prima: una cartella vuota creata da noi non gli dice niente.
DROP POLICY IF EXISTS portal_staff_read ON public.portal_material_folders;
CREATE POLICY portal_staff_read ON public.portal_material_folders FOR SELECT TO authenticated
  USING (public.portal_is_staff());

CREATE OR REPLACE FUNCTION public.portal_guard_material_folder()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid;
BEGIN
  actor := public.portal_material_actor(NEW.client_id);
  IF TG_OP = 'INSERT' THEN
    IF NEW.created_by IS DISTINCT FROM actor THEN
      RAISE EXCEPTION 'Una cartella la crea chi la firma' USING ERRCODE = '42501';
    END IF;
  ELSIF (NEW.client_id, NEW.source, NEW.created_by, NEW.created_at)
    IS DISTINCT FROM (OLD.client_id, OLD.source, OLD.created_by, OLD.created_at) THEN
    -- Cambiare spazio vorrebbe dire cambiare chi vede cosa: non è un rinomina.
    RAISE EXCEPTION 'Una cartella cambia nome o posto, non spazio né azienda';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS portal_guard_material_folder ON public.portal_material_folders;
CREATE TRIGGER portal_guard_material_folder BEFORE INSERT OR UPDATE ON public.portal_material_folders
  FOR EACH ROW EXECUTE FUNCTION public.portal_guard_material_folder();
DROP TRIGGER IF EXISTS portal_log_event ON public.portal_material_folders;
CREATE TRIGGER portal_log_event AFTER INSERT OR UPDATE OR DELETE ON public.portal_material_folders
  FOR EACH ROW EXECUTE FUNCTION public.portal_log_event();

-- ── 3) Un file vivo cambia nome e posto; nient'altro ─────────────────────────
-- In produzione questa sezione NON è stata applicata: la 256 era già arrivata e
-- la sua guardia è questa più l'autore che si slega (§419). Rilanciare la 254
-- da sola la riporta indietro: dopo, si rilancia la 256.
-- Riscrive la guardia della 251 con una sola differenza: `name` e `path` escono
-- dalla lista dell'immutabile finché il file non è rimosso. `source` resta
-- dentro: spostare un file dal nostro spazio al suo è una pubblicazione.
CREATE OR REPLACE FUNCTION public.portal_guard_material()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.source = 'team' THEN
      PERFORM public.portal_assert_staff_actor(NEW.uploaded_by);
      IF NEW.project_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.projects p
        WHERE p.id = NEW.project_id AND p.client_id = NEW.client_id AND p.deleted_at IS NULL) THEN
        RAISE EXCEPTION 'Il progetto non è di questa azienda';
      END IF;
    ELSE
      PERFORM public.portal_assert_actor(NEW.uploaded_by, NEW.client_id, NEW.project_id);
    END IF;
    IF NEW.file_id IS NULL OR NEW.deleted_at IS NOT NULL OR NEW.archived_at IS NOT NULL THEN
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
  IF (NEW.client_id, NEW.project_id, NEW.storage_key, NEW.size, NEW.kind,
      NEW.uploaded_by, NEW.activity_id, NEW.idempotency_key, NEW.created_at, NEW.source)
    IS DISTINCT FROM
     (OLD.client_id, OLD.project_id, OLD.storage_key, OLD.size, OLD.kind,
      OLD.uploaded_by, OLD.activity_id, OLD.idempotency_key, OLD.created_at, OLD.source) THEN
    RAISE EXCEPTION 'Un materiale caricato cambia nome o cartella, e si archivia o si rimuove: nient’altro';
  END IF;
  IF OLD.deleted_at IS NOT NULL THEN
    IF (NEW.deleted_at, NEW.deleted_by, NEW.archived_at, NEW.archived_by, NEW.name, NEW.path)
      IS DISTINCT FROM (OLD.deleted_at, OLD.deleted_by, OLD.archived_at, OLD.archived_by, OLD.name, OLD.path)
      OR NEW.file_id IS NOT NULL THEN
      RAISE EXCEPTION 'Un materiale rimosso non torna indietro';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.file_id IS DISTINCT FROM OLD.file_id THEN
    RAISE EXCEPTION 'Un materiale vivo non lascia il suo file';
  END IF;
  IF NEW.name IS DISTINCT FROM OLD.name AND (NEW.name ~ '[/\\[:cntrl:]]'
    OR lower(substring(NEW.name FROM '\.([^.]+)$')) IS DISTINCT FROM lower(substring(OLD.name FROM '\.([^.]+)$'))) THEN
    -- Si rinomina il nome, non il tipo: `logo.png` non diventa `logo.html`.
    RAISE EXCEPTION 'Un file cambia nome, non estensione' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

-- ── 4) Le operazioni ─────────────────────────────────────────────────────────
-- Service role soltanto: le chiamano le rotte `/api/area-cliente/**` dopo la
-- loro guard, e qui dentro si rifà il controllo sull'attore.

-- Il prefisso si confronta con `left()`, mai con LIKE: in un nome di cartella
-- `%` e `_` sono caratteri come gli altri.
CREATE OR REPLACE FUNCTION public.portal_material_under(p_path text, p_prefix text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT p_path = p_prefix OR left(p_path, length(p_prefix) + 1) = p_prefix || '/'
$$;

-- Una cartella da cui si toglie l'ultimo file non sparisce: resta, vuota.
CREATE OR REPLACE FUNCTION public.portal_material_keep_folder(p_client uuid, p_source text, p_path text, p_actor uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_path IS NULL OR p_path = '' THEN RETURN; END IF;
  INSERT INTO public.portal_material_folders(client_id, source, path, created_by)
    SELECT p_client, p_source, p_path, p_actor
    WHERE NOT EXISTS (SELECT 1 FROM public.portal_material_folders f
      WHERE f.client_id = p_client AND f.source = p_source AND f.path = p_path);
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_material_move(p_ids uuid[], p_path text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid; target_client uuid; target_source text; found integer; wanted integer; old_path text; moved integer;
BEGIN
  wanted := (SELECT count(DISTINCT x) FROM unnest(p_ids) x);
  IF wanted = 0 THEN RETURN 0; END IF;
  SELECT count(*), min(client_id::text)::uuid, min(source) INTO found, target_client, target_source
    FROM (SELECT client_id, source FROM public.portal_materials
          WHERE id = ANY(p_ids) AND deleted_at IS NULL FOR UPDATE) rows;
  IF found <> wanted THEN RAISE EXCEPTION 'Qualche file non c’è più: ricarica la pagina' USING ERRCODE = '22023'; END IF;
  IF (SELECT count(DISTINCT (client_id, source)) FROM public.portal_materials WHERE id = ANY(p_ids)) <> 1 THEN
    RAISE EXCEPTION 'Si sposta dentro lo stesso spazio della stessa azienda' USING ERRCODE = '22023';
  END IF;
  actor := public.portal_material_actor(target_client);
  FOR old_path IN SELECT DISTINCT path FROM public.portal_materials WHERE id = ANY(p_ids) AND path IS NOT NULL LOOP
    PERFORM public.portal_material_keep_folder(target_client, target_source, old_path, actor);
  END LOOP;
  UPDATE public.portal_materials SET path = nullif(p_path, '') WHERE id = ANY(p_ids) AND path IS DISTINCT FROM nullif(p_path, '');
  GET DIAGNOSTICS moved = ROW_COUNT;
  RETURN moved;
END;
$$;

-- Rinomina o sposta una cartella: riscrive il prefisso di file e cartelle in
-- una transazione sola. Se la destinazione esiste già, i contenuti si uniscono.
CREATE OR REPLACE FUNCTION public.portal_material_folder_move(p_client uuid, p_source text, p_from text, p_to text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid; moved integer; parent text;
BEGIN
  actor := public.portal_material_actor(p_client);
  IF coalesce(p_from, '') = '' OR coalesce(p_to, '') = '' THEN
    RAISE EXCEPTION 'Cartella non valida' USING ERRCODE = '22023';
  END IF;
  IF p_from = p_to THEN RETURN 0; END IF;
  IF public.portal_material_under(p_to, p_from) THEN
    RAISE EXCEPTION 'Una cartella non va dentro sé stessa' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.portal_materials m WHERE m.client_id = p_client AND m.source = p_source
    AND m.deleted_at IS NULL AND public.portal_material_under(m.path, p_from) FOR UPDATE;
  PERFORM 1 FROM public.portal_material_folders f WHERE f.client_id = p_client AND f.source = p_source
    AND public.portal_material_under(f.path, p_from) FOR UPDATE;

  parent := nullif(array_to_string((string_to_array(p_from, '/'))[1:array_length(string_to_array(p_from, '/'), 1) - 1], '/'), '');
  PERFORM public.portal_material_keep_folder(p_client, p_source, parent, actor);
  PERFORM public.portal_material_keep_folder(p_client, p_source, p_from, actor);

  SET CONSTRAINTS public.portal_material_folders_unique DEFERRED;
  -- Le cartelle che esistono già a destinazione si uniscono: sparisce il doppione.
  DELETE FROM public.portal_material_folders g
    WHERE g.client_id = p_client AND g.source = p_source AND NOT public.portal_material_under(g.path, p_from)
      AND EXISTS (SELECT 1 FROM public.portal_material_folders f
        WHERE f.client_id = p_client AND f.source = p_source AND public.portal_material_under(f.path, p_from)
          AND g.path = p_to || substr(f.path, length(p_from) + 1));
  UPDATE public.portal_material_folders f SET path = p_to || substr(f.path, length(p_from) + 1)
    WHERE f.client_id = p_client AND f.source = p_source AND public.portal_material_under(f.path, p_from);
  UPDATE public.portal_materials m SET path = p_to || substr(m.path, length(p_from) + 1)
    WHERE m.client_id = p_client AND m.source = p_source AND m.deleted_at IS NULL
      AND public.portal_material_under(m.path, p_from);
  GET DIAGNOSTICS moved = ROW_COUNT;
  SET CONSTRAINTS public.portal_material_folders_unique IMMEDIATE;
  RETURN moved;
END;
$$;

-- Si elimina una cartella vuota. Dentro non devono esserci file, nemmeno
-- archiviati: un archiviato è ancora lì, e sparirebbe dalla vista senza che
-- nessuno l'abbia deciso.
CREATE OR REPLACE FUNCTION public.portal_material_folder_delete(p_client uuid, p_source text, p_path text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid; inside integer; removed integer;
BEGIN
  actor := public.portal_material_actor(p_client);
  IF coalesce(p_path, '') = '' THEN RAISE EXCEPTION 'Cartella non valida' USING ERRCODE = '22023'; END IF;
  PERFORM 1 FROM public.portal_material_folders f WHERE f.client_id = p_client AND f.source = p_source
    AND public.portal_material_under(f.path, p_path) FOR UPDATE;
  SELECT count(*) INTO inside FROM public.portal_materials m WHERE m.client_id = p_client AND m.source = p_source
    AND m.deleted_at IS NULL AND public.portal_material_under(m.path, p_path);
  IF inside > 0 THEN
    RAISE EXCEPTION 'Dentro ci sono ancora % file, anche archiviati: spostali o eliminali prima', inside USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.portal_material_folders f WHERE f.client_id = p_client AND f.source = p_source
    AND public.portal_material_under(f.path, p_path);
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$;

-- Archiviare una cartella archivia quello che c'è dentro, ed è reversibile.
CREATE OR REPLACE FUNCTION public.portal_material_folder_archive(p_client uuid, p_source text, p_path text, p_archive boolean)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid; changed integer;
BEGIN
  actor := public.portal_material_actor(p_client);
  IF coalesce(p_path, '') = '' THEN RAISE EXCEPTION 'Cartella non valida' USING ERRCODE = '22023'; END IF;
  IF p_archive THEN
    UPDATE public.portal_materials m SET archived_at = now(), archived_by = actor
      WHERE m.client_id = p_client AND m.source = p_source AND m.deleted_at IS NULL AND m.archived_at IS NULL
        AND public.portal_material_under(m.path, p_path);
  ELSE
    UPDATE public.portal_materials m SET archived_at = NULL, archived_by = NULL
      WHERE m.client_id = p_client AND m.source = p_source AND m.deleted_at IS NULL AND m.archived_at IS NOT NULL
        AND public.portal_material_under(m.path, p_path);
  END IF;
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed;
END;
$$;

-- Rinominare un file: il nome del materiale e quello del metadato dello
-- storage insieme, o nessuno dei due.
CREATE OR REPLACE FUNCTION public.portal_material_rename(p_id uuid, p_name text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target public.portal_materials;
BEGIN
  SELECT * INTO target FROM public.portal_materials WHERE id = p_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'File non trovato' USING ERRCODE = '22023'; END IF;
  PERFORM public.portal_material_actor(target.client_id);
  UPDATE public.portal_materials SET name = btrim(p_name) WHERE id = p_id;
  UPDATE public.files SET name = btrim(p_name) WHERE id = target.file_id;
END;
$$;

-- La quota dell'azienda, sommata nel database: PostgREST taglia a mille righe.
CREATE OR REPLACE FUNCTION public.portal_material_usage(p_client uuid)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(sum(size), 0)::bigint FROM public.portal_materials WHERE client_id = p_client AND deleted_at IS NULL
$$;

REVOKE ALL ON FUNCTION public.portal_material_actor(uuid), public.portal_guard_material_folder(),
  public.portal_material_keep_folder(uuid,text,text,uuid), public.portal_material_move(uuid[],text),
  public.portal_material_folder_move(uuid,text,text,text), public.portal_material_folder_delete(uuid,text,text),
  public.portal_material_folder_archive(uuid,text,text,boolean), public.portal_material_rename(uuid,text),
  public.portal_material_usage(uuid), public.portal_material_under(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_material_move(uuid[],text), public.portal_material_folder_move(uuid,text,text,text),
  public.portal_material_folder_delete(uuid,text,text), public.portal_material_folder_archive(uuid,text,text,boolean),
  public.portal_material_rename(uuid,text), public.portal_material_usage(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
