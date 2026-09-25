-- 263 — la timeline del lead (§438)
--
-- `deal_activities` c'è dalla 223 e non l'ha mai usata nessuno: diventa il
-- diario delle interazioni con il lead. Da qui in poi ultimo contatto,
-- tentativi e prossimo follow-up **non si digitano**: li ricalcola
-- `sales_ricalcola_contatto` da quello che c'è nel diario, a ogni scrittura.
-- Un campo scritto a mano e un diario possono dire due cose diverse; una
-- colonna derivata no.
--
-- Cosa conta:
--   risposta  = chiamata risposta o «richiamare», email/messaggio ricevuto,
--               meeting fatto, contatto registrato prima della timeline
--   tentativo = chiamata non risposta o segreteria, email/messaggio inviato,
--               meeting a cui non si è presentato
--   tentativi = i tentativi **dopo l'ultima risposta**
--   ultimo contatto = l'ultima risposta o l'ultimo tentativo
--   un follow-up «in programma» non è un contatto: lo diventa quando qualcuno
--   dice com'è andato.
--
-- Backfill (misurato il 2026-09-25, 42 lead, diario vuoto):
--   · 19 lead avevano come ultimo contatto la **data di arrivo** — la scriveva
--     il sync dal foglio. L'arrivo non è un contatto: si svuotano.
--   · 23 erano segnati a mano, con la sola data: diventano un'interazione
--     «contatto» con `has_time = false`. Mezzanotte non è un orario.
--
-- Rilanciabile: `IF NOT EXISTS`, `CREATE OR REPLACE`, e il backfill salta i
-- lead che hanno già una voce nel diario.

BEGIN;
SET LOCAL lock_timeout = '5s';

-- Guardia: più sotto `log_activity()` si riscrive partendo dalla 253. Se in
-- produzione ce n'è una diversa (qualcuno l'ha cambiata senza passare dal
-- repo), la migration si ferma qui e non tocca niente: riportarla indietro
-- in silenzio è il danno che la regola «guarda la produzione» esiste per evitare.
DO $$
DECLARE d text := pg_get_functiondef('public.log_activity()'::regprocedure);
BEGIN
  -- la 253 ha undici etichette nel CASE; questa ne aggiunge una, la sua.
  -- Qualunque altra forma vuol dire che qualcuno l'ha toccata
  IF d NOT LIKE '%x-actor-id%' OR d NOT LIKE '%project_workstreams%'
     OR (SELECT count(*) FROM regexp_matches(d, 'WHEN ''[a-z_]+''', 'g'))
        <> (CASE WHEN d LIKE '%WHEN ''deal_activities''%' THEN 12 ELSE 11 END) THEN
    RAISE EXCEPTION 'log_activity() in produzione non è quella della 253: fermati e confrontala prima di applicare';
  END IF;
END $$;

ALTER TABLE public.deal_activities
  ALTER COLUMN content DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS occurred_at    timestamptz,
  ADD COLUMN IF NOT EXISTS has_time       boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS direction      text,
  ADD COLUMN IF NOT EXISTS stato          text NOT NULL DEFAULT 'fatta',
  ADD COLUMN IF NOT EXISTS duration_min   integer,
  ADD COLUMN IF NOT EXISTS google_event_id text,
  ADD COLUMN IF NOT EXISTS updated_at     timestamptz,
  ADD COLUMN IF NOT EXISTS updated_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

UPDATE public.deal_activities SET occurred_at = created_at WHERE occurred_at IS NULL;
ALTER TABLE public.deal_activities
  ALTER COLUMN occurred_at SET DEFAULT now(),
  ALTER COLUMN occurred_at SET NOT NULL;

ALTER TABLE public.deal_activities DROP CONSTRAINT IF EXISTS deal_activities_type_check;
ALTER TABLE public.deal_activities DROP CONSTRAINT IF EXISTS deal_activities_forma;
ALTER TABLE public.deal_activities ADD CONSTRAINT deal_activities_type_check CHECK
  (type IN ('nota','chiamata','email','whatsapp','meeting','followup','contatto'));
