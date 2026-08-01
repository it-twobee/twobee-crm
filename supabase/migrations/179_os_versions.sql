-- 179 — Cronologia: chi ha fatto cosa, e in che versione del tool è successo.
--
-- Due problemi distinti, una sola sezione che li ospita.
--
-- 1) ATTRIBUZIONE. `activity_log.user_id` è nullo su quasi tutte le righe
--    recenti: il trigger lo cerca in `app.current_user_id` (mai impostata) o in
--    `auth.uid()`, che con il service role non esiste. Risultato: la cronologia
--    sa cosa è cambiato ma non chi l'ha cambiato — cioè metà del motivo per cui
--    esiste. PostgREST espone gli header della richiesta come GUC: il client
--    che scrive per conto di un utente mette il suo id in `x-actor-id`
--    (`createActorClient` in lib/supabase/admin.ts) e il trigger lo legge.
--
-- 2) VERSIONI. Il tool cambia di continuo e nessuno sa dire cosa è cambiato tra
--    lunedì e oggi. `os_versions` è il registro delle release: un ciclo ogni 15
--    giorni a partire dal 2026-08-01 (v1.0.0), e per ogni versione un elenco di
--    voci che dicono **com'era prima e com'è adesso**. Descrittivo nel sommario,
--    schematico nelle voci: le due letture servono a persone diverse.
--
-- Le versioni si scrivono a mano di proposito. Un changelog generato dai commit
-- racconta i commit, non il prodotto: «fix(clienti): …» non dice a Sabrina cosa
-- può fare oggi che ieri non poteva.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) Attribuzione: il trigger impara a leggere l'attore dall'header
-- ═══════════════════════════════════════════════════════════════════════════
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
    WHEN 'clients'     THEN COALESCE(v_snapshot->>'display_name', v_snapshot->>'company_name')
    WHEN 'tasks'       THEN (v_snapshot->>'title')
    WHEN 'deals'       THEN (v_snapshot->>'title')
    WHEN 'invoices'    THEN CONCAT('Fattura ', v_snapshot->>'invoice_number', ' - ', v_snapshot->>'month')
    WHEN 'tickets'     THEN (v_snapshot->>'title')
    WHEN 'objectives'  THEN (v_snapshot->>'title')
    WHEN 'key_results' THEN (v_snapshot->>'title')
    WHEN 'projects'    THEN (v_snapshot->>'name')
    WHEN 'decisions'   THEN (v_snapshot->>'title')   -- dalla 099: il trigger c'è ancora
    ELSE v_entity_id::TEXT
  END;

  INSERT INTO public.activity_log (user_id, entity_type, entity_id, entity_label, action, snapshot, diff)
  VALUES (v_user_id, TG_TABLE_NAME, v_entity_id, v_label, v_action, v_snapshot, v_diff);

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) Registro delle versioni
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.os_versions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version      TEXT NOT NULL UNIQUE,            -- '1.0.0'
  major        INT  NOT NULL,
  minor        INT  NOT NULL,
  patch        INT  NOT NULL,
  title        TEXT NOT NULL,
  -- il racconto: a cosa serve questa versione, in due righe
  summary      TEXT,
  -- il ciclo di 15 giorni che questa versione chiude
  period_start DATE NOT NULL,
  period_end   DATE NOT NULL,
  released_at  DATE,                            -- NULL finché è bozza
  status       TEXT NOT NULL DEFAULT 'bozza' CHECK (status IN ('bozza', 'pubblicata')),
  created_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (major, minor, patch)
);

CREATE INDEX IF NOT EXISTS idx_os_versions_order ON public.os_versions (major DESC, minor DESC, patch DESC);

