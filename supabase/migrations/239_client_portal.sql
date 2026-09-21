-- 239 — Primo incremento portale cliente. SCRITTA, NON APPLICATA.
-- Prerequisiti: Project V2 (147/148), documenti (080), workspace_hidden (213), profili (224).
-- Nessun backfill: assegnazione interna e visibilità da template non pubblicano.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS portal_title text,
  ADD COLUMN IF NOT EXISTS portal_objective text,
  ADD COLUMN IF NOT EXISTS portal_scope text,
  ADD COLUMN IF NOT EXISTS portal_update text,
  ADD COLUMN IF NOT EXISTS portal_next_step text,
  ADD COLUMN IF NOT EXISTS portal_contact text,
  ADD COLUMN IF NOT EXISTS portal_target_date date,
  ADD COLUMN IF NOT EXISTS portal_date_kind text NOT NULL DEFAULT 'prevista' CHECK (portal_date_kind IN ('prevista','confermata')),
  ADD COLUMN IF NOT EXISTS portal_phase text CHECK (portal_phase IN ('avvio','lavorazione','verifica','continuativo')),
  ADD COLUMN IF NOT EXISTS portal_published_at timestamptz,
  ADD COLUMN IF NOT EXISTS portal_published_by uuid REFERENCES public.profiles(id);
CREATE UNIQUE INDEX IF NOT EXISTS portal_projects_client_key ON public.projects(id, client_id);

CREATE TABLE IF NOT EXISTS public.portal_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  portal_role text NOT NULL CHECK (portal_role IN ('referente','collaboratore','lettore')),
  project_scope text NOT NULL DEFAULT 'selected' CHECK (project_scope IN ('all','selected')),
  revoked_at timestamptz,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, profile_id), UNIQUE (id, client_id)
);
CREATE INDEX IF NOT EXISTS portal_memberships_profile ON public.portal_memberships(profile_id);

CREATE TABLE IF NOT EXISTS public.portal_project_access (
  membership_id uuid NOT NULL,
  client_id uuid NOT NULL,
  project_id uuid NOT NULL,
  PRIMARY KEY (membership_id, project_id),
  FOREIGN KEY (membership_id, client_id) REFERENCES public.portal_memberships(id, client_id) ON DELETE CASCADE,
  FOREIGN KEY (project_id, client_id) REFERENCES public.projects(id, client_id) ON DELETE CASCADE
);

CREATE OR REPLACE FUNCTION public.portal_is_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
    AND p.is_active IS DISTINCT FROM false
    AND (p.app_role IN ('super_admin','founder','admin','manager','senior','junior','stage') OR p.role = 'admin'));
$$;

CREATE OR REPLACE FUNCTION public.portal_can_preview(p_client uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
    AND p.is_active IS DISTINCT FROM false
    AND (p.app_role IN ('super_admin','founder','admin') OR p.email = 'm.lucci@twobee.it'
      OR (p.app_role = 'manager' AND EXISTS (SELECT 1 FROM public.clients c
        WHERE c.id = p_client AND c.workspace_hidden IS DISTINCT FROM true))));
$$;

-- Nessun parametro user_id: la lettura riguarda esclusivamente auth.uid().
CREATE OR REPLACE FUNCTION public.portal_can_access(p_client uuid, p_project uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.portal_memberships m JOIN public.profiles u ON u.id = m.profile_id
    WHERE m.profile_id = auth.uid() AND m.client_id = p_client AND m.revoked_at IS NULL
      AND u.role IN ('client','guest') AND u.app_role IN ('client','guest') AND u.is_active IS DISTINCT FROM false
      AND (m.project_scope = 'all' OR (p_project IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.portal_project_access a WHERE a.membership_id = m.id AND a.project_id = p_project AND a.client_id = p_client)))
      AND (p_project IS NULL OR EXISTS (SELECT 1 FROM public.projects p
        WHERE p.id = p_project AND p.client_id = p_client AND p.deleted_at IS NULL
          AND p.portal_published_at IS NOT NULL))
  );
