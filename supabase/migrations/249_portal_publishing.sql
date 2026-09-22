-- 249 — Pubblicazione dei contenuti nel portale cliente (§395, step 2 del PDF §14).
-- Applicata in produzione come `20260922084609`, quando il file era numerato 247.
-- Prerequisiti: 244 (portale), 246 (isolamento storage), 158 (task al cliente).
-- Additiva e rilanciabile. NESSUN backfill: niente diventa pubblico da solo.
BEGIN;
SET LOCAL lock_timeout = '5s';

-- ── 1) Attività cliente: la task è la fonte, il progetto è facoltativo ────────
-- Una task `task_type='cliente'` non può avere un progetto (CHECK della 158):
-- pretenderlo qui vorrebbe dire reinserirla a mano. Quindi l'attività può
-- vivere sull'azienda. `portal_can_access(client, NULL)` esige già
-- `project_scope='all'`: le aziendali le vede solo chi ha tutta l'azienda.
ALTER TABLE public.portal_activities
  ALTER COLUMN project_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS source_task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL;
ALTER TABLE public.portal_activity_responses ALTER COLUMN project_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS portal_activities_source_task
  ON public.portal_activities(source_task_id) WHERE source_task_id IS NOT NULL;

DO $$ BEGIN
  -- La FK composta (project_id, client_id) è MATCH SIMPLE: con il progetto
  -- nullo non vincola più niente, e l'azienda resterebbe senza controllo.
  BEGIN
    ALTER TABLE public.portal_activities
      ADD CONSTRAINT portal_activities_client_fk FOREIGN KEY (client_id) REFERENCES public.clients(id);
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER TABLE public.portal_activities
      ADD CONSTRAINT portal_activities_project_required
      CHECK (project_id IS NOT NULL OR (kind <> 'approvazione' AND version_id IS NULL));
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER TABLE public.portal_activity_responses
      ADD CONSTRAINT portal_responses_client_fk FOREIGN KEY (client_id) REFERENCES public.clients(id);
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- ── 2) Consegne: la versione punta a un file vero, non a un link legacy ──────
-- `documents` è un elenco di collegamenti Drive: un link esterno non è una
-- versione immutabile e non si scarica dal portale. La consegna raggruppa le
-- versioni; il binario sta in MinIO ed è già presidiato dalla 246.
CREATE TABLE IF NOT EXISTS public.portal_deliverables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id),
  project_id uuid NOT NULL,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 240),
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (project_id, client_id) REFERENCES public.projects(id, client_id) ON DELETE CASCADE,
  UNIQUE (id, client_id, project_id)
);
CREATE INDEX IF NOT EXISTS portal_deliverables_project ON public.portal_deliverables(project_id, created_at DESC);

ALTER TABLE public.portal_deliverable_versions
  ALTER COLUMN document_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS deliverable_id uuid,
  ADD COLUMN IF NOT EXISTS file_id uuid REFERENCES public.files(id),
  -- Una versione pubblicata è immutabile, ma un file sbagliato deve poter
  -- sparire senza ritirare l'intero progetto. Il ritiro è l'unica modifica
  -- ammessa dopo la pubblicazione, e resta scritto con data e autore.
  ADD COLUMN IF NOT EXISTS retired_at timestamptz,
  ADD COLUMN IF NOT EXISTS retired_by uuid REFERENCES public.profiles(id);

DO $$ BEGIN
  BEGIN
    ALTER TABLE public.portal_deliverable_versions
      ADD CONSTRAINT portal_version_deliverable
      FOREIGN KEY (deliverable_id, client_id, project_id)
      REFERENCES public.portal_deliverables(id, client_id, project_id);
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER TABLE public.portal_deliverable_versions
      ADD CONSTRAINT portal_version_source CHECK ((deliverable_id IS NULL) = (file_id IS NULL));
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER TABLE public.portal_deliverable_versions
      ADD CONSTRAINT portal_version_has_source CHECK (deliverable_id IS NOT NULL OR document_id IS NOT NULL);
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER TABLE public.portal_deliverable_versions
      ADD CONSTRAINT portal_version_retired CHECK ((retired_at IS NULL) = (retired_by IS NULL)
        AND (retired_at IS NULL OR published_at IS NOT NULL));
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS portal_versions_deliverable_key
  ON public.portal_deliverable_versions(deliverable_id, version) WHERE deliverable_id IS NOT NULL;

