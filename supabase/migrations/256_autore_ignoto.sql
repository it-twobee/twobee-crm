-- §419 — cancellare una persona non deve portarsi via il file di un cliente.
--
-- Decisione presa dal committente, e va scritta perché non è ovvia: **un account
-- si elimina davvero**, e quello che ha caricato nell'area di un cliente resta
-- dov'è, con l'autore ignoto e dichiarato tale. L'alternativa era tenere in
-- eterno account che nessuno usa più solo perché una volta hanno caricato un
-- PNG — e infatti finora era così: bastava un file per rendere una persona
-- incancellabile per sempre.
--
-- Il nome non si perde, e non è un dettaglio: `portal_materials.uploaded_by_name`
-- è già scritto accanto all'id dal giorno del caricamento. Quando l'id si slega,
-- il nome resta e l'interfaccia lo mostra con la sua avvertenza — «non più nel
-- sistema». Un file senza autore sarebbe stato peggio del file di prima.
--
-- Due tabelle, quelle che bloccano oggi:
--   · `portal_materials.uploaded_by` — chi ha caricato;
--   · `portal_events.actor_id`       — chi ha mosso qualcosa nel portale.
--
-- Restano fuori le altre colonne del portale che puntano a una persona
-- (`portal_activities.author_id`, `portal_requests`, `portal_approvals`…): hanno
-- guardie proprie sull'UPDATE che vanno lette una per una, e la verifica in
-- coda le elenca invece di lasciarle scoprire al prossimo che ci sbatte.
--
-- La guardia di `portal_materials` va toccata perché è **lei** a rifiutare:
-- `uploaded_by` sta nell'elenco di ciò che non cambia dopo il caricamento, e
-- `ON DELETE SET NULL` è tecnicamente un UPDATE. Il corpo qui sotto è quello
-- della **254** ricopiato per intero, con una sola aggiunta in testa al ramo
-- UPDATE: se l'unica cosa che cambia è l'autore che diventa NULL, passa.
-- Ricopiato e non «solo la mia parte», perché `CREATE OR REPLACE` sostituisce
-- tutto e una versione parziale riporterebbe indietro il rinomina dei file.
--
-- Rilanciabile.

BEGIN;

-- ── 1) Le colonne si slegano invece di bloccare ──────────────────────────────
ALTER TABLE public.portal_materials ALTER COLUMN uploaded_by DROP NOT NULL;
ALTER TABLE public.portal_events    ALTER COLUMN actor_id    DROP NOT NULL;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conrelid::regclass::text AS tab, c.conname, a.attname
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND c.confrelid = 'public.profiles'::regclass
      AND array_length(c.conkey, 1) = 1
      AND c.confdeltype IN ('a', 'r')
      AND (c.conrelid = 'public.portal_materials'::regclass AND a.attname = 'uploaded_by'
        OR c.conrelid = 'public.portal_events'::regclass    AND a.attname = 'actor_id')
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tab, r.conname);
    EXECUTE format(
      'ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%I)
         REFERENCES public.profiles(id) ON DELETE SET NULL', r.tab, r.conname, r.attname);
    RAISE NOTICE '%.% adesso si slega invece di bloccare', r.tab, r.attname;
  END LOOP;
END $$;

-- ── 2) La guardia impara l'unica modifica che non viene da una persona ───────
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

  -- §419 — l'unica modifica che non arriva da una persona: la chiave esterna
  -- slega l'autore perché il suo account è stato eliminato. Passa solo se è
  -- **l'unica** cosa cambiata: tutto il resto della riga deve essere identico,
  -- altrimenti sarebbe una porta aperta per riscrivere un materiale fingendo
  -- una cancellazione.
  IF OLD.uploaded_by IS NOT NULL AND NEW.uploaded_by IS NULL
    AND (NEW.client_id, NEW.project_id, NEW.storage_key, NEW.name, NEW.size, NEW.kind,
         NEW.activity_id, NEW.idempotency_key, NEW.created_at, NEW.source, NEW.path,
         NEW.file_id, NEW.deleted_at, NEW.deleted_by, NEW.archived_at, NEW.archived_by,
         NEW.uploaded_by_name)
      IS NOT DISTINCT FROM
        (OLD.client_id, OLD.project_id, OLD.storage_key, OLD.name, OLD.size, OLD.kind,
         OLD.activity_id, OLD.idempotency_key, OLD.created_at, OLD.source, OLD.path,
         OLD.file_id, OLD.deleted_at, OLD.deleted_by, OLD.archived_at, OLD.archived_by,
         OLD.uploaded_by_name)
  THEN
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
    RAISE EXCEPTION 'Un file cambia nome, non estensione' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.portal_guard_material() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- verifica 1: le due colonne adesso si slegano, e possono stare vuote
SELECT c.conrelid::regclass::text AS tabella, a.attname AS colonna,
  a.attnotnull AS obbligatoria,
  CASE c.confdeltype WHEN 'a' THEN 'no action' WHEN 'r' THEN 'restrict'
                     WHEN 'c' THEN 'cascade'   WHEN 'n' THEN 'set null'
                     WHEN 'd' THEN 'set default' END AS alla_cancellazione
FROM pg_constraint c
JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
WHERE c.contype = 'f' AND c.confrelid = 'public.profiles'::regclass
  AND c.conrelid IN ('public.portal_materials'::regclass, 'public.portal_events'::regclass)
ORDER BY 1, 2;

-- verifica 2: chi blocca ancora. Non è un elenco da svuotare — per certe
-- tabelle bloccare è giusto — ma il prossimo vicolo cieco si vede da qui,
-- invece che davanti a una finestra che dice di no.
SELECT c.conrelid::regclass::text AS tabella, a.attname AS colonna, a.attnotnull AS obbligatoria
FROM pg_constraint c
JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
WHERE c.contype = 'f'
  AND c.confrelid = 'public.profiles'::regclass
  AND array_length(c.conkey, 1) = 1
  AND c.confdeltype IN ('a', 'r')
ORDER BY 1, 2;