$$;

CREATE TABLE IF NOT EXISTS public.portal_deliverable_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  project_id uuid NOT NULL,
  document_id uuid NOT NULL REFERENCES public.documents(id),
  version integer NOT NULL CHECK (version > 0),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 240),
  storage_key text NOT NULL CHECK (length(btrim(storage_key)) > 0),
  author_id uuid NOT NULL REFERENCES public.profiles(id),
  author_name text NOT NULL,
  approval_required boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  published_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (project_id, client_id) REFERENCES public.projects(id, client_id),
  UNIQUE (document_id, version), UNIQUE (id, client_id, project_id),
  CHECK ((published_at IS NULL) = (published_by IS NULL))
);

CREATE TABLE IF NOT EXISTS public.portal_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  project_id uuid NOT NULL,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 240),
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  kind text NOT NULL CHECK (kind IN ('materiale','risposta','approvazione')),
  due_date date,
  contact_name text NOT NULL CHECK (length(btrim(contact_name)) > 0),
  owner_id uuid REFERENCES public.profiles(id),
  status text NOT NULL DEFAULT 'da_fare' CHECK (status IN ('da_fare','in_verifica','completata')),
  version_id uuid,
  published_at timestamptz,
  published_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (project_id, client_id) REFERENCES public.projects(id, client_id),
  FOREIGN KEY (version_id, client_id, project_id) REFERENCES public.portal_deliverable_versions(id, client_id, project_id),
  UNIQUE (id, client_id, project_id), UNIQUE (version_id),
  CHECK ((kind = 'approvazione') = (version_id IS NOT NULL)),
  CHECK ((published_at IS NULL) = (published_by IS NULL))
);

CREATE TABLE IF NOT EXISTS public.portal_activity_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL,
  client_id uuid NOT NULL,
  project_id uuid NOT NULL,
  author_id uuid NOT NULL REFERENCES public.profiles(id),
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 5000),
  idempotency_key uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (activity_id, client_id, project_id) REFERENCES public.portal_activities(id, client_id, project_id),
  UNIQUE (author_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.portal_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL,
  client_id uuid NOT NULL,
  project_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES public.profiles(id),
  outcome text NOT NULL CHECK (outcome IN ('approvata','modifiche_richieste')),
  comment text CHECK (length(comment) <= 5000),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (version_id, client_id, project_id) REFERENCES public.portal_deliverable_versions(id, client_id, project_id),
  UNIQUE (version_id),
  CHECK (outcome <> 'modifiche_richieste' OR length(btrim(comment)) > 0 AND comment IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.portal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id),
  project_id uuid,
  author_id uuid NOT NULL REFERENCES public.profiles(id),
  kind text NOT NULL CHECK (kind IN ('supporto','attivita','bug','audit','report','feedback')),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 160),
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 5000),
  detail text CHECK (length(detail) <= 500),
  status text NOT NULL DEFAULT 'ricevuta' CHECK (status IN ('ricevuta','in_valutazione','in_lavorazione','in_attesa_cliente','risolta','chiusa','annullata','non_accolta','riaperta')),
  status_reason text,
  assigned_to uuid REFERENCES public.profiles(id),
  idempotency_key uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (project_id, client_id) REFERENCES public.projects(id, client_id),
  UNIQUE (id, client_id), UNIQUE (author_id, idempotency_key),
  CHECK (status NOT IN ('annullata','non_accolta','riaperta') OR (status_reason IS NOT NULL AND length(btrim(status_reason)) > 0))
);

