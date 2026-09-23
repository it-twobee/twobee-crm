-- §424 — le fasi commerciali diventano dati, e ogni fase dichiara il suo ruolo.
--
-- Notion si spegne. Fino a oggi le dodici fasi erano trascritte lettera per
-- lettera in `lib/sales-stages.ts` perché i due elenchi dovevano coincidere
-- (§367); adesso che la fonte è una sola, il percorso si accorcia a otto stati
-- veri e si governa dall'interfaccia.
--
-- **Il ruolo è la parte che tiene in piedi tutto il resto.** Se le fasi sono
-- dati, il codice non può più nominarle: oggi `active_client` è scritto dentro
-- la conversione a cliente, dentro tre controlli di igiene e dentro il tasso di
-- conversione, e il giorno in cui qualcuno la rinomina dall'interfaccia quelle
-- funzioni smettono di trovarla **in silenzio**. Quindi ogni fase dichiara cosa
-- è — `nuovo`, `in_corso`, `vinto`, `perso`, `sospeso` — e il codice chiede il
-- ruolo, mai la chiave. Rinominare «Cliente acquisito» in «Chiuso vinto» non
-- rompe niente; cambiargli il ruolo sì, ed è giusto che si veda.
--
-- **Due cose escono dalla pipeline e diventano campi**, ed è la differenza fra
-- una bacheca che dice dove sono i lead e una che non lo dice:
--   · la **qualifica** (in target / non in target / da valutare) è un giudizio,
--     non un punto del percorso: un lead in target può stare ovunque;
--   · i **tentativi** («chiamata senza risposta») sono un contatore: messi come
--     fase, un lead che non risponde tre volte rimbalza avanti e indietro e si
--     perde dov'era davvero nella trattativa.
-- Si vede subito sui dati veri: due dei sette STATUS del foglio — «Qualificato»
-- e «Non in target (forse)» — non sono fasi, e oggi sono schiacciati dentro la
-- colonna delle fasi. Qui vengono recuperati.
--
-- **Il motivo del perso è un elenco, non testo libero.** Un campo libero
-- diventa quaranta grafie di «prezzo» e rende il grafico dei persi inservibile
-- prima ancora di disegnarlo.
--
-- Le 36 righe esistenti: 12 lost → perso, 7 contacting + 2 in_conversation →
-- in contatto, 6 strategia_preventivo → preventivo inviato, 4 pending, 4
-- audit_richiesto → call fissata, 1 contratto → contratto inviato. Nessuna
-- fase sconosciuta, nessuna riga collegata a un cliente.
--
-- Rilanciabile.

BEGIN;