ALTER TABLE public.portal_deliverables ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.portal_deliverables FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.portal_deliverables TO authenticated;
GRANT ALL ON public.portal_deliverables TO service_role;
DROP POLICY IF EXISTS portal_staff_read ON public.portal_deliverables;
CREATE POLICY portal_staff_read ON public.portal_deliverables FOR SELECT TO authenticated
  USING (public.portal_is_staff());
DROP POLICY IF EXISTS portal_version_read ON public.portal_deliverable_versions;
CREATE POLICY portal_version_read ON public.portal_deliverable_versions FOR SELECT TO authenticated
  USING (published_at IS NOT NULL AND retired_at IS NULL AND public.portal_can_access(client_id, project_id));
DROP POLICY IF EXISTS portal_activity_read ON public.portal_activities;
CREATE POLICY portal_activity_read ON public.portal_activities FOR SELECT TO authenticated
  USING (published_at IS NOT NULL AND public.portal_can_access(client_id, project_id)
    AND (version_id IS NULL OR EXISTS (SELECT 1 FROM public.portal_deliverable_versions v
      WHERE v.id = version_id AND v.published_at IS NOT NULL AND v.retired_at IS NULL)));
DROP POLICY IF EXISTS portal_deliverable_read ON public.portal_deliverables;
CREATE POLICY portal_deliverable_read ON public.portal_deliverables FOR SELECT TO authenticated
  USING (public.portal_can_access(client_id, project_id) AND EXISTS (
    SELECT 1 FROM public.portal_deliverable_versions v
    WHERE v.deliverable_id = portal_deliverables.id AND v.published_at IS NOT NULL AND v.retired_at IS NULL));

-- `storage_key` e `file_id` restano fuori: il browser del cliente non deve
-- conoscere la chiave dell'oggetto, il download passa dal backend.
-- `retired_at` è concessa perché la policy delle attività la interroga in
-- sottoquery: per il cliente vale sempre NULL, le righe ritirate non le vede.
GRANT SELECT (id,client_id,project_id,document_id,deliverable_id,version,title,author_id,author_name,
  approval_required,published_at,published_by,retired_at,created_at) ON public.portal_deliverable_versions TO authenticated;

-- ── 3) Cronologia: una propagazione ha un autore, e non blocca il lavoro ─────
-- `portal_log_event` pretende un attore e solleva se manca. Dentro un UPDATE su
-- `tasks` bloccherebbe scritture interne che oggi passano (cron, ricorrenti):
-- la sincronizzazione dichiara il proprio autore in un GUC di transazione.
CREATE OR REPLACE FUNCTION public.portal_log_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE row_data jsonb; actor uuid; sync uuid; client uuid; entity uuid;
BEGIN
  row_data := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  sync := nullif(current_setting('portal.sync_actor', true), '')::uuid;
  actor := coalesce(auth.uid(), (nullif(current_setting('request.headers', true),'')::jsonb->>'x-actor-id')::uuid, sync);
  IF actor IS NULL THEN RAISE EXCEPTION 'La scrittura portale richiede un autore verificato (x-actor-id)'; END IF;
  client := (row_data->>'client_id')::uuid;
  entity := coalesce(row_data->>'id', row_data->>'request_id', row_data->>'membership_id')::uuid;
  IF client IS NULL AND row_data ? 'request_id' THEN
    SELECT r.client_id INTO client FROM public.portal_requests r WHERE r.id = (row_data->>'request_id')::uuid;
  END IF;
  INSERT INTO public.portal_events(client_id, entity_table, entity_id, action, actor_id)
    VALUES (client, TG_TABLE_NAME, entity, CASE WHEN sync IS NOT NULL THEN 'sync' ELSE lower(TG_OP) END, actor);
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS portal_log_event ON public.portal_deliverables;
CREATE TRIGGER portal_log_event AFTER INSERT OR UPDATE OR DELETE ON public.portal_deliverables
  FOR EACH ROW EXECUTE FUNCTION public.portal_log_event();