CREATE TABLE IF NOT EXISTS public.portal_request_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL,
  client_id uuid NOT NULL,
  author_id uuid NOT NULL REFERENCES public.profiles(id),
  author_name text NOT NULL,
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 5000),
  idempotency_key uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (request_id, client_id) REFERENCES public.portal_requests(id, client_id),
  UNIQUE (author_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.portal_request_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.portal_requests(id),
  author_id uuid NOT NULL REFERENCES public.profiles(id),
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 10000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.portal_request_tasks (
  request_id uuid NOT NULL REFERENCES public.portal_requests(id),
  task_id uuid NOT NULL UNIQUE REFERENCES public.tasks(id),
  linked_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (request_id, task_id)
);

CREATE TABLE IF NOT EXISTS public.portal_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id),
  entity_table text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  actor_id uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS + privilegi chiusi: nessun endpoint browser di scrittura, nemmeno admin.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['portal_memberships','portal_project_access','portal_deliverable_versions',
    'portal_activities','portal_activity_responses','portal_approvals','portal_requests',
    'portal_request_messages','portal_request_notes','portal_request_tasks','portal_events'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    IF t <> 'portal_deliverable_versions' THEN
      EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    END IF;
    EXECUTE format('DROP POLICY IF EXISTS portal_staff_read ON public.%I', t);
    EXECUTE format('CREATE POLICY portal_staff_read ON public.%I FOR SELECT TO authenticated USING (public.portal_is_staff())', t);
  END LOOP;
END $$;
GRANT SELECT (id,client_id,project_id,document_id,version,title,author_id,author_name,
  approval_required,published_at,published_by,created_at) ON public.portal_deliverable_versions TO authenticated;

DROP POLICY IF EXISTS portal_member_self ON public.portal_memberships;
CREATE POLICY portal_member_self ON public.portal_memberships FOR SELECT TO authenticated
  USING (profile_id = auth.uid());
DROP POLICY IF EXISTS portal_project_access_self ON public.portal_project_access;
CREATE POLICY portal_project_access_self ON public.portal_project_access FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.portal_memberships m WHERE m.id = membership_id AND m.profile_id = auth.uid() AND m.revoked_at IS NULL));
DROP POLICY IF EXISTS portal_version_read ON public.portal_deliverable_versions;
CREATE POLICY portal_version_read ON public.portal_deliverable_versions FOR SELECT TO authenticated
  USING (published_at IS NOT NULL AND public.portal_can_access(client_id, project_id));
DROP POLICY IF EXISTS portal_activity_read ON public.portal_activities;
CREATE POLICY portal_activity_read ON public.portal_activities FOR SELECT TO authenticated
  USING (published_at IS NOT NULL AND public.portal_can_access(client_id, project_id)
    AND (version_id IS NULL OR EXISTS (SELECT 1 FROM public.portal_deliverable_versions v WHERE v.id = version_id AND v.published_at IS NOT NULL)));
DROP POLICY IF EXISTS portal_response_read ON public.portal_activity_responses;
CREATE POLICY portal_response_read ON public.portal_activity_responses FOR SELECT TO authenticated
  USING (public.portal_can_access(client_id, project_id)
    AND EXISTS (SELECT 1 FROM public.portal_activities a WHERE a.id = activity_id AND a.published_at IS NOT NULL));
DROP POLICY IF EXISTS portal_approval_read ON public.portal_approvals;
CREATE POLICY portal_approval_read ON public.portal_approvals FOR SELECT TO authenticated
  USING (public.portal_can_access(client_id, project_id)
    AND EXISTS (SELECT 1 FROM public.portal_deliverable_versions v WHERE v.id = version_id AND v.published_at IS NOT NULL));
DROP POLICY IF EXISTS portal_request_read ON public.portal_requests;
CREATE POLICY portal_request_read ON public.portal_requests FOR SELECT TO authenticated
  USING (public.portal_can_access(client_id, project_id));
DROP POLICY IF EXISTS portal_message_read ON public.portal_request_messages;
CREATE POLICY portal_message_read ON public.portal_request_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.portal_requests r WHERE r.id = request_id
    AND public.portal_can_access(r.client_id, r.project_id)));

