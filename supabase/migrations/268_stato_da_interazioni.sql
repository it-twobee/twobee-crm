-- 268 — lo stato del lead segue le interazioni (§461)
--
-- Ogni interazione registrata sul lead (`deal_activities`) può spostare la sua
-- fase. La regola vive **qui**, nel database, e in un posto solo: l'interfaccia,
-- la route del calendario, l'import e un'eventuale azione futura scrivono tutte
-- nel diario, e il trigger decide. Una regola in TypeScript sarebbe stata
-- aggirata dal primo percorso che non passa di lì.
--
-- Cosa decide:
--   · conta **l'ultima** interazione per data (`occurred_at`), non l'ultima
--     inserita: una chiamata retrodatata non scavalca una di ieri;
--   · note, contatti storici e le voci «stato» scritte da questo stesso trigger
--     non contano;
--   · ogni combinazione tipo/esito ha una regola in `sales_regole_stato`, che si
--     governa da Configurazione. Senza fase = nessun cambio;
--   · la fase di arrivo è sempre una trattativa viva (ruolo `in_corso`): mai
--     «Nuovo lead», mai le uscite;
--   · un lead che sta già in Perso, Cliente acquisito o Pending non si tocca:
--     sono scelte di una persona;
--   · si può tornare indietro (decisione 2026-10-02), e cancellare o correggere
--     un'interazione ricalcola dalle rimaste.
--
-- Ogni cambio scrive nel diario una voce `stato` («In contatto → Non
-- raggiunto») accanto all'interazione che l'ha causato, e le regole con `avvisa`
-- mandano una notifica ai super admin.
--
-- Nuova fase **Non raggiunto** (`non_raggiunto`, ordine 15): la 258 aveva tolto
-- i tentativi dalla pipeline perché un lead che non risponde rimbalzava avanti e
-- indietro. Adesso la fase la muove il trigger, non una persona, e il
-- contatore `tentativi` resta com'è.
--
-- Rilanciabile. Non riallinea i lead esistenti: lo fa
-- `sales_riallinea_stati(false)` (anteprima) e `(true)` (applica).

BEGIN;
SET LOCAL lock_timeout = '5s';

-- Guardia: si riscrive la funzione della 263. Se in produzione è un'altra
-- (qualcuno l'ha toccata fuori dal repo), ci si ferma senza toccare niente.
DO $$
DECLARE d text := pg_get_functiondef('public.sales_ricalcola_contatto(uuid)'::regprocedure);
BEGIN
  IF d NOT LIKE '%NOT IN (''nota'',''followup'')%' AND d NOT LIKE '%NOT IN (''nota'',''followup'',''stato'')%' THEN
    RAISE EXCEPTION 'sales_ricalcola_contatto() in produzione non è quella della 263: confrontala prima di applicare';
  END IF;
END $$;

-- ── 1) La fase ───────────────────────────────────────────────────────────────
INSERT INTO public.sales_stages (chiave, etichetta, ruolo, tinta, ordine, descrizione) VALUES
  ('non_raggiunto', 'Non raggiunto', 'in_corso', 'neutro', 15,
   'Chiamata senza risposta, segreteria, da richiamare o appuntamento saltato: si aggiorna da sola')
ON CONFLICT (chiave) DO NOTHING;

-- ── 2) Il diario: due tipi nuovi, la voce «stato», il flag del meeting ───────
ALTER TABLE public.deal_activities
  ADD COLUMN IF NOT EXISTS is_meeting boolean NOT NULL DEFAULT false;

ALTER TABLE public.deal_activities DROP CONSTRAINT IF EXISTS deal_activities_type_check;
ALTER TABLE public.deal_activities DROP CONSTRAINT IF EXISTS deal_activities_forma;
ALTER TABLE public.deal_activities ADD CONSTRAINT deal_activities_type_check CHECK
  (type IN ('nota','chiamata','email','whatsapp','meeting','followup','contatto','preventivo','contratto','stato'));
ALTER TABLE public.deal_activities ADD CONSTRAINT deal_activities_forma CHECK (COALESCE(
  stato IN ('fatta','in_programma','annullata')
  AND (duration_min IS NULL OR duration_min BETWEEN 5 AND 1440)
  AND CASE type
    WHEN 'chiamata' THEN stato = 'fatta' AND direction IS NULL
                         AND outcome IN ('risposto','non_risposto','richiamare','segreteria')
    WHEN 'email'    THEN stato = 'fatta' AND outcome IS NULL AND direction IN ('uscita','entrata')
    WHEN 'whatsapp' THEN stato = 'fatta' AND outcome IS NULL AND direction IN ('uscita','entrata')
    WHEN 'meeting'  THEN stato = 'fatta' AND direction IS NULL AND outcome IN ('fatto','non_presentato')
    WHEN 'followup' THEN stato IN ('in_programma','annullata') AND outcome IS NULL AND direction IS NULL
    ELSE stato = 'fatta' AND outcome IS NULL AND direction IS NULL   -- nota, contatto, preventivo, contratto, stato
  END, false));

