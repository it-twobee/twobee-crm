-- 259 — Chi ha creato una cartella nell'area di un cliente si può eliminare (§422).
--
-- La 254 ha scritto `portal_material_folders.created_by uuid NOT NULL
-- REFERENCES profiles(id)`, senza clausola: `NO ACTION`, cioè «blocca». La 256
-- aveva reso slegabili i file e i movimenti del portale e lasciato fuori le
-- cartelle, dichiarandolo. Bastava una cartella vuota creata da una persona
-- perché quell'account non si eliminasse più.
--
-- Stessa scelta della 256: la cartella resta, e l'autore si slega. Nessuna
-- pagina legge `created_by` di una cartella (si leggono solo `source` e
-- `path`), quindi non serve un nome accanto all'id come per i file.
--
-- La guardia va toccata per lo stesso motivo della 256: `ON DELETE SET NULL` è
-- un UPDATE, e `created_by` sta fra le cose che non cambiano. Passa solo se
-- l'autore diventa NULL e **tutto il resto della riga è identico**. Il
-- confronto è sulla riga intera meno `created_by`, non su un elenco di
-- colonne: una colonna aggiunta domani resta protetta senza doversene
-- ricordare. L'eccezione sta prima del controllo sull'attore, perché questa
-- modifica non la fa una persona.
--
-- Prerequisiti: 254, 256. Rilanciabile. Dopo una 254 rilanciata va rilanciata
-- anche questa: la 254 riscrive la stessa guardia.
BEGIN;
SET LOCAL lock_timeout = '5s';

-- ── 1) La colonna si slega invece di bloccare ───────────────────────────────
ALTER TABLE public.portal_material_folders ALTER COLUMN created_by DROP NOT NULL;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND c.conrelid = 'public.portal_material_folders'::regclass
      AND c.confrelid = 'public.profiles'::regclass
      AND array_length(c.conkey, 1) = 1
      AND a.attname = 'created_by'
      AND c.confdeltype IN ('a', 'r')
  LOOP
    EXECUTE format('ALTER TABLE public.portal_material_folders DROP CONSTRAINT %I', r.conname);
    EXECUTE format('ALTER TABLE public.portal_material_folders ADD CONSTRAINT %I FOREIGN KEY (created_by)
      REFERENCES public.profiles(id) ON DELETE SET NULL', r.conname);
    RAISE NOTICE 'portal_material_folders.created_by adesso si slega invece di bloccare';
  END LOOP;
END $$;

-- ── 2) La guardia impara l'unica modifica che non viene da una persona ───────
-- Il resto è la guardia della 254, invariata.
CREATE OR REPLACE FUNCTION public.portal_guard_material_folder()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.created_by IS NOT NULL AND NEW.created_by IS NULL
    AND (to_jsonb(NEW) - 'created_by') = (to_jsonb(OLD) - 'created_by') THEN
    RETURN NEW;
  END IF;
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
REVOKE ALL ON FUNCTION public.portal_guard_material_folder() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