CREATE OR REPLACE VIEW public.portal_companies WITH (security_barrier = true) AS
  SELECT c.id, coalesce(nullif(c.display_name,''), c.company_name) AS name
  FROM public.clients c
  WHERE public.portal_can_preview(c.id) OR EXISTS (
    SELECT 1 FROM public.portal_memberships m JOIN public.profiles p ON p.id = m.profile_id
    WHERE m.client_id = c.id AND m.profile_id = auth.uid() AND m.revoked_at IS NULL
      AND p.is_active IS DISTINCT FROM false AND p.role IN ('client','guest') AND p.app_role IN ('client','guest'));

CREATE OR REPLACE VIEW public.portal_projects WITH (security_barrier = true) AS
  SELECT p.id, p.client_id, p.portal_title AS title, p.area, p.status,
    p.portal_objective AS objective, p.portal_scope AS scope, p.portal_update AS update,
    p.portal_next_step AS next_step, p.portal_contact AS contact,
    p.portal_published_at AS published_at, p.portal_target_date AS target_date,
    p.portal_date_kind AS date_kind, p.portal_phase AS phase
  FROM public.projects p
  WHERE p.portal_published_at IS NOT NULL AND p.deleted_at IS NULL
    AND (public.portal_can_preview(p.client_id) OR public.portal_can_access(p.client_id, p.id));
REVOKE ALL ON public.portal_companies, public.portal_projects FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.portal_companies, public.portal_projects TO authenticated, service_role;