-- ── 3) Le regole ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sales_regole_stato (
  chiave    text PRIMARY KEY,                       -- «tipo:esito» · «tipo:verso» · «tipo:-»
  etichetta text NOT NULL,
  fase      text REFERENCES public.sales_stages(chiave) ON UPDATE CASCADE ON DELETE SET NULL,
  avvisa    boolean NOT NULL DEFAULT false,
  ordine    integer NOT NULL
);

INSERT INTO public.sales_regole_stato (chiave, etichetta, fase, avvisa, ordine) VALUES
  ('chiamata:risposto',      'Chiamata · risposto',                'in_contatto',        false, 10),
  ('chiamata:non_risposto',  'Chiamata · non risposto',            'non_raggiunto',      true,  20),
  ('chiamata:segreteria',    'Chiamata · segreteria',              'non_raggiunto',      true,  30),
  ('chiamata:richiamare',    'Chiamata · da richiamare',           'non_raggiunto',      true,  40),
  ('email:uscita',           'Email · inviata da noi',             'in_contatto',        false, 50),
  ('email:entrata',          'Email · ricevuta da lui',            'in_contatto',        false, 60),
  ('whatsapp:uscita',        'Messaggio · inviato da noi',         'in_contatto',        false, 70),
  ('whatsapp:entrata',       'Messaggio · ricevuto da lui',        'in_contatto',        false, 80),
  ('followup:meeting',       'Call o meeting fissato',             'call_fissata',       false, 90),
  ('followup:in_programma',  'Follow-up generico in programma',    NULL,                 false, 100),
  ('meeting:fatto',          'Meeting · fatto',                    NULL,                 false, 110),
  ('meeting:non_presentato', 'Meeting · non si è presentato',      'non_raggiunto',      true,  120),
  ('preventivo:-',           'Preventivo inviato',                 'preventivo_inviato', false, 130),
  ('contratto:-',            'Contratto inviato',                  'contratto_inviato',  false, 140)
ON CONFLICT (chiave) DO NOTHING;

ALTER TABLE public.sales_regole_stato ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sales_regole_stato_lettura ON public.sales_regole_stato;
CREATE POLICY sales_regole_stato_lettura ON public.sales_regole_stato FOR SELECT TO authenticated USING (true);

