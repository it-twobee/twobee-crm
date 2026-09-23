-- §410 — chi c'è adesso, da quanto non c'è, e quanto ha davvero lavorato.
--
-- `profiles.last_seen_at` esiste dalla 009 e **nessuno la scriveva**: la
-- leggono `person-copy` («assente da N giorni») e la scheda della persona, e
-- rispondevano sempre la stessa cosa perché la colonna era vuota da sempre. Un
-- numero che non c'è è meno dannoso di un numero plausibile e sbagliato, ma
-- solo finché qualcuno non lo mostra.
--
-- Il problema vero però è un altro: **una scheda aperta non è una persona al
-- lavoro.** Un tab dimenticato la mattina dice «online» fino a sera, e una
-- misura del tempo basata su «da quando ha fatto login» conta le riunioni, il
-- pranzo e la notte. Quindi qui non si registra la presenza: si registrano le
-- **interazioni**.
--
-- Il browser conta click, tasti, rotella e cambi di pagina, e manda un battito
-- **solo se ne ha contata almeno una** nel minuto passato e solo se la scheda è
-- in primo piano. Niente interazioni, niente battito: il tempo non avanza. Ne
-- discendono le due misure, e la differenza fra loro è il punto:
--
--   · **tempo attivo** = battiti × un minuto — i minuti in cui si è fatto
--     qualcosa. È il numero che risponde a «quanto ha lavorato nel tool».
--   · **durata** = dall'inizio all'ultimo battito — la finestra in cui la
--     sessione è avvenuta. Comprende le pause corte, e per questo non è la
--     risposta: sta accanto per dare il contesto («dalle 9:12 alle 10:40»).
--
-- Una sessione si chiude da sola: il battito che arriva dopo **quindici
-- minuti** di silenzio ne apre una nuova invece di allungare la vecchia. La
-- soglia è qui dentro e in `lib/presenza.ts`, e `lib/presenza.check.ts` legge
-- questo file per verificare che le due dicano lo stesso numero — una regola
-- scritta due volte non è una regola.
--
-- Rilanciabile: `CREATE TABLE IF NOT EXISTS` + `CREATE OR REPLACE`.
--
-- Tre transazioni invece di una, e ognuna finisce con la sua verifica: si
-- esegue a mano nel SQL Editor, e un blocco da duecento righe incollato in una
-- volta sola è il modo più efficace per non sapere dove si è rotto. I tre pezzi
-- sono indipendenti e rilanciabili nell'ordine in cui stanno.

BEGIN;

CREATE TABLE IF NOT EXISTS public.os_sessions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- da quale porta è entrato: admin, workspace, portale cliente, risorsa esterna
  portale       text        NOT NULL DEFAULT 'altro'
                            CHECK (portale IN ('admin','workspace','portale','risorsa','altro')),
  started_at    timestamptz NOT NULL DEFAULT now(),
  last_beat_at  timestamptz NOT NULL DEFAULT now(),
  beats         integer     NOT NULL DEFAULT 0,  -- minuti con almeno un'interazione
  interactions  integer     NOT NULL DEFAULT 0,  -- click, tasti, rotella, navigazioni
  last_route    text,
  -- {"clienti": 12, "economics": 3} — dove sono finiti i battiti, per sezione
  sezioni       jsonb       NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS os_sessions_profile_idx ON public.os_sessions (profile_id, last_beat_at DESC);
CREATE INDEX IF NOT EXISTS os_sessions_beat_idx    ON public.os_sessions (last_beat_at DESC);

-- RLS senza policy: la tabella dice chi lavora e quanto, e non è una cosa che
-- si legge fra colleghi. Ci arriva il service role da dentro una lettura
-- server, e la funzione qui sotto, che scrive **solo** la riga di chi chiama.
ALTER TABLE public.os_sessions ENABLE ROW LEVEL SECURITY;

COMMIT;

-- verifica 1: la tabella c'è, ed è chiusa a chi non è il service role
SELECT
  (SELECT count(*) FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'os_sessions')  AS tabella,
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.os_sessions'::regclass) AS rls,
  (SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'os_sessions')     AS policy_zero;