-- Una VIEW non chiude l'accesso alla tabella originale. Restrictive si combina
-- in AND con le vecchie policy permissive, senza cambiare il perimetro staff.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['clients','projects','project_workstreams','milestones','tasks',
    'documents','task_comments','client_kpis','client_contacts','chat_channels','chat_messages'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS portal_raw_staff_only ON public.%I', t);
    EXECUTE format('CREATE POLICY portal_raw_staff_only ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (public.get_my_role() IN (''admin'',''team''))', t);
  END LOOP;
END $$;

-- Queste funzioni di controllo non sono RPC pubbliche: sono usate dai trigger.
CREATE OR REPLACE FUNCTION public.portal_assert_actor(p_actor uuid, p_client uuid, p_project uuid, p_approval boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.portal_memberships m JOIN public.profiles u ON u.id = m.profile_id
    WHERE m.profile_id = p_actor AND m.client_id = p_client AND m.revoked_at IS NULL
      AND u.role IN ('client','guest') AND u.app_role IN ('client','guest') AND u.is_active IS DISTINCT FROM false
      AND m.portal_role IN ('referente','collaboratore') AND (NOT p_approval OR m.portal_role = 'referente')
      AND (m.project_scope = 'all' OR (p_project IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.portal_project_access a WHERE a.membership_id = m.id AND a.project_id = p_project)))
      AND (p_project IS NULL OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = p_project
        AND p.client_id = p_client AND p.deleted_at IS NULL AND p.portal_published_at IS NOT NULL))
  ) THEN RAISE EXCEPTION 'Accesso portale non autorizzato' USING ERRCODE = '42501'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_guard_project_publication()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.portal_published_at IS NOT NULL AND (NEW.portal_published_by IS NULL
    OR NEW.portal_title IS NULL OR length(btrim(NEW.portal_title)) = 0 OR NEW.client_id IS NULL) THEN
    RAISE EXCEPTION 'La pubblicazione richiede titolo pubblico, azienda e autore';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.portal_published_at IS NOT NULL AND NEW.portal_published_at IS NOT NULL
    AND (to_jsonb(NEW) - ARRAY['updated_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['updated_at'])
    AND (NEW.portal_title,NEW.portal_objective,NEW.portal_scope,NEW.portal_update,NEW.portal_next_step,
      NEW.portal_contact,NEW.portal_target_date,NEW.portal_date_kind,NEW.portal_phase)
      IS DISTINCT FROM
      (OLD.portal_title,OLD.portal_objective,OLD.portal_scope,OLD.portal_update,OLD.portal_next_step,
      OLD.portal_contact,OLD.portal_target_date,OLD.portal_date_kind,OLD.portal_phase)
    AND NEW.portal_published_at IS NOT DISTINCT FROM OLD.portal_published_at THEN
    RAISE EXCEPTION 'I contenuti condivisi richiedono una nuova pubblicazione esplicita';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS portal_guard_publication ON public.projects;
CREATE TRIGGER portal_guard_publication BEFORE INSERT OR UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.portal_guard_project_publication();

CREATE OR REPLACE FUNCTION public.portal_guard_version()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.published_at IS NOT NULL THEN RAISE EXCEPTION 'Una versione pubblicata è immutabile'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.published_at IS NOT NULL AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Una versione pubblicata è immutabile: crea una nuova versione';
  END IF;
  PERFORM 1 FROM public.documents WHERE id = NEW.document_id FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM public.documents d WHERE d.id = NEW.document_id
    AND d.client_id = NEW.client_id AND d.project_id = NEW.project_id) THEN
    RAISE EXCEPTION 'Documento e versione appartengono a contesti diversi';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS portal_guard_version ON public.portal_deliverable_versions;
CREATE TRIGGER portal_guard_version BEFORE INSERT OR UPDATE OR DELETE ON public.portal_deliverable_versions
  FOR EACH ROW EXECUTE FUNCTION public.portal_guard_version();

CREATE OR REPLACE FUNCTION public.portal_request_version_review()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.published_at IS NOT NULL AND NEW.approval_required THEN
    INSERT INTO public.portal_activities(client_id,project_id,title,reason,kind,contact_name,owner_id,
      version_id,published_at,published_by)
    SELECT NEW.client_id, NEW.project_id, left('Rivedi: ' || NEW.title, 240),
      'Verifica questa versione e indica se approvarla o richiedere modifiche.',
      'approvazione', coalesce(nullif(p.portal_contact,''), NEW.author_name), p.manager_id,
      NEW.id, NEW.published_at, NEW.published_by
    FROM public.projects p WHERE p.id = NEW.project_id
    ON CONFLICT (version_id) DO NOTHING;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS portal_request_version_review ON public.portal_deliverable_versions;
CREATE TRIGGER portal_request_version_review AFTER INSERT OR UPDATE ON public.portal_deliverable_versions
  FOR EACH ROW EXECUTE FUNCTION public.portal_request_version_review();

CREATE OR REPLACE FUNCTION public.portal_guard_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.portal_deliverable_versions;
BEGIN
  PERFORM public.portal_assert_actor(NEW.actor_id, NEW.client_id, NEW.project_id, true);
  -- Il lock si condivide con chi pubblica la nuova versione del documento.
  SELECT * INTO v FROM public.portal_deliverable_versions WHERE id = NEW.version_id;
  PERFORM 1 FROM public.documents WHERE id = v.document_id FOR UPDATE;
  IF v.published_at IS NULL OR NOT v.approval_required OR NOT EXISTS (
    SELECT 1 FROM public.portal_activities a WHERE a.version_id = NEW.version_id AND a.published_at IS NOT NULL)
    OR EXISTS (SELECT 1 FROM public.portal_deliverable_versions n WHERE n.document_id = v.document_id
      AND n.version > v.version AND n.published_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Approvazione non richiesta o versione superata';
  END IF;
  NEW.created_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS portal_guard_approval ON public.portal_approvals;
CREATE TRIGGER portal_guard_approval BEFORE INSERT ON public.portal_approvals
  FOR EACH ROW EXECUTE FUNCTION public.portal_guard_approval();

CREATE OR REPLACE FUNCTION public.portal_record_approval_result()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.portal_activities
    SET status = CASE WHEN NEW.outcome = 'approvata' THEN 'completata' ELSE 'in_verifica' END
    WHERE version_id = NEW.version_id;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS portal_record_approval_result ON public.portal_approvals;
CREATE TRIGGER portal_record_approval_result AFTER INSERT ON public.portal_approvals
  FOR EACH ROW EXECUTE FUNCTION public.portal_record_approval_result();

CREATE OR REPLACE FUNCTION public.portal_guard_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.client_id,NEW.project_id,NEW.version_id,NEW.kind)
    IS DISTINCT FROM (OLD.client_id,OLD.project_id,OLD.version_id,OLD.kind) THEN
    RAISE EXCEPTION 'Il contesto dell’attività è immutabile';
  END IF;
  IF NEW.version_id IS NOT NULL AND NEW.published_at IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.portal_deliverable_versions v WHERE v.id = NEW.version_id AND v.published_at IS NOT NULL AND v.approval_required
  ) THEN RAISE EXCEPTION 'La versione deve essere pubblicata e richiedere approvazione'; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS portal_guard_activity ON public.portal_activities;