-- ── 1) Le fasi ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sales_stages (
  chiave      text PRIMARY KEY CHECK (chiave ~ '^[a-z][a-z0-9_]{1,40}$'),
  etichetta   text NOT NULL CHECK (length(btrim(etichetta)) BETWEEN 1 AND 40),
  -- cosa è questa fase per il codice. L'elenco è chiuso di proposito: un ruolo
  -- nuovo è una riga di codice che deve sapere cosa farne.
  ruolo       text NOT NULL CHECK (ruolo IN ('nuovo','in_corso','vinto','perso','sospeso')),
  -- i sette token di stato del design system, mai un hex: un colore inventato
  -- è illeggibile in tema chiaro, ed è la regola più vecchia del progetto.
  tinta       text NOT NULL CHECK (tinta IN ('error','neutro','info','orange','accent','gold','success')),
  ordine      integer NOT NULL,
  attiva      boolean NOT NULL DEFAULT true,
  descrizione text CHECK (descrizione IS NULL OR length(descrizione) <= 200),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- L'ordine è unico ma differito: riordinare vuol dire scambiare due numeri
-- nella stessa transazione, e un vincolo immediato lo rifiuterebbe a metà.
DO $$ BEGIN
  ALTER TABLE public.sales_stages
    ADD CONSTRAINT sales_stages_ordine_unico UNIQUE (ordine) DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;

-- Una sola fase vince e una sola è la porta d'ingresso, fra quelle attive.
-- Indici parziali invece di trigger: il database lo garantisce da sé, e il
-- messaggio di errore arriva a chi sta configurando, non a chi legge un log.
CREATE UNIQUE INDEX IF NOT EXISTS sales_stages_una_vinta
  ON public.sales_stages ((true)) WHERE ruolo = 'vinto' AND attiva;
CREATE UNIQUE INDEX IF NOT EXISTS sales_stages_una_ingresso
  ON public.sales_stages ((true)) WHERE ruolo = 'nuovo' AND attiva;

-- ── 2) I motivi del perso ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sales_motivi_perso (
  chiave     text PRIMARY KEY CHECK (chiave ~ '^[a-z][a-z0-9_]{1,40}$'),
  etichetta  text NOT NULL CHECK (length(btrim(etichetta)) BETWEEN 1 AND 40),
  ordine     integer NOT NULL,
  attivo     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.sales_motivi_perso (chiave, etichetta, ordine) VALUES
  ('prezzo',             'Prezzo',                      10),
  ('tempi',              'Tempi non compatibili',       20),
  ('non_risponde',       'Non risponde più',            30),
  ('non_in_target',      'Non in target',               40),
  ('concorrente',        'Ha scelto un concorrente',    50),
  ('budget',             'Non ha budget',               60),
  ('cliente_inattivo',   'Cliente diventato inattivo',  70),
  ('altro',              'Altro',                       99)
ON CONFLICT (chiave) DO NOTHING;

-- ── 3) Le otto fasi ──────────────────────────────────────────────────────────
-- Due fasi adiacenti non hanno mai la stessa tinta: i sette token non bastano
-- per otto fasi, quindi una coppia si ripete — `call_fissata` e
-- `contratto_inviato`, distanti due passi. Il colore dice a che punto sei,
-- l'etichetta dice quale.
INSERT INTO public.sales_stages (chiave, etichetta, ruolo, tinta, ordine, descrizione) VALUES
  ('nuovo_lead',         'Nuovo lead',         'nuovo',    'info',    10, 'Appena arrivato, nessuno l''ha ancora contattato'),
  ('in_contatto',        'In contatto',        'in_corso', 'orange',  20, 'Si sta provando a parlarci: i tentativi si contano sulla riga'),
  ('call_fissata',       'Call fissata',       'in_corso', 'accent',  30, 'C''è un appuntamento in calendario'),
  ('preventivo_inviato', 'Preventivo inviato', 'in_corso', 'gold',    40, 'La proposta è partita, si aspetta risposta'),
  ('contratto_inviato',  'Contratto inviato',  'in_corso', 'accent',  50, 'Manca solo la firma'),
  ('cliente_acquisito',  'Cliente acquisito',  'vinto',    'success', 60, 'Chiusa vinta. Il cliente in anagrafica si crea a parte'),
  ('pending',            'Pending',            'sospeso',  'neutro',  70, 'Ferma per volontà del cliente, non persa'),
  ('perso',              'Perso',              'perso',    'error',   80, 'Chiusa senza esito: il motivo sta accanto')
ON CONFLICT (chiave) DO NOTHING;

-- ── 4) Chi legge e chi scrive ────────────────────────────────────────────────
-- Le fasi le legge chiunque abbia una sessione: senza, la pagina mostrerebbe
-- trentasei righe senza stato. Scriverle è un'altra cosa e passa dal service
-- role dentro l'azione, come tutto il resto della configurazione — nessuna
-- policy di scrittura, quindi nessuna strada dal browser.
ALTER TABLE public.sales_stages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_motivi_perso ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sales_stages_lettura ON public.sales_stages;
CREATE POLICY sales_stages_lettura ON public.sales_stages
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS sales_motivi_lettura ON public.sales_motivi_perso;
CREATE POLICY sales_motivi_lettura ON public.sales_motivi_perso
  FOR SELECT TO authenticated USING (true);

NOTIFY pgrst, 'reload schema';

COMMIT;

-- verifica 1: otto fasi, una sola vinta, una sola d'ingresso, e nessuna coppia
-- adiacente con lo stesso colore (`adiacenti_uguali` deve essere 0)
SELECT
  (SELECT count(*) FROM public.sales_stages)                                  AS fasi,
  (SELECT count(*) FROM public.sales_stages WHERE ruolo = 'vinto' AND attiva) AS vinte,
  (SELECT count(*) FROM public.sales_stages WHERE ruolo = 'nuovo' AND attiva) AS ingressi,
  (SELECT count(*) FROM (
     SELECT tinta, lag(tinta) OVER (ORDER BY ordine) AS prima
     FROM public.sales_stages WHERE attiva
   ) t WHERE t.tinta = t.prima)                                               AS adiacenti_uguali,
  (SELECT count(*) FROM public.sales_motivi_perso)                            AS motivi;

-- ═══════════════════════════════════════════════════════════════
-- I CAMPI CHE ESCONO DALLA PIPELINE, E LE RIGHE CHE SI SPOSTANO
-- ═══════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS qualifica          text NOT NULL DEFAULT 'da_valutare',
  ADD COLUMN IF NOT EXISTS tentativi          integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ultimo_tentativo_at timestamptz,
  ADD COLUMN IF NOT EXISTS motivo_perso       text;

