-- 251 — L'area file di un cliente (§398): quello che carica lui, quello che
-- carichiamo noi, nello stesso posto e con un confine solo.
-- Prerequisiti: 244 (portale), 246 (isolamento storage), 250 (spazio cliente).
-- Additiva. Le righe esistenti restano `source='cliente'`, che è quello che sono.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.portal_materials
  -- Il confine. Sta qui e in una riga sola della policy di lettura: un flag
  -- dimenticato in una pagina è il modo classico di far vedere al cliente il
  -- nostro design system.
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'cliente' CHECK (source IN ('cliente','team')),
  -- Il percorso relativo con cui il file è arrivato: `brand/logo`. L'albero si
  -- ricostruisce da qui, quindi non esistono cartelle fantasma.
  ADD COLUMN IF NOT EXISTS path text,
  -- Archiviare è nostro e vale per noi: toglie dalla vista del team, **non** da
  -- quella del cliente. Far sparire un file a qualcuno senza dirglielo è il
  -- modo peggiore di fargli perdere un logo.
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES public.profiles(id);

DO $$ BEGIN
  BEGIN
    ALTER TABLE public.portal_materials ADD CONSTRAINT portal_materials_archived
      CHECK ((archived_at IS NULL) = (archived_by IS NULL));
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    -- Niente risalite, niente segmenti vuoti, niente percorsi infiniti.
    ALTER TABLE public.portal_materials ADD CONSTRAINT portal_materials_path
      CHECK (path IS NULL OR (
        length(path) BETWEEN 1 AND 400
        AND path !~ '(^/)|(/$)|(//)|(^\.\.?$)|(^\.\.?/)|(/\.\.?/)|(/\.\.?$)'
        AND array_length(string_to_array(path, '/'), 1) <= 10));
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    -- Un file nostro non risponde a un'attività del cliente.
    ALTER TABLE public.portal_materials ADD CONSTRAINT portal_materials_team_activity
      CHECK (source = 'cliente' OR activity_id IS NULL);
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
CREATE INDEX IF NOT EXISTS portal_materials_source ON public.portal_materials(client_id, source, created_at DESC);

-- Anche lo staff legge da `authenticated`: senza questi grant la nostra pagina
-- non saprebbe distinguere i file del cliente dai nostri. Al cliente non
-- raccontano niente — la sua policy gli passa solo `source='cliente'`.
GRANT SELECT (path, source, archived_at, archived_by) ON public.portal_materials TO authenticated;

-- Il confine, in una riga: il cliente legge solo ciò che ha caricato lui.
DROP POLICY IF EXISTS portal_material_read ON public.portal_materials;
CREATE POLICY portal_material_read ON public.portal_materials FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND source = 'cliente' AND public.portal_can_access(client_id, project_id));

-- Chi scrive per il team è staff attivo. Non si può usare `portal_is_staff()`:
-- quella guarda `auth.uid()`, e le scritture arrivano dal service role con
-- l'attore nell'header.
CREATE OR REPLACE FUNCTION public.portal_assert_staff_actor(p_actor uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_actor
    AND p.is_active IS DISTINCT FROM false
    AND (p.app_role IN ('super_admin','founder','admin','manager','senior','junior','stage') OR p.role = 'admin')) THEN
    RAISE EXCEPTION 'Solo il team interno carica nell’area di un cliente' USING ERRCODE = '42501';
  END IF;
END;
$$;

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
      -- Carica chi partecipa, non chi consulta: esclude il lettore e verifica
      -- azienda, scope e revoca.
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
  -- Dopo il caricamento il file è quello che è: si archivia, si rimuove, e poi
  -- si stacca il metadato quando i byte sono spariti.
  IF (NEW.client_id, NEW.project_id, NEW.storage_key, NEW.name, NEW.size, NEW.kind,
      NEW.uploaded_by, NEW.activity_id, NEW.idempotency_key, NEW.created_at, NEW.source, NEW.path)
    IS DISTINCT FROM
     (OLD.client_id, OLD.project_id, OLD.storage_key, OLD.name, OLD.size, OLD.kind,
      OLD.uploaded_by, OLD.activity_id, OLD.idempotency_key, OLD.created_at, OLD.source, OLD.path) THEN
    RAISE EXCEPTION 'Un materiale caricato si può solo archiviare o rimuovere';
  END IF;
  IF OLD.deleted_at IS NOT NULL THEN
    IF (NEW.deleted_at, NEW.deleted_by, NEW.archived_at, NEW.archived_by)
      IS DISTINCT FROM (OLD.deleted_at, OLD.deleted_by, OLD.archived_at, OLD.archived_by)
      OR NEW.file_id IS NOT NULL THEN
      RAISE EXCEPTION 'Un materiale rimosso non torna indietro';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.file_id IS DISTINCT FROM OLD.file_id THEN
    RAISE EXCEPTION 'Un materiale vivo non lascia il suo file';
  END IF;
  -- Archiviare e rimettere in vista si possono fare quante volte serve.
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.portal_assert_staff_actor(uuid), public.portal_guard_material() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