CREATE TRIGGER portal_guard_activity BEFORE INSERT OR UPDATE ON public.portal_activities
  FOR EACH ROW EXECUTE FUNCTION public.portal_guard_activity();

CREATE OR REPLACE FUNCTION public.portal_guard_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.portal_assert_actor(NEW.author_id, NEW.client_id, NEW.project_id);
    NEW.status := CASE WHEN NEW.kind = 'attivita' THEN 'in_valutazione' ELSE 'ricevuta' END;
    SELECT p.manager_id INTO NEW.assigned_to FROM public.projects p WHERE p.id = NEW.project_id;
  ELSIF (NEW.client_id,NEW.project_id,NEW.author_id,NEW.idempotency_key)
    IS DISTINCT FROM (OLD.client_id,OLD.project_id,OLD.author_id,OLD.idempotency_key) THEN
    RAISE EXCEPTION 'Il contesto della richiesta è immutabile';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status IN ('ricevuta','riaperta') AND NEW.status IN ('in_valutazione','annullata')) OR
    (OLD.status = 'in_valutazione' AND NEW.status IN ('in_lavorazione','in_attesa_cliente','non_accolta','annullata')) OR
    (OLD.status = 'in_lavorazione' AND NEW.status IN ('in_attesa_cliente','risolta','annullata')) OR
    (OLD.status = 'in_attesa_cliente' AND NEW.status IN ('in_valutazione','in_lavorazione','annullata')) OR
    (OLD.status = 'risolta' AND NEW.status IN ('chiusa','riaperta')) OR
    (OLD.status IN ('chiusa','non_accolta','annullata') AND NEW.status = 'riaperta')
  ) THEN RAISE EXCEPTION 'Transizione richiesta non ammessa'; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS portal_guard_request ON public.portal_requests;
CREATE TRIGGER portal_guard_request BEFORE INSERT OR UPDATE ON public.portal_requests
  FOR EACH ROW EXECUTE FUNCTION public.portal_guard_request();

CREATE OR REPLACE FUNCTION public.portal_guard_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.portal_requests;
BEGIN
  SELECT * INTO r FROM public.portal_requests WHERE id = NEW.request_id;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = NEW.author_id
    AND p.is_active IS DISTINCT FROM false
    AND (p.role = 'admin' OR p.app_role IN ('manager','senior','junior','stage','super_admin','founder','admin'))) THEN
    PERFORM public.portal_assert_actor(NEW.author_id, r.client_id, r.project_id);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS portal_guard_message ON public.portal_request_messages;
CREATE TRIGGER portal_guard_message BEFORE INSERT ON public.portal_request_messages
  FOR EACH ROW EXECUTE FUNCTION public.portal_guard_message();

CREATE OR REPLACE FUNCTION public.portal_guard_response()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.portal_assert_actor(NEW.author_id, NEW.client_id, NEW.project_id);
  IF NOT EXISTS (SELECT 1 FROM public.portal_activities a WHERE a.id = NEW.activity_id
    AND a.client_id = NEW.client_id AND a.project_id = NEW.project_id
    AND a.published_at IS NOT NULL AND a.kind <> 'approvazione' AND a.status <> 'completata') THEN
    RAISE EXCEPTION 'Attività non disponibile per una risposta';
  END IF;
  UPDATE public.portal_activities SET status = 'in_verifica' WHERE id = NEW.activity_id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS portal_guard_response ON public.portal_activity_responses;