-- ── 4) Il contesto dell'attività resta immutabile, sorgente compresa ─────────
CREATE OR REPLACE FUNCTION public.portal_guard_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.client_id,NEW.project_id,NEW.version_id,NEW.kind,NEW.source_task_id)
    IS DISTINCT FROM (OLD.client_id,OLD.project_id,OLD.version_id,OLD.kind,OLD.source_task_id) THEN
    RAISE EXCEPTION 'Il contesto dell’attività è immutabile';
  END IF;
  IF NEW.source_task_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.tasks t WHERE t.id = NEW.source_task_id
      AND t.task_type = 'cliente' AND t.client_id = NEW.client_id
  ) THEN RAISE EXCEPTION 'L’attività può nascere solo da una task al cliente della stessa azienda'; END IF;
  IF NEW.version_id IS NOT NULL AND NEW.published_at IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.portal_deliverable_versions v WHERE v.id = NEW.version_id AND v.published_at IS NOT NULL AND v.approval_required
  ) THEN RAISE EXCEPTION 'La versione deve essere pubblicata e richiedere approvazione'; END IF;
  RETURN NEW;
END;
$$;

-- ── 5) Sincronizzazione: solo i campi condivisi, mai il contesto ─────────────
-- Il team aggiorna la task; il cliente vede il testo aggiornato. Il perché non
-- si inventa: se la descrizione si svuota, resta quella pubblicata.
CREATE OR REPLACE FUNCTION public.portal_sync_task_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.portal_activities; sync uuid;
BEGIN
  SELECT * INTO a FROM public.portal_activities WHERE source_task_id = NEW.id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  sync := coalesce(a.published_by, a.owner_id, NEW.created_by);
  IF sync IS NOT NULL THEN PERFORM set_config('portal.sync_actor', sync::text, true); END IF;
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    -- Eliminare la task ritira l'attività: non la cancella, così resta la storia.
    UPDATE public.portal_activities SET published_at = NULL, published_by = NULL WHERE id = a.id;
    PERFORM set_config('portal.sync_actor', '', true);
    RETURN NULL;
  END IF;
  UPDATE public.portal_activities SET
    title = CASE WHEN length(btrim(NEW.title)) > 0 THEN left(btrim(NEW.title), 240) ELSE a.title END,
    reason = CASE WHEN length(btrim(coalesce(NEW.description,''))) > 0 THEN NEW.description ELSE a.reason END,
    due_date = NEW.due_date,
    status = CASE
      WHEN a.kind = 'approvazione' THEN a.status
      WHEN NEW.status = 'completato' THEN 'completata'
      WHEN OLD.status = 'completato' AND NEW.status <> 'completato' THEN 'da_fare'
      ELSE a.status END
  WHERE id = a.id;
  -- Il GUC vale per questa propagazione, non per il resto della transazione.
  PERFORM set_config('portal.sync_actor', '', true);
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS portal_sync_task_activity ON public.tasks;
CREATE TRIGGER portal_sync_task_activity AFTER UPDATE ON public.tasks
  FOR EACH ROW WHEN (
    OLD.title IS DISTINCT FROM NEW.title OR OLD.description IS DISTINCT FROM NEW.description
    OR OLD.due_date IS DISTINCT FROM NEW.due_date OR OLD.status IS DISTINCT FROM NEW.status
    OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at)
  EXECUTE FUNCTION public.portal_sync_task_activity();

-- ── 6) Risposta del cliente: confronto col progetto nullo, e ritorno al team ─
CREATE OR REPLACE FUNCTION public.portal_guard_response()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.portal_activities;
BEGIN
  PERFORM public.portal_assert_actor(NEW.author_id, NEW.client_id, NEW.project_id);
  SELECT * INTO a FROM public.portal_activities WHERE id = NEW.activity_id
    AND client_id = NEW.client_id AND project_id IS NOT DISTINCT FROM NEW.project_id
    AND published_at IS NOT NULL AND kind <> 'approvazione' AND status <> 'completata';
  IF NOT FOUND THEN RAISE EXCEPTION 'Attività non disponibile per una risposta'; END IF;
  UPDATE public.portal_activities SET status = 'in_verifica' WHERE id = a.id;
  -- Il materiale è arrivato: la task interna torna al team, non si chiude.
  IF a.source_task_id IS NOT NULL THEN
    UPDATE public.tasks SET status = 'in_review'
      WHERE id = a.source_task_id AND status NOT IN ('in_review','completato') AND deleted_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- ── 7) Versione: il file è quello del progetto, la consegna è il raggruppamento