-- ── 4) La fase che il diario chiede ──────────────────────────────────────────
-- NULL = nessun cambio. Una sola funzione per il trigger, l'anteprima e il
-- riallineamento: se fossero tre, il giorno in cui divergono nessuno saprebbe
-- quale dice la verità.
CREATE OR REPLACE FUNCTION public.sales_fase_attesa(p_deal uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.chiave
    FROM (
      SELECT r.fase
        FROM public.deal_activities a
        LEFT JOIN public.sales_regole_stato r ON r.chiave = a.type || ':' || CASE
          WHEN a.type = 'followup' THEN CASE WHEN a.is_meeting THEN 'meeting' ELSE 'in_programma' END
          ELSE COALESCE(a.outcome, a.direction, '-') END
       WHERE a.deal_id = p_deal
         AND a.type NOT IN ('nota','contatto','stato')
         AND (a.stato = 'fatta' OR (a.type = 'followup' AND a.stato = 'in_programma'))
       ORDER BY a.occurred_at DESC, a.created_at DESC
       LIMIT 1
    ) u
    JOIN public.sales_stages s ON s.chiave = u.fase AND s.attiva AND s.ruolo = 'in_corso'
$$;
REVOKE ALL ON FUNCTION public.sales_fase_attesa(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_fase_attesa(uuid) TO service_role;

-- ── 5) Applicarla ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sales_applica_stato(p_deal uuid, p_attore uuid, p_quando timestamptz, p_perche text, p_avvisa boolean DEFAULT true)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ora     text;
  v_ruolo   text;
  v_attesa  text;
  v_azienda text;
  v_da      text;
  v_a       text;
  v_avvisa  boolean;
BEGIN
  SELECT d.stage, COALESCE(d.company_name, d.title) INTO v_ora, v_azienda FROM public.deals d WHERE d.id = p_deal;
  IF v_ora IS NULL THEN RETURN false; END IF;
  SELECT ruolo INTO v_ruolo FROM public.sales_stages WHERE chiave = v_ora;
  IF v_ruolo IS DISTINCT FROM 'nuovo' AND v_ruolo IS DISTINCT FROM 'in_corso' THEN RETURN false; END IF;

  v_attesa := public.sales_fase_attesa(p_deal);
  IF v_attesa IS NULL OR v_attesa = v_ora THEN RETURN false; END IF;

  UPDATE public.deals SET stage = v_attesa, updated_at = now() WHERE id = p_deal;

  SELECT etichetta INTO v_da FROM public.sales_stages WHERE chiave = v_ora;
  SELECT etichetta INTO v_a  FROM public.sales_stages WHERE chiave = v_attesa;
  INSERT INTO public.deal_activities (deal_id, type, stato, content, occurred_at, has_time, created_by)
  VALUES (p_deal, 'stato', 'fatta', COALESCE(v_da, v_ora) || ' → ' || COALESCE(v_a, v_attesa)
            || COALESCE(' · ' || p_perche, ''),
          COALESCE(p_quando, now()) + interval '1 second', true, p_attore);

  SELECT COALESCE(bool_or(r.avvisa), false) INTO v_avvisa
    FROM public.sales_regole_stato r
   WHERE r.fase = v_attesa AND r.avvisa;
  IF v_avvisa AND p_avvisa THEN
    INSERT INTO public.notifications (user_id, profile_id, type, title, body, link)
    SELECT p.id, p.id, 'lead_stato', COALESCE(v_a, v_attesa) || ' · ' || v_azienda,
           COALESCE(p_perche, 'Stato aggiornato dalle interazioni'),
           '/commerciale?lead=' || p_deal
      FROM public.profiles p
     WHERE (p.app_role = 'super_admin' OR lower(p.email) = 'm.lucci@twobee.it')
       AND p.is_active IS DISTINCT FROM false;
  END IF;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.sales_applica_stato(uuid, uuid, timestamptz, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_applica_stato(uuid, uuid, timestamptz, text, boolean) TO service_role;

-- ── 6) Il ricalcolo del contatto ignora le voci «stato» ──────────────────────
-- Identica alla 263, con 'stato' in più nell'elenco di quello che non è un
-- contatto: la voce che scrive il trigger non deve diventare «ultimo contatto».
DO $$
DECLARE d text := pg_get_functiondef('public.sales_ricalcola_contatto(uuid)'::regprocedure);
BEGIN
  IF d LIKE '%NOT IN (''nota'',''followup'',''stato'')%' THEN RETURN; END IF;
  EXECUTE replace(d, 'NOT IN (''nota'',''followup'')', 'NOT IN (''nota'',''followup'',''stato'')');
END $$;

-- ── 7) Il trigger ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tbv2_deal_activity_ricalcola()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_deal uuid;
  v_titolo text;
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN PERFORM public.sales_ricalcola_contatto(OLD.deal_id); END IF;
  IF TG_OP IN ('INSERT','UPDATE') AND (TG_OP = 'INSERT' OR NEW.deal_id IS DISTINCT FROM OLD.deal_id) THEN
    PERFORM public.sales_ricalcola_contatto(NEW.deal_id);
  END IF;

  /* lo stato: una voce «stato» è l'effetto, non la causa; una correzione che non
     tocca ciò che decide la fase (un testo, una durata) non deve rimettere in
     discussione quello che una persona ha scelto nel frattempo */
  IF TG_OP = 'DELETE' THEN
    IF OLD.type <> 'stato' THEN
      PERFORM public.sales_applica_stato(OLD.deal_id, NULL, now(), 'dopo l’eliminazione di un’interazione');
    END IF;
  ELSIF NEW.type <> 'stato' AND (TG_OP = 'INSERT' OR
        (NEW.type, NEW.outcome, NEW.direction, NEW.stato, NEW.occurred_at, NEW.is_meeting, NEW.deal_id)
        IS DISTINCT FROM
        (OLD.type, OLD.outcome, OLD.direction, OLD.stato, OLD.occurred_at, OLD.is_meeting, OLD.deal_id)) THEN
    v_deal := NEW.deal_id;
    v_titolo := (SELECT r.etichetta FROM public.sales_regole_stato r WHERE r.chiave = NEW.type || ':' || CASE
        WHEN NEW.type = 'followup' THEN CASE WHEN NEW.is_meeting THEN 'meeting' ELSE 'in_programma' END
        ELSE COALESCE(NEW.outcome, NEW.direction, '-') END);
    PERFORM public.sales_applica_stato(v_deal, COALESCE(NEW.updated_by, NEW.created_by), NEW.occurred_at, v_titolo);
  END IF;
  RETURN NULL;
END $$;

-- ── 8) Il riallineamento una tantum ──────────────────────────────────────────
-- (false) = anteprima, non scrive niente · (true) = applica
CREATE OR REPLACE FUNCTION public.sales_riallinea_stati(p_applica boolean DEFAULT false)
RETURNS TABLE (deal_id uuid, azienda text, da text, a text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT d.id, COALESCE(d.company_name, d.title) AS azienda, d.stage AS da, public.sales_fase_attesa(d.id) AS a
      FROM public.deals d
      JOIN public.sales_stages s ON s.chiave = d.stage AND s.ruolo IN ('nuovo','in_corso')
     ORDER BY 2
  LOOP
    IF r.a IS NULL OR r.a = r.da THEN CONTINUE; END IF;
    deal_id := r.id; azienda := r.azienda; da := r.da; a := r.a;
    IF p_applica THEN PERFORM public.sales_applica_stato(r.id, NULL, now(), 'riallineamento iniziale', false); END IF;
    RETURN NEXT;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.sales_riallinea_stati(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_riallinea_stati(boolean) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- verifica: la fase c'è, le regole sono 14, e l'anteprima non scrive niente
SELECT (SELECT count(*) FROM public.sales_stages WHERE chiave = 'non_raggiunto') AS fase,
       (SELECT count(*) FROM public.sales_regole_stato)                          AS regole,
       (SELECT count(*) FROM public.sales_riallinea_stati(false))                AS lead_da_riallineare;