CREATE TRIGGER portal_guard_response BEFORE INSERT ON public.portal_activity_responses
  FOR EACH ROW EXECUTE FUNCTION public.portal_guard_response();

CREATE OR REPLACE FUNCTION public.portal_guard_task_link()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.portal_requests r JOIN public.tasks t ON t.id = NEW.task_id
    WHERE r.id = NEW.request_id AND t.client_id = r.client_id
      AND (r.project_id IS NULL OR t.project_id = r.project_id)) THEN
    RAISE EXCEPTION 'Task e richiesta appartengono a contesti diversi';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS portal_guard_task_link ON public.portal_request_tasks;
CREATE TRIGGER portal_guard_task_link BEFORE INSERT OR UPDATE ON public.portal_request_tasks
  FOR EACH ROW EXECUTE FUNCTION public.portal_guard_task_link();

CREATE OR REPLACE FUNCTION public.portal_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'Il record di cronologia è immutabile'; END;
$$;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['portal_approvals','portal_events','portal_activity_responses','portal_request_messages','portal_request_notes'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS portal_immutable ON public.%I', t);
    EXECUTE format('CREATE TRIGGER portal_immutable BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.portal_immutable()', t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.portal_log_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE row_data jsonb; actor uuid; client uuid; entity uuid;
BEGIN
  row_data := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  actor := coalesce(auth.uid(), (nullif(current_setting('request.headers', true),'')::jsonb->>'x-actor-id')::uuid);
  IF actor IS NULL THEN RAISE EXCEPTION 'La scrittura portale richiede un autore verificato (x-actor-id)'; END IF;
  client := (row_data->>'client_id')::uuid;
  entity := coalesce(row_data->>'id', row_data->>'request_id', row_data->>'membership_id')::uuid;
  IF client IS NULL AND row_data ? 'request_id' THEN
    SELECT r.client_id INTO client FROM public.portal_requests r WHERE r.id = (row_data->>'request_id')::uuid;
  END IF;
  INSERT INTO public.portal_events(client_id, entity_table, entity_id, action, actor_id)
    VALUES (client, TG_TABLE_NAME, entity, lower(TG_OP), actor);
  RETURN NULL;
END;
$$;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['portal_memberships','portal_project_access','portal_deliverable_versions',
    'portal_activities','portal_activity_responses','portal_approvals','portal_requests',
    'portal_request_messages','portal_request_notes','portal_request_tasks'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS portal_log_event ON public.%I', t);
    EXECUTE format('CREATE TRIGGER portal_log_event AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.portal_log_event()', t);
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS portal_requests_client ON public.portal_requests(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS portal_activities_client ON public.portal_activities(client_id, due_date);
CREATE INDEX IF NOT EXISTS portal_versions_project ON public.portal_deliverable_versions(project_id, published_at DESC);
CREATE INDEX IF NOT EXISTS portal_messages_request ON public.portal_request_messages(request_id, created_at);
CREATE INDEX IF NOT EXISTS portal_events_client ON public.portal_events(client_id, created_at DESC);

REVOKE ALL ON FUNCTION public.portal_is_staff(), public.portal_can_preview(uuid), public.portal_can_access(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portal_is_staff(), public.portal_can_preview(uuid), public.portal_can_access(uuid,uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.portal_assert_actor(uuid,uuid,uuid,boolean), public.portal_guard_project_publication(),
  public.portal_guard_version(), public.portal_guard_approval(), public.portal_guard_request(), public.portal_guard_response(),
  public.portal_guard_task_link(), public.portal_immutable(), public.portal_log_event(), public.portal_request_version_review(),
  public.portal_guard_activity(), public.portal_guard_message(), public.portal_record_approval_result() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
