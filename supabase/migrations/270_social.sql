-- 270 — Social: il calendario dei contenuti (§467)
--
-- Il lavoro social stava dentro task e milestone generiche: «Sviluppo PED
-- Novembre», «Shooting PED», «Approvazione PED Ottobre». Il piano editoriale
-- era un nome di task, e i post non esistevano da nessuna parte — nessuno
-- poteva rispondere a «cosa esce giovedì per Fatima Leo?» senza aprire un file.
--
-- Qui nasce il **contenuto**: una riga per post, con data (e ora, se c'è),
-- canali, formato, testo, creatività e stato. Il mese è un raggruppamento, non
-- un'entità: il PED di novembre sono i contenuti di novembre.
--
-- Scelte:
--   · una riga per contenuto, `channels text[]`: un reel su IG e TikTok è un
--     lavoro solo, con un testo, una creatività e uno stato. Una riga per
--     canale duplicherebbe tutto e spezzerebbe lo stato. I link, invece, sono
--     uno per canale: stanno in `social_content_links`.
--   · data + ora **da muro**, ora di Roma: `planned_date date` e `planned_time
--     time`. Un `timestamptz` mette il post delle 00:30 nel giorno prima a chi
--     legge in UTC, e la griglia è a giorni.
--   · il progetto deve essere social (`service_type='social_media_management'`)
--     e dello stesso cliente: lo dice la FK composta e lo ricontrolla il trigger.
--   · nessuna scrittura dal browser: si scrive dalle server action col client
--     dell'attore, e la cronologia sa chi è stato.
--   · il portale cliente non c'è ancora: arriva con una migration a parte, con
--     pubblicazione esplicita. Qui nessuna colonna `portal_*`.
--
-- Prerequisiti: 147/148 (progetti, `get_my_v2_project_ids`,
-- `is_external_resource`), 246 (`files`), 263 (`log_activity` a 12 etichette).
-- Rilanciabile: `IF NOT EXISTS`, `CREATE OR REPLACE`, `ON CONFLICT`.

BEGIN;
SET LOCAL lock_timeout = '5s';

-- Guardia: più sotto `log_activity()` si riscrive partendo dalla 263. Se in
-- produzione ce n'è una diversa, ci si ferma qui e non si tocca niente.
DO $$
DECLARE d text := pg_get_functiondef('public.log_activity()'::regprocedure);
BEGIN
  IF d NOT LIKE '%x-actor-id%' OR d NOT LIKE '%deal_activities%'
     OR (SELECT count(*) FROM regexp_matches(d, 'WHEN ''[a-z_]+''', 'g'))
        <> (CASE WHEN d LIKE '%WHEN ''social_contents''%' THEN 13 ELSE 12 END) THEN
    RAISE EXCEPTION 'log_activity() in produzione non è quella della 263: fermati e confrontala prima di applicare';
  END IF;
END $$;

-- ── 1) Il contenuto ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.social_contents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     uuid NOT NULL,
  project_id    uuid NOT NULL,
  milestone_id  uuid REFERENCES public.milestones(id) ON DELETE SET NULL,
  planned_date  date NOT NULL,
  planned_time  time,
  channels      text[] NOT NULL,
  format        text NOT NULL,
  title         text NOT NULL,
  caption       text,
  status        text NOT NULL DEFAULT 'bozza',
  owner_id      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- il cliente è quello del progetto, per costruzione
  CONSTRAINT social_contents_project FOREIGN KEY (project_id, client_id)
    REFERENCES public.projects(id, client_id) ON DELETE CASCADE,
  -- gli elenchi chiusi sono gli stessi di `lib/social.ts`: lo verifica
  -- `lib/social.check.ts`, che legge questo file
  CONSTRAINT social_contents_channels CHECK (cardinality(channels) BETWEEN 1 AND 8
    AND channels <@ ARRAY['instagram','facebook','tiktok','linkedin','youtube','pinterest','threads','x']::text[]),
  CONSTRAINT social_contents_format CHECK (format IN ('post','carosello','reel','story','video','articolo')),
  CONSTRAINT social_contents_status CHECK (status IN ('bozza','in_lavorazione','pronto','programmato','pubblicato','annullato')),
  CONSTRAINT social_contents_title CHECK (char_length(btrim(title)) BETWEEN 1 AND 160),
  CONSTRAINT social_contents_caption CHECK (caption IS NULL OR char_length(caption) <= 5000),
  CONSTRAINT social_contents_minute CHECK (planned_time IS NULL OR extract(second FROM planned_time) = 0)
);
CREATE INDEX IF NOT EXISTS social_contents_project_day ON public.social_contents(project_id, planned_date);
CREATE INDEX IF NOT EXISTS social_contents_client_day  ON public.social_contents(client_id, planned_date);
CREATE INDEX IF NOT EXISTS social_contents_day         ON public.social_contents(planned_date);
CREATE INDEX IF NOT EXISTS social_contents_owner       ON public.social_contents(owner_id) WHERE owner_id IS NOT NULL;

