-- §362 — cosa resta attaccato a una persona, prima di cancellarla.
--
-- In Impostazioni si può disattivare un membro, non eliminarlo, e per i conti
-- veri è giusto: chi ha lavorato qui ha lasciato task, righe di cronologia,
-- messaggi, e cancellarlo riscriverebbe la storia invece di chiuderla. Ma un
-- account di prova — «test test», «marco test» — non ha lasciato niente, e
-- tenerlo in elenco per sempre è solo sporcizia.
--
-- La domanda quindi non è «posso cancellare?» ma **«cosa si porta dietro?»**, e
-- la risposta non si scrive a mano: quarantotto chiavi esterne puntano a
-- `profiles`, e un elenco copiato in TypeScript sarebbe già vecchio alla
-- prossima tabella. Questa funzione lo chiede a `pg_constraint`, quindi
-- risponde sempre sullo schema di **adesso** — comprese le tabelle che non
-- esistono ancora.
--
-- `azione` è quello che il database farebbe da solo:
--   · `no action` / `restrict` → **blocca**: la riga non si può cancellare;
--   · `cascade`                → si cancella insieme a lei (la storia sparisce);
--   · `set null` / `set default` → si slega e resta (l'unica innocua).
--
-- Rilanciabile: `CREATE OR REPLACE`.

BEGIN;

CREATE OR REPLACE FUNCTION public.tracce_membro(p_id uuid)
RETURNS TABLE (tabella text, colonna text, righe bigint, azione text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  r record;
  n bigint;
BEGIN
  FOR r IN
    SELECT
      c.conrelid::regclass::text AS tab,
      a.attname::text            AS col,
      CASE c.confdeltype
        WHEN 'a' THEN 'no action' WHEN 'r' THEN 'restrict'
        WHEN 'c' THEN 'cascade'   WHEN 'n' THEN 'set null'
        WHEN 'd' THEN 'set default' ELSE c.confdeltype::text
      END                        AS act
    FROM pg_constraint c
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND c.confrelid = 'public.profiles'::regclass
      -- solo chiavi a una colonna: verso `profiles(id)` non ne esistono altre,
      -- e una composta qui darebbe un conteggio senza senso invece di un errore
      AND array_length(c.conkey, 1) = 1
  LOOP
    EXECUTE format('SELECT count(*) FROM %s WHERE %I = $1', r.tab, r.col)
      INTO n USING p_id;
    IF n > 0 THEN
      tabella := r.tab; colonna := r.col; righe := n; azione := r.act;
      RETURN NEXT;
    END IF;
  END LOOP;
END $$;

-- Il service role la chiama dalla server action; nessun ruolo anonimo la vede.
REVOKE ALL ON FUNCTION public.tracce_membro(uuid) FROM PUBLIC, anon, authenticated;

COMMIT;

-- verifica: la funzione c'è e su un id inesistente non trova niente
SELECT
  (SELECT count(*) FROM pg_proc WHERE proname = 'tracce_membro')                      AS funzione,
  (SELECT count(*) FROM public.tracce_membro('00000000-0000-0000-0000-000000000000')) AS tracce_di_nessuno;