CREATE TABLE IF NOT EXISTS public.os_version_changes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id  UUID NOT NULL REFERENCES public.os_versions(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('novita', 'miglioramento', 'correzione', 'rimozione', 'sicurezza')),
  area        TEXT NOT NULL,                    -- 'Clienti', 'Economics', 'Workspace'…
  title       TEXT NOT NULL,
  detail      TEXT,                             -- descrittivo: perché è cambiato
  -- schematico: le due colonne che rendono leggibile un confronto fra versioni
  before_text TEXT,
  after_text  TEXT,
  impact      TEXT NOT NULL DEFAULT 'medio' CHECK (impact IN ('alto', 'medio', 'basso')),
  sort_order  INT  NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_os_version_changes_version ON public.os_version_changes (version_id, sort_order);

-- ── RLS: le pubblicate le legge tutto lo staff, le bozze solo gli admin ─────
ALTER TABLE public.os_versions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.os_version_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS os_versions_read  ON public.os_versions;
DROP POLICY IF EXISTS os_versions_admin ON public.os_versions;
CREATE POLICY os_versions_read ON public.os_versions FOR SELECT
  USING (public.is_staff() AND (status = 'pubblicata' OR public.get_my_role() = 'admin'));
CREATE POLICY os_versions_admin ON public.os_versions FOR ALL
  USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS os_version_changes_read  ON public.os_version_changes;
DROP POLICY IF EXISTS os_version_changes_admin ON public.os_version_changes;
CREATE POLICY os_version_changes_read ON public.os_version_changes FOR SELECT
  USING (public.is_staff() AND EXISTS (
    SELECT 1 FROM public.os_versions v
    WHERE v.id = version_id AND (v.status = 'pubblicata' OR public.get_my_role() = 'admin')));
CREATE POLICY os_version_changes_admin ON public.os_version_changes FOR ALL
  USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) v1.0.0 — dove siamo il 2026-08-01
-- Il primo ciclo non racconta «cosa è cambiato in 15 giorni»: fotografa il
-- punto di partenza, altrimenti la seconda versione si confronterebbe col vuoto.
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.os_versions (version, major, minor, patch, title, summary, period_start, period_end, released_at, status)
VALUES (
  '1.0.0', 1, 0, 0,
  'Il punto di partenza',
  'Prima versione numerata del TwoBee OS. Il tool esisteva già: questa release non aggiunge, dichiara. '
  'Da qui ogni 15 giorni si chiude un ciclo e si pubblica una versione che dice cosa è cambiato rispetto '
  'alla precedente — in due righe di racconto e in un elenco di prima/adesso.',
  DATE '2026-08-01', DATE '2026-08-15', DATE '2026-08-01', 'pubblicata'
) ON CONFLICT (version) DO NOTHING;