-- ═══════════════════════════════════════════════════════════════
-- SCRITTURA — il battito
-- ═══════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.registra_presenza(
  p_portale     text,
  p_route       text,
  p_interazioni integer
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_user    uuid := auth.uid();
  v_id      uuid;
  v_sezione text;
  v_portale text;
  v_int     integer;
BEGIN
  -- `auth.uid()`, non un id nel corpo della richiesta: un battito si scrive
  -- solo sulla propria riga, altrimenti chiunque potrebbe far risultare online
  -- un collega — o sé stesso, un'ora fa.
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'non autenticato' USING ERRCODE = '42501';
  END IF;

  -- Tutto quello che arriva dal browser va ridotto a qualcosa che non può
  -- gonfiare un numero: il tetto è dieci interazioni al secondo per un minuto.
  v_int     := LEAST(GREATEST(COALESCE(p_interazioni, 0), 0), 600);
  v_portale := CASE WHEN p_portale IN ('admin','workspace','portale','risorsa')
                    THEN p_portale ELSE 'altro' END;
  v_sezione := COALESCE(NULLIF(split_part(ltrim(COALESCE(p_route, ''), '/'), '/', 1), ''), 'home');

  SELECT id INTO v_id
  FROM public.os_sessions
  WHERE profile_id = v_user
    AND last_beat_at > now() - interval '15 minutes'
  ORDER BY last_beat_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_id IS NULL THEN
    INSERT INTO public.os_sessions (profile_id, portale, last_route, beats, interactions, sezioni)
    VALUES (v_user, v_portale, left(COALESCE(p_route, ''), 200), 1, v_int,
            jsonb_build_object(v_sezione, 1));
  ELSE
    UPDATE public.os_sessions SET
      last_beat_at = now(),
      beats        = beats + 1,
      interactions = interactions + v_int,
      last_route   = left(COALESCE(p_route, ''), 200),
      portale      = v_portale,
      sezioni      = jsonb_set(sezioni, ARRAY[v_sezione],
                       to_jsonb(COALESCE((sezioni ->> v_sezione)::integer, 0) + 1), true)
    WHERE id = v_id;
  END IF;

  -- La colonna che nessuno scriveva. Da qui in poi «assente da N giorni» è vero.
  --
  -- Passa dal `SECURITY DEFINER`, e non è un dettaglio: `guard_profile_self_update`
  -- (224) blocca ogni scrittura su una colonna di `profiles` che non sia fra le
  -- sei modificabili da sé, e `last_seen_at` non c'è. Il trigger guarda
  -- `current_user`, che qui dentro è il proprietario della funzione e non
  -- `authenticated`, quindi la guardia lascia passare **questa** scrittura senza
  -- aprire niente al browser. Se un giorno questa funzione smette di essere
  -- definer, la riga qui sotto comincia a lanciare 42501 e il battito muore.
  UPDATE public.profiles SET last_seen_at = now() WHERE id = v_user;
END $$;

REVOKE ALL     ON FUNCTION public.registra_presenza(text, text, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.registra_presenza(text, text, integer) TO authenticated;

-- Senza questo PostgREST continua a servire la cache vecchia dello schema e la
-- rotta del battito prende 404 finché qualcosa non lo riavvia: un guasto che
-- sembra un bug del client e sta invece tutto qui.
NOTIFY pgrst, 'reload schema';

COMMIT;

-- verifica 2: la funzione c'è e la può chiamare chi ha una sessione, non chi passa
SELECT
  has_function_privilege('authenticated', 'public.registra_presenza(text,text,integer)', 'execute') AS scrive_lo_staff,
  has_function_privilege('anon',          'public.registra_presenza(text,text,integer)', 'execute') AS scrive_chiunque;

-- ═══════════════════════════════════════════════════════════════
-- LETTURA — solo service role, da dentro la pagina del super admin
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- Le ultime N sessioni **di ciascuno**, non le ultime N in assoluto: con un
-- solo `ORDER BY ... LIMIT` chi lavora tutti i giorni riempie la pagina e di
-- chi non entra da tre settimane — che è la riga che interessa — non resta
-- niente.
CREATE OR REPLACE FUNCTION public.ultime_sessioni(p_quante integer DEFAULT 5)
RETURNS SETOF public.os_sessions
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT s.*
  FROM public.profiles p
  CROSS JOIN LATERAL (
    SELECT o.* FROM public.os_sessions o
    WHERE o.profile_id = p.id
    ORDER BY o.last_beat_at DESC
    LIMIT GREATEST(LEAST(COALESCE(p_quante, 5), 50), 1)
  ) s
$$;

REVOKE ALL ON FUNCTION public.ultime_sessioni(integer) FROM PUBLIC, anon, authenticated;

-- I totali della finestra, per persona: il tempo da una parte, il lavoro
-- lasciato sui dati dall'altra. Sono due domande diverse — si può stare due ore
-- dentro senza cambiare una riga, e cambiarne dieci in cinque minuti — e la
-- vista le mostra accanto proprio perché il confronto è l'informazione.
CREATE OR REPLACE FUNCTION public.presenza_totali(p_da timestamptz)
RETURNS TABLE (
  profile_id    uuid,
  sessioni      bigint,
  battiti       bigint,
  interazioni   bigint,
  azioni        bigint,
  ultima_azione timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
--
-- I nomi interni non assomigliano a quelli di `RETURNS TABLE` per una ragione
-- pratica: in una funzione SQL le colonne dichiarate lì sono parametri di
-- uscita, e un `profile_id` non qualificato nel corpo sarebbe ambiguo fra il
-- parametro e la colonna di `os_sessions` — errore in esecuzione, non in
-- creazione, quindi si scoprirebbe alla prima apertura della pagina.
AS $$
  SELECT
    pr.id,
    COALESCE(s.n_sessioni, 0),
    COALESCE(s.n_battiti, 0),
    COALESCE(s.n_interazioni, 0),
    COALESCE(a.n_azioni, 0),
    a.ultima
  FROM public.profiles pr
  LEFT JOIN (
    SELECT os.profile_id AS pid, count(*) AS n_sessioni,
           COALESCE(sum(os.beats), 0) AS n_battiti,
           COALESCE(sum(os.interactions), 0) AS n_interazioni
    FROM public.os_sessions os
    WHERE os.last_beat_at >= p_da
    GROUP BY os.profile_id
  ) s ON s.pid = pr.id
  LEFT JOIN (
    SELECT al.user_id AS uid, count(*) AS n_azioni, max(al.created_at) AS ultima
    FROM public.activity_log al
    WHERE al.user_id IS NOT NULL AND al.created_at >= p_da
    GROUP BY al.user_id
  ) a ON a.uid = pr.id
$$;

REVOKE ALL ON FUNCTION public.presenza_totali(timestamptz) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- verifica 3: le tre funzioni ci sono, e la lettura non è raggiungibile da un
-- utente qualsiasi (`lettura_aperta` deve essere false)
SELECT
  (SELECT count(*) FROM pg_proc WHERE proname IN
    ('registra_presenza','ultime_sessioni','presenza_totali'))                        AS funzioni,
  (SELECT has_function_privilege('authenticated', 'public.ultime_sessioni(integer)', 'execute')) AS lettura_aperta;