DO $$ BEGIN
  ALTER TABLE public.deals ADD CONSTRAINT deals_qualifica_valida
    CHECK (qualifica IN ('in_target','non_in_target','da_valutare'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.deals ADD CONSTRAINT deals_tentativi_sensati
    CHECK (tentativi BETWEEN 0 AND 999);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Il CHECK che elenca le fasi se ne va ─────────────────────────────────────
-- `deals_stage_check` elenca a mano le dodici fasi di Notion (235): finché c'è,
-- nessuna riga può diventare «perso» e la migration muore sulla prima. Non
-- viene sostituito da un altro elenco scritto a mano — è un elenco scritto a
-- mano il problema — ma dalla chiave esterna verso `sales_stages` qui sotto,
-- che è più stretta e si aggiorna da sola quando una fase nasce o si ritira.
ALTER TABLE public.deals DROP CONSTRAINT IF EXISTS deals_stage_check;

-- ── Il perché, preso prima che la fase lo cancelli ───────────────────────────
-- `inactive_client` era un'uscita travestita da fase: diventa «Perso» col suo
-- motivo. Deve stare **prima** della riscrittura qui sotto — dopo, quelle righe
-- sono «perso» come tutte le altre e non si distinguono più.
UPDATE public.deals SET motivo_perso = 'cliente_inattivo'
  WHERE stage = 'inactive_client' AND motivo_perso IS NULL;

-- ── Le righe si spostano ─────────────────────────────────────────────────────
-- Traduzione approvata riga per riga. Quello che non è in elenco resta com'è e
-- lo blocca la chiave esterna qui sotto: meglio una migration che si ferma di
-- una riga che finisce in una fase inventata.
UPDATE public.deals SET stage = CASE stage
  WHEN 'lost'                 THEN 'perso'
  WHEN 'inactive_client'      THEN 'perso'
  WHEN 'new_lead'             THEN 'nuovo_lead'
  WHEN 'contacting'           THEN 'in_contatto'
  WHEN 'in_conversation'      THEN 'in_contatto'
  WHEN 'evento_osm'           THEN 'in_contatto'
  WHEN 'audit_richiesto'      THEN 'call_fissata'
  WHEN 'qualified'            THEN 'in_contatto'
  WHEN 'pending'              THEN 'pending'
  WHEN 'strategia_preventivo' THEN 'preventivo_inviato'
  WHEN 'contratto'            THEN 'contratto_inviato'
  WHEN 'active_client'        THEN 'cliente_acquisito'
  ELSE stage
END
WHERE stage IN ('lost','inactive_client','new_lead','contacting','in_conversation',
                'evento_osm','audit_richiesto','qualified','strategia_preventivo',
                'contratto','active_client');

-- ── La qualifica che il foglio aveva già detto ───────────────────────────────
-- Due degli STATUS del foglio non erano fasi: erano giudizi. Finora venivano
-- schiacciati dentro la colonna delle fasi — «Non in target» diventava Lost e
-- «Qualificato» una fase di mezzo — e quell'informazione si perdeva. Qui torna
-- dove deve stare. La fase **non** si tocca: dove sta adesso l'ha deciso
-- qualcuno guardandola.
UPDATE public.deals SET qualifica = 'non_in_target'
  WHERE qualifica = 'da_valutare' AND lower(coalesce(sheet_status, '')) LIKE 'non in target%';
UPDATE public.deals SET qualifica = 'in_target'
  WHERE qualifica = 'da_valutare' AND lower(coalesce(sheet_status, '')) = 'qualificato';

-- ── Nessuna riga orfana, mai più ─────────────────────────────────────────────
-- `RESTRICT`: una fase con delle righe sopra non si cancella. È il motivo per
-- cui l'editor dovrà chiedere dove spostarle prima, invece di scoprire
-- l'errore dopo — una riga senza fase non si filtra, non si conta, e resta in
-- tabella a far numero.
DO $$ BEGIN
  ALTER TABLE public.deals ADD CONSTRAINT deals_stage_esiste
    FOREIGN KEY (stage) REFERENCES public.sales_stages(chiave) ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.deals ADD CONSTRAINT deals_motivo_perso_esiste
    FOREIGN KEY (motivo_perso) REFERENCES public.sales_motivi_perso(chiave) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- verifica 2: dove sono finite le 36 righe, e cosa ha recuperato la qualifica
SELECT s.ordine, s.etichetta, s.ruolo, count(d.id) AS righe
FROM public.sales_stages s
LEFT JOIN public.deals d ON d.stage = s.chiave
GROUP BY s.ordine, s.etichetta, s.ruolo
ORDER BY s.ordine;

SELECT qualifica, count(*) AS righe FROM public.deals GROUP BY qualifica ORDER BY 2 DESC;