-- ── 2) I link dei post pubblicati, uno per canale ───────────────────────────
CREATE TABLE IF NOT EXISTS public.social_content_links (
  content_id  uuid NOT NULL REFERENCES public.social_contents(id) ON DELETE CASCADE,
  channel     text NOT NULL,
  url         text NOT NULL,
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (content_id, channel),
  -- solo https: un `javascript:` in un href è un bottone che esegue codice
  CONSTRAINT social_content_links_url CHECK (url ~ '^https://[^[:space:]]+$' AND char_length(url) <= 2000)
);

-- ── 3) Le creatività ────────────────────────────────────────────────────────
-- I byte stanno su MinIO nella cartella `social`, che ha le sue porte
-- (`/api/social/media/**`): le API generiche dei file la rifiutano.
CREATE TABLE IF NOT EXISTS public.social_content_media (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id       uuid NOT NULL REFERENCES public.social_contents(id) ON DELETE CASCADE,
  file_id          uuid UNIQUE REFERENCES public.files(id) ON DELETE SET NULL,
  storage_key      text NOT NULL,
  name             text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 240),
  mime             text,
  size             bigint NOT NULL CHECK (size > 0 AND size <= 1073741824),
  kind             text NOT NULL CHECK (kind IN ('immagine','video','documento')),
  sort_order       integer NOT NULL DEFAULT 0,
  uploaded_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  idempotency_key  uuid NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (content_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS social_content_media_order ON public.social_content_media(content_id, sort_order);

-- ── 4) Le guardie ───────────────────────────────────────────────────────────
-- Le regole che non dipendono da chi scrive stanno qui, perché valgono per
-- qualunque percorso — anche per uno script col service role.
CREATE OR REPLACE FUNCTION public.social_guard_content()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.client_id IS DISTINCT FROM OLD.client_id OR NEW.project_id IS DISTINCT FROM OLD.project_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR (NEW.created_by IS DISTINCT FROM OLD.created_by AND NEW.created_by IS NOT NULL) THEN
      RAISE EXCEPTION 'Un contenuto non cambia progetto, cliente o autore' USING ERRCODE = '22023';
    END IF;
    NEW.updated_at := now();
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.projects p
                    WHERE p.id = NEW.project_id AND p.client_id = NEW.client_id
                      AND p.service_type = 'social_media_management' AND p.deleted_at IS NULL) THEN
      RAISE EXCEPTION 'Il progetto non è un progetto social attivo di questo cliente' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF NEW.milestone_id IS NOT NULL AND NEW.milestone_id IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.milestone_id END)
     AND NOT EXISTS (SELECT 1 FROM public.milestones m
                       JOIN public.project_workstreams w ON w.id = m.workstream_id
                      WHERE m.id = NEW.milestone_id AND w.project_id = NEW.project_id) THEN
    RAISE EXCEPTION 'La milestone non è di questo progetto' USING ERRCODE = '22023';
  END IF;

  IF cardinality(NEW.channels) <> (SELECT count(DISTINCT c) FROM unnest(NEW.channels) AS c) THEN
    RAISE EXCEPTION 'Un canale compare due volte' USING ERRCODE = '22023';
  END IF;

  -- «pubblicato» vuol dire che il post si può aprire: un link per canale.
  -- La story scade in un giorno e non ha un indirizzo che resti.
  IF NEW.status = 'pubblicato' AND NEW.format <> 'story'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'pubblicato' OR NEW.channels IS DISTINCT FROM OLD.channels)
     AND EXISTS (SELECT 1 FROM unnest(NEW.channels) AS c
                  WHERE NOT EXISTS (SELECT 1 FROM public.social_content_links l
                                     WHERE l.content_id = NEW.id AND l.channel = c)) THEN
    RAISE EXCEPTION 'Per segnarlo pubblicato serve il link del post su ogni canale' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.social_guard_content() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS social_guard_content ON public.social_contents;