INSERT INTO public.os_version_changes (version_id, kind, area, title, detail, before_text, after_text, impact, sort_order)
SELECT v.id, x.kind, x.area, x.title, x.detail, x.before_text, x.after_text, x.impact, x.sort_order
FROM public.os_versions v,
(VALUES
  ('novita', 'Economics', 'I contratti sono l''unico posto dove si scrive un importo',
   'Canone, lavori a corpo e rate vivono in `revenue_streams`. Anagrafica, lista clienti, conto economico e previsionale li leggono e basta.',
   'L''MRR si scriveva a mano in anagrafica e nessuno sapeva da dove venisse.',
   'Ogni numero economico dichiara la provenienza: «da 3 contratti» oppure «da anagrafica».', 'alto', 10),
  ('novita', 'Economics', 'Conto economico mensile al posto del foglio Excel',
   'Ricavi e costi copiati nel mese, non ricalcolati al volo: un mese chiuso resta quello che era.',
   'Il P&L stava in un foglio condiviso, allineato a mano.',
   'Sezione Economics con mesi, righe, spunte fattura/incassato/pagato.', 'alto', 20),
  ('novita', 'Economics', 'Piano dei costi con budget per area',
   'Sei aree di spesa, voci ricorrenti con la loro frequenza, fissi contro variabili. «Porta nel mese» genera le righe.',
   'I costi si registravano riga per riga, ogni mese da capo.',
   'Il piano genera il mese; il budget d''area dice subito se si è sopra.', 'medio', 30),
  ('novita', 'Economics', 'Subappalti e margine di progetto',
   'Una lavorazione affidata fuori è una voce di piano legata al progetto: ricavo del mese meno costi esterni.',
   'Il margine di un progetto non era calcolabile.',
   'Ogni progetto con un subappalto mostra il suo margine reale.', 'alto', 40),
  ('novita', 'Economics', 'Previsionale a sei mesi e IVA trimestrale',
   'I sei mesi che verranno calcolati da contratti, rate e subappalti; liquidazione IVA con il credito che si riporta.',
   'La cassa dei mesi successivi era una stima a memoria.',
   '«Apri il mese» trasforma la previsione in righe vere.', 'medio', 50),
  ('novita', 'Economics', 'Fiscale & Tasse',
   'Scadenzario SRL, stima IRES/IRAP sui mesi registrati, accantonamenti effettivi contro quelli necessari.',
   'Le imposte si scoprivano a giugno.',
   'Ogni stima dichiara la sua assunzione prima del numero.', 'alto', 60),
  ('miglioramento', 'Clienti', 'Tipo cliente e stato pagamenti derivati',
   'Growth/digital lo dicono i progetti; lo stato pagamenti lo dicono le spunte di incasso, col passaggio a «scaduto» dal 16 del mese.',
   'Erano due select che qualcuno doveva ricordarsi di aggiornare.',
   'Sono badge in sola lettura, sempre allineati.', 'medio', 70),
  ('novita', 'Clienti', 'Stato «pending» per le lavorazioni sospese',
   'Un rapporto fermo non è un rapporto perso: fuori dall''MRR attivo e dal conto economico, dentro la relazione, e non conta come churn.',
   'Un cliente fermo andava marcato «perso» o lasciato attivo: due bugie diverse.',
   'Terzo stato, con alert dopo 60 giorni di silenzio.', 'medio', 80),
  ('novita', 'Clienti', 'Eliminazione singola e multipla',
   'Caselle di selezione in lista, nelle card e nelle sezioni pending e persi; la conferma dice quanti progetti, task e contratti cadono in cascata.',
   'Si eliminava un cliente alla volta, con un «sei sicuro?» che non diceva cosa stava per sparire.',
   'Selezione multipla e conferma che conta il lavoro sottostante.', 'medio', 90),
  ('novita', 'Workload', 'Vista del carico per risorsa e per progetto',
   'Effort, timeline e capacità settimanale: le ore di una task multi-assegnata si dividono fra gli assegnatari.',
   'Il carico si stimava guardando le board una per una.',
   'Una vista sola, senza dati economici, sicura anche nel workspace.', 'medio', 100),
  ('miglioramento', 'Workspace', 'Portale operativo separato dall''amministrazione',
   'Manager, senior, junior, stage, freelance e partner vivono in `/workspace`; i dati economici non ci arrivano nemmeno via query.',
   'Un solo portale con voci di menu nascoste — che non è una barriera.',
   'Gate nel middleware, nei layout e nelle RLS.', 'alto', 110),
  ('sicurezza', 'Sicurezza', 'Chiuse le policy aperte e i token fuori posto',
   'RLS `USING(true)` rimosse, credenziali Google spostate in una tabella deny-all, viste del workspace filtrate per i soli progetti di appartenenza.',
   'Alcune tabelle erano leggibili da chiunque fosse autenticato.',
   'Ogni tabella dichiara chi la legge e chi la scrive.', 'alto', 120),
  ('novita', 'Cronologia', 'Registro delle versioni e attribuzione delle modifiche',
   'Questa sezione: chi ha cambiato cosa, con filtri e ripristino, più il changelog di prodotto con un ciclo ogni 15 giorni.',
   'La cronologia mostrava le ultime 200 righe senza autore e senza contesto.',
   'Filtri per persona, tipo, azione e periodo; ripristino che riporta davvero indietro; versioni con prima/adesso.', 'medio', 130)
) AS x(kind, area, title, detail, before_text, after_text, impact, sort_order)
WHERE v.version = '1.0.0'
  AND NOT EXISTS (SELECT 1 FROM public.os_version_changes c WHERE c.version_id = v.id AND c.title = x.title);