-- ogni tipo ha il suo esito, e nessun altro: un'email «non risposta» o una
-- chiamata «ricevuta» sono righe che il ricalcolo non saprebbe contare.
-- Il COALESCE non è decorazione: `NULL IN (...)` non è falso, e un CHECK che
-- vale NULL passa — una chiamata senza esito entrerebbe.
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
    ELSE stato = 'fatta' AND outcome IS NULL AND direction IS NULL   -- nota, contatto
  END, false));
CREATE UNIQUE INDEX IF NOT EXISTS deal_activities_evento
  ON public.deal_activities(google_event_id) WHERE google_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS deal_activities_quando
  ON public.deal_activities(deal_id, occurred_at DESC);

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS last_interaction_has_time boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS next_followup_at timestamptz;

CREATE OR REPLACE FUNCTION public.sales_ricalcola_contatto(p_deal uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_risposta   timestamptz;
  v_ultimo     record;
  v_tentativi  integer;
  v_tentativo  timestamptz;
  v_prossimo   timestamptz;
BEGIN
  WITH d AS (
    SELECT a.*,
      (a.stato = 'fatta' AND (
         (a.type = 'chiamata' AND a.outcome IN ('risposto','richiamare'))
      OR (a.type IN ('email','whatsapp') AND a.direction = 'entrata')
      OR (a.type = 'meeting' AND a.outcome = 'fatto')
      OR  a.type = 'contatto')) AS risposta,
      (a.stato = 'fatta' AND (
         (a.type = 'chiamata' AND a.outcome IN ('non_risposto','segreteria'))
      OR (a.type IN ('email','whatsapp') AND a.direction = 'uscita')
      OR (a.type = 'meeting' AND a.outcome = 'non_presentato'))) AS tentativo
    FROM public.deal_activities a WHERE a.deal_id = p_deal
  )
  SELECT max(occurred_at) FILTER (WHERE risposta),
         max(occurred_at) FILTER (WHERE tentativo),
         min(occurred_at) FILTER (WHERE type = 'followup' AND stato = 'in_programma')
    INTO v_risposta, v_tentativo, v_prossimo
    FROM d;

  SELECT count(*) INTO v_tentativi FROM public.deal_activities a
   WHERE a.deal_id = p_deal AND a.stato = 'fatta'
     AND ((a.type = 'chiamata' AND a.outcome IN ('non_risposto','segreteria'))
       OR (a.type IN ('email','whatsapp') AND a.direction = 'uscita')
       OR (a.type = 'meeting' AND a.outcome = 'non_presentato'))
     AND (v_risposta IS NULL OR a.occurred_at > v_risposta);

  SELECT occurred_at, has_time INTO v_ultimo FROM public.deal_activities a
   WHERE a.deal_id = p_deal AND a.stato = 'fatta' AND a.type NOT IN ('nota','followup')
   ORDER BY occurred_at DESC, has_time DESC LIMIT 1;

  UPDATE public.deals SET
    last_interaction_at       = v_ultimo.occurred_at,
    last_interaction_has_time = COALESCE(v_ultimo.has_time, true),
    tentativi                 = LEAST(v_tentativi, 999),
    ultimo_tentativo_at       = v_tentativo,
    next_followup_at          = v_prossimo
  WHERE id = p_deal
    AND (last_interaction_at IS DISTINCT FROM v_ultimo.occurred_at
      OR last_interaction_has_time IS DISTINCT FROM COALESCE(v_ultimo.has_time, true)
      OR tentativi IS DISTINCT FROM LEAST(v_tentativi, 999)
      OR ultimo_tentativo_at IS DISTINCT FROM v_tentativo
      OR next_followup_at IS DISTINCT FROM v_prossimo);
END $$;
REVOKE ALL ON FUNCTION public.sales_ricalcola_contatto(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_ricalcola_contatto(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.tbv2_deal_activity_ricalcola()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN PERFORM public.sales_ricalcola_contatto(OLD.deal_id); END IF;
  IF TG_OP IN ('INSERT','UPDATE') AND (TG_OP = 'INSERT' OR NEW.deal_id IS DISTINCT FROM OLD.deal_id) THEN
    PERFORM public.sales_ricalcola_contatto(NEW.deal_id);
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_deal_activity_ricalcola ON public.deal_activities;
CREATE TRIGGER trg_deal_activity_ricalcola AFTER INSERT OR UPDATE OR DELETE ON public.deal_activities
  FOR EACH ROW EXECUTE FUNCTION public.tbv2_deal_activity_ricalcola();

-- La cronologia: una voce del diario che si corregge o si cancella deve
-- lasciare traccia di chi l'ha fatto. `log_activity()` è quella della 253
-- con una riga in più, l'etichetta: senza, la cronologia mostrerebbe un UUID.
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
    ELSE v_entity_id::TEXT
  END;

  INSERT INTO public.activity_log (user_id, entity_type, entity_id, entity_label, action, snapshot, diff)
  VALUES (v_user_id, TG_TABLE_NAME, v_entity_id, v_label, v_action, v_snapshot, v_diff);

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_deal_activities ON public.deal_activities;
CREATE TRIGGER trg_log_deal_activities AFTER INSERT OR UPDATE OR DELETE ON public.deal_activities
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();

-- chi non vede il lead non vede nemmeno la cronologia del suo diario (223)
DROP POLICY IF EXISTS sales_history_scope ON public.activity_log;
CREATE POLICY sales_history_scope ON public.activity_log AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    (entity_type NOT IN ('deals','deal') OR EXISTS (SELECT 1 FROM public.deals d WHERE d.id = entity_id))
    AND (entity_type <> 'deal_activities' OR EXISTS (
      SELECT 1 FROM public.deal_activities a JOIN public.deals d ON d.id = a.deal_id WHERE a.id = entity_id))
  );

-- backfill 1: i contatti segnati a mano diventano la prima voce del diario
INSERT INTO public.deal_activities (deal_id, type, content, occurred_at, has_time, stato, created_at)
SELECT d.id, 'contatto', 'Registrato prima della timeline', d.last_interaction_at,
       (d.last_interaction_at AT TIME ZONE 'UTC')::time <> '00:00:00'::time,
       'fatta', d.last_interaction_at
  FROM public.deals d
 WHERE d.last_interaction_at IS NOT NULL
   AND d.last_interaction_at IS DISTINCT FROM d.created_at
   AND NOT EXISTS (SELECT 1 FROM public.deal_activities a WHERE a.deal_id = d.id);

-- backfill 2: l'arrivo non è un contatto. Il trigger ha già ricalcolato chi ha
-- una voce; qui si riallinea chi non ne ha, e quindi torna «mai sentito».
UPDATE public.deals d SET last_interaction_at = NULL, last_interaction_has_time = true
 WHERE d.last_interaction_at IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.deal_activities a WHERE a.deal_id = d.id);

NOTIFY pgrst, 'reload schema';
COMMIT;

-- verifica: 23 voci «contatto» senza ora, 19 lead tornati a «mai sentito»,
-- e nessun lead con un ultimo contatto che il diario non spiega
SELECT
  (SELECT count(*) FROM public.deal_activities WHERE type = 'contatto')                 AS voci_contatto,
  (SELECT count(*) FROM public.deal_activities WHERE type = 'contatto' AND NOT has_time) AS senza_ora,
  (SELECT count(*) FROM public.deals WHERE last_interaction_at IS NULL)                  AS mai_sentiti,
  (SELECT count(*) FROM public.deals d WHERE d.last_interaction_at IS DISTINCT FROM (
     SELECT max(a.occurred_at) FROM public.deal_activities a
      WHERE a.deal_id = d.id AND a.stato = 'fatta' AND a.type NOT IN ('nota','followup'))) AS non_spiegati;