CREATE TRIGGER social_guard_content BEFORE INSERT OR UPDATE ON public.social_contents
  FOR EACH ROW EXECUTE FUNCTION public.social_guard_content();

CREATE OR REPLACE FUNCTION public.social_guard_link()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.social_contents c
                  WHERE c.id = NEW.content_id AND NEW.channel = ANY (c.channels)) THEN
    RAISE EXCEPTION 'Il canale non è fra quelli del contenuto' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.social_guard_link() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS social_guard_link ON public.social_content_links;
CREATE TRIGGER social_guard_link BEFORE INSERT OR UPDATE ON public.social_content_links
  FOR EACH ROW EXECUTE FUNCTION public.social_guard_link();

-- La riga del media e la riga `files` raccontano lo stesso oggetto: se la
-- chiave non coincide, il download servirebbe un altro file.
CREATE OR REPLACE FUNCTION public.social_guard_media()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.file_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.files f JOIN public.social_contents c ON c.id = NEW.content_id
       WHERE f.id = NEW.file_id AND f.folder = 'social' AND f.object_key = NEW.storage_key
         AND f.entity_type = 'project' AND f.entity_id = c.project_id) THEN
      RAISE EXCEPTION 'Il file non è una creatività di questo progetto' USING ERRCODE = '22023';
    END IF;
  -- si cambia solo l'ordine; i riferimenti possono solo diventare NULL, per
  -- le cascate di un file o di un account eliminati
  ELSIF (NEW.id, NEW.content_id, NEW.storage_key, NEW.name, NEW.mime, NEW.size, NEW.kind, NEW.idempotency_key, NEW.created_at)
        IS DISTINCT FROM (OLD.id, OLD.content_id, OLD.storage_key, OLD.name, OLD.mime, OLD.size, OLD.kind, OLD.idempotency_key, OLD.created_at)
     OR (NEW.file_id IS DISTINCT FROM OLD.file_id AND NEW.file_id IS NOT NULL)
     OR (NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by AND NEW.uploaded_by IS NOT NULL) THEN
    RAISE EXCEPTION 'Di una creatività si cambia solo l''ordine' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.social_guard_media() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS social_guard_media ON public.social_content_media;
CREATE TRIGGER social_guard_media BEFORE INSERT OR UPDATE ON public.social_content_media
  FOR EACH ROW EXECUTE FUNCTION public.social_guard_media();

-- ── 5) Chi legge ────────────────────────────────────────────────────────────
-- Come i progetti (148): l'admin tutto, il team interno tutto, l'esterno
-- (freelance, partner) solo i progetti in cui è dentro. Il portale cliente
-- nessuno: `get_my_role()` per lui è `client` o `guest`.
CREATE OR REPLACE FUNCTION public.social_staff_can_read(p_project uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.get_my_role() = 'admin'
      OR (public.get_my_role() = 'team'
          AND (NOT public.is_external_resource() OR p_project = ANY (public.get_my_v2_project_ids())))
$$;
REVOKE ALL ON FUNCTION public.social_staff_can_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.social_staff_can_read(uuid) TO authenticated, service_role;

ALTER TABLE public.social_contents      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_content_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_content_media ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.social_contents, public.social_content_links, public.social_content_media FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.social_contents, public.social_content_links, public.social_content_media TO service_role;
GRANT SELECT ON public.social_contents, public.social_content_links TO authenticated;
-- la chiave dell'oggetto non arriva al browser: il download passa dal backend
GRANT SELECT (id, content_id, name, mime, size, kind, sort_order, uploaded_by, created_at)
  ON public.social_content_media TO authenticated;

DROP POLICY IF EXISTS social_staff_read ON public.social_contents;
CREATE POLICY social_staff_read ON public.social_contents FOR SELECT TO authenticated
  USING (public.social_staff_can_read(project_id));
DROP POLICY IF EXISTS social_staff_read ON public.social_content_links;
CREATE POLICY social_staff_read ON public.social_content_links FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.social_contents c WHERE c.id = content_id));
DROP POLICY IF EXISTS social_staff_read ON public.social_content_media;
CREATE POLICY social_staff_read ON public.social_content_media FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.social_contents c WHERE c.id = content_id));