CREATE OR REPLACE FUNCTION public.portal_guard_version()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.published_at IS NOT NULL THEN RAISE EXCEPTION 'Una versione pubblicata è immutabile'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.published_at IS NOT NULL AND NEW IS DISTINCT FROM OLD THEN
    IF OLD.retired_at IS NOT NULL OR NEW.retired_at IS NULL
      OR (to_jsonb(NEW) - ARRAY['retired_at','retired_by']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['retired_at','retired_by']) THEN
      RAISE EXCEPTION 'Una versione pubblicata è immutabile: puoi solo ritirarla o pubblicarne una nuova';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.deliverable_id IS NOT NULL THEN
    -- Il lock si condivide con chi approva la versione precedente.
    PERFORM 1 FROM public.portal_deliverables WHERE id = NEW.deliverable_id FOR UPDATE;
    IF NOT EXISTS (SELECT 1 FROM public.portal_deliverables d WHERE d.id = NEW.deliverable_id
      AND d.client_id = NEW.client_id AND d.project_id = NEW.project_id) THEN
      RAISE EXCEPTION 'Consegna e versione appartengono a contesti diversi';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.files f WHERE f.id = NEW.file_id
      AND f.object_key = NEW.storage_key AND f.folder = 'deliverables'
      AND f.entity_type = 'project' AND f.entity_id = NEW.project_id) THEN
      RAISE EXCEPTION 'Il file non appartiene alle consegne di questo progetto';
    END IF;
    RETURN NEW;
  END IF;
  PERFORM 1 FROM public.documents WHERE id = NEW.document_id FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM public.documents d WHERE d.id = NEW.document_id
    AND d.client_id = NEW.client_id AND d.project_id = NEW.project_id) THEN
    RAISE EXCEPTION 'Documento e versione appartengono a contesti diversi';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_guard_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.portal_deliverable_versions;
BEGIN
  PERFORM public.portal_assert_actor(NEW.actor_id, NEW.client_id, NEW.project_id, true);
  -- Il lock si condivide con chi pubblica la versione successiva della consegna.
  SELECT * INTO v FROM public.portal_deliverable_versions WHERE id = NEW.version_id;
  IF v.deliverable_id IS NOT NULL THEN
    PERFORM 1 FROM public.portal_deliverables WHERE id = v.deliverable_id FOR UPDATE;
  ELSE
    PERFORM 1 FROM public.documents WHERE id = v.document_id FOR UPDATE;
  END IF;
  IF v.published_at IS NULL OR v.retired_at IS NOT NULL OR NOT v.approval_required OR NOT EXISTS (
    SELECT 1 FROM public.portal_activities a WHERE a.version_id = NEW.version_id AND a.published_at IS NOT NULL)
    OR EXISTS (SELECT 1 FROM public.portal_deliverable_versions n
      WHERE ((v.deliverable_id IS NOT NULL AND n.deliverable_id = v.deliverable_id)
          OR (v.deliverable_id IS NULL AND n.document_id = v.document_id))
        AND n.version > v.version AND n.published_at IS NOT NULL AND n.retired_at IS NULL) THEN
    RAISE EXCEPTION 'Approvazione non richiesta o versione superata';
  END IF;
  NEW.created_at := now();
  RETURN NEW;
END;
$$;

-- ── 8) Storage: una cartella per le consegne, sempre legata a un progetto ────
-- L'elenco delle cartelle sta dentro la funzione della 246: si riscrive tutta.
CREATE OR REPLACE FUNCTION public.storage_context_access(p_folder text,p_entity_type text,p_entity_id uuid,p_write boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE admin boolean;
BEGIN
  IF NOT public.storage_is_staff(p_write) OR p_folder IS NULL
    OR p_folder NOT IN ('clients','payslips','personal','best_ideas','chat','knowledge','feedback','misc','deliverables') THEN RETURN false; END IF;
  admin := public.get_my_role()='admin';
  IF (p_entity_type IS NULL) <> (p_entity_id IS NULL) THEN RETURN false; END IF;
  IF p_folder='clients' AND p_entity_type IS DISTINCT FROM 'client' THEN RETURN false; END IF;
  IF p_folder='feedback' AND p_entity_type IS DISTINCT FROM 'feedback' THEN RETURN false; END IF;
  IF p_folder='deliverables' AND p_entity_type IS DISTINCT FROM 'project' THEN RETURN false; END IF;
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

REVOKE ALL ON FUNCTION public.portal_sync_task_activity(), public.portal_log_event(), public.portal_guard_activity(),
  public.portal_guard_response(), public.portal_guard_version(), public.portal_guard_approval() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