-- ── 6) La cronologia ────────────────────────────────────────────────────────
-- `log_activity()` è quella della 263 con una riga in più, l'etichetta.
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
    WHEN 'deal_activities'     THEN CONCAT(INITCAP(v_snapshot->>'type'), ' · ',
      (SELECT d.company_name FROM public.deals d WHERE d.id = (v_snapshot->>'deal_id')::uuid))
    -- §467 — il giorno davanti al tema: «12/11 · Reel dietro le quinte»
    WHEN 'social_contents'     THEN CONCAT(to_char((v_snapshot->>'planned_date')::date, 'DD/MM'), ' · ', v_snapshot->>'title')
    ELSE v_entity_id::TEXT
  END;

  INSERT INTO public.activity_log (user_id, entity_type, entity_id, entity_label, action, snapshot, diff)
  VALUES (v_user_id, TG_TABLE_NAME, v_entity_id, v_label, v_action, v_snapshot, v_diff);

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_social_contents ON public.social_contents;
CREATE TRIGGER trg_log_social_contents AFTER INSERT OR UPDATE OR DELETE ON public.social_contents
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();

-- ── 7) La voce nel workspace ────────────────────────────────────────────────
-- Nel gruppo Clienti, dopo Tracking: come nel portale admin. Tutto lo staff
-- del workspace la vede; chi può scrivere lo decidono le azioni.
INSERT INTO public.workspace_sections
  (key, label, description, route, icon, sort_order, group_key, group_order, is_active)
SELECT
  'social', 'Social', 'Calendario dei contenuti di tutti i progetti social',
  '/workspace/social', 'Megaphone',
  COALESCE((SELECT max(sort_order) + 1 FROM public.workspace_sections WHERE group_key = 'clienti' AND key <> 'social'), 5),
  'clienti',
  COALESCE((SELECT min(group_order) FROM public.workspace_sections WHERE group_key = 'clienti'), 2),
  true
ON CONFLICT (key) DO UPDATE SET
  label       = EXCLUDED.label,
  description = EXCLUDED.description,
  route       = EXCLUDED.route,
  icon        = EXCLUDED.icon,
  group_key   = EXCLUDED.group_key,
  is_active   = true;

INSERT INTO public.workspace_section_permissions
  (section_id, app_role, can_view, can_create, can_edit, can_delete)
SELECT s.id, r.app_role, true, true, true, false
FROM public.workspace_sections AS s
CROSS JOIN (VALUES ('manager'),('senior'),('junior'),('stage'),('freelance'),('partner')) AS r(app_role)
WHERE s.key = 'social'
  AND NOT EXISTS (
    SELECT 1 FROM public.workspace_section_permissions AS p
    WHERE p.section_id = s.id AND p.app_role = r.app_role
  );

NOTIFY pgrst, 'reload schema';
COMMIT;

-- verifica: tre tabelle con RLS, tredici etichette in cronologia, la voce nel workspace
SELECT
  (SELECT count(*) FROM pg_class WHERE relname IN ('social_contents','social_content_links','social_content_media') AND relrowsecurity) AS tabelle_rls,
  (SELECT count(*) FROM regexp_matches(pg_get_functiondef('public.log_activity()'::regprocedure), 'WHEN ''[a-z_]+''', 'g')) AS etichette,
  (SELECT count(*) FROM public.workspace_section_permissions p JOIN public.workspace_sections s ON s.id = p.section_id WHERE s.key = 'social') AS permessi_social;
