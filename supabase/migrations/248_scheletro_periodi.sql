-- §391 — lo scheletro che nasce dentro un periodo.
--
-- Un periodo vuoto non fa risparmiare tempo a nessuno: il contenitore c'e,
-- e le stesse cinque tappe le riscrive qualcuno ogni trimestre — finche ha
-- fretta, e allora ne dimentica una.
--
-- **Non e un sistema nuovo.** Uno scheletro e un template con `kind` a
-- `period` invece che a `project`: stesse tabelle, stesso albero, stesso
-- modo di seminarlo e un domani di modificarlo. Un secondo sistema avrebbe
-- voluto dire due editor, due formati e due posti dove dimenticarsi di
-- aggiornare le stesse cose.
--
-- L'unica differenza sta in cosa vuol dire `relative_due_days`: su un
-- template di progetto sono i giorni dall'avvio, qui sono i giorni dal
-- primo del periodo — e possono essere **negativi**, contati dalla fine,
-- dove `-1` e l'ultimo giorno.
--
-- Serve, perche i periodi non durano uguale: Q3 sono due mesi, Q4 quattro,
-- febbraio ventotto giorni. Un report messo a «giorno 100» starebbe in Q4 e
-- finirebbe fuori da Q3, cioe dentro il trimestre dopo, dove nessuno lo
-- cerca. Con `-1` sta in fondo a tutti e due.
--
-- Rilanciabile.

BEGIN;

ALTER TABLE public.project_templates
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'project',
  ADD COLUMN IF NOT EXISTS period_shape text;

DO $$ BEGIN
  ALTER TABLE public.project_templates
    ADD CONSTRAINT project_templates_kind_check CHECK (kind IN ('project','period'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.project_templates
    ADD CONSTRAINT project_templates_period_shape_check
    CHECK (period_shape IS NULL OR period_shape IN ('quarter','month'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN public.project_templates.kind IS
  'project: lo scheletro di un progetto nuovo. period: quello che nasce dentro un trimestre o un mese (§391).';

-- Un solo scheletro per servizio e forma, o non si saprebbe quale usare.
CREATE UNIQUE INDEX IF NOT EXISTS project_templates_un_periodo_per_servizio
  ON public.project_templates (service_type, COALESCE(service_subtype, ''), period_shape)
  WHERE kind = 'period';

-- ── gli scheletri ────────────────────────────────────────────────────────
--
-- Lo stesso per i tre servizi a trimestri e lo stesso per i due a mesi: il
-- ritmo e quello, e differenziarli adesso vorrebbe dire inventare
-- differenze che nessuno ha chiesto. Si modificano uno per uno dopo.

DO $$
DECLARE
  s text;
  t uuid;
  m uuid;
BEGIN
  -- Trimestri: tappe con dentro i loro task
  FOREACH s IN ARRAY ARRAY['lead_generation','ecommerce','saas'] LOOP
    SELECT id INTO t FROM public.project_templates
      WHERE kind='period' AND service_type=s AND period_shape='quarter' LIMIT 1;
    IF t IS NULL THEN
      INSERT INTO public.project_templates (service_type, name, description, kind, period_shape)
      VALUES (s, 'Trimestre — standard',
              'Quello che si fa in ogni trimestre: si pianifica, si corregge a meta, si rendiconta.',
              'period', 'quarter')
      RETURNING id INTO t;

      INSERT INTO public.project_template_nodes
        (template_id, node_type, name, description, milestone_type, relative_due_days, visibility, sort_order)
      VALUES (t, 'milestone', 'Piano del trimestre',
              'Obiettivi, budget e cosa si prova in questi mesi.', 'delivery', 5, 'client_visible', 10)
      RETURNING id INTO m;
      INSERT INTO public.project_template_nodes
        (template_id, parent_id, node_type, name, relative_due_days, priority, suggested_owner_role, estimated_hours, sort_order) VALUES
        (t, m, 'task', 'Obiettivi e budget del periodo',  3, 'alta',  'Project Manager',   2, 11),
        (t, m, 'task', 'Piano campagne e creativita',     7, 'media', 'Growth Specialist', 4, 12);

      INSERT INTO public.project_template_nodes
        (template_id, node_type, name, description, milestone_type, relative_due_days, visibility, sort_order)
      VALUES (t, 'milestone', 'Correzione di meta periodo',
              'Con i dati in mano si taglia cio che non funziona, finche c''e tempo per rifarlo.',
              'delivery', -45, 'internal', 50)
      RETURNING id INTO m;
      INSERT INTO public.project_template_nodes
        (template_id, parent_id, node_type, name, relative_due_days, priority, suggested_owner_role, estimated_hours, sort_order) VALUES
        (t, m, 'task', 'Analisi risultati a meta periodo', -45, 'media', 'Data Analyst',  3, 51),
        (t, m, 'task', 'Riallocazione budget',             -40, 'alta',  'Media Buyer',   2, 52);

      INSERT INTO public.project_template_nodes
        (template_id, node_type, name, description, milestone_type, relative_due_days, visibility, sort_order)
      VALUES (t, 'milestone', 'Report di fine periodo',
              'Cosa e successo e cosa si propone per il trimestre dopo.', 'delivery', -1, 'client_visible', 90)
      RETURNING id INTO m;
      INSERT INTO public.project_template_nodes
        (template_id, parent_id, node_type, name, relative_due_days, priority, suggested_owner_role, estimated_hours, sort_order) VALUES
        (t, m, 'task', 'Analisi dei risultati del periodo', -7, 'media', 'Data Analyst',     3, 91),
        (t, m, 'task', 'Report e proposta al cliente',      -1, 'alta',  'Project Manager',  3, 92);
    END IF;
  END LOOP;

  -- Mesi: il periodo e gia una tappa, quindi solo task
  FOREACH s IN ARRAY ARRAY['social_media_management','continuing_design'] LOOP
    SELECT id INTO t FROM public.project_templates
      WHERE kind='period' AND service_type=s AND period_shape='month' LIMIT 1;
    IF t IS NULL THEN
      INSERT INTO public.project_templates (service_type, name, description, kind, period_shape)
      VALUES (s, 'Mese — standard',
              'Il giro di un mese: si pianifica, si produce, si pubblica, si rendiconta.',
              'period', 'month')
      RETURNING id INTO t;

      INSERT INTO public.project_template_nodes
        (template_id, node_type, name, description, relative_due_days, priority, suggested_owner_role, estimated_hours, visibility, sort_order) VALUES
        (t, 'task', 'Piano editoriale del mese', 'Temi, formati e calendario, approvati prima di produrre.',
                                     2,  'alta',  'Creative',        4, 'client_visible', 10),
        (t, 'task', 'Produzione contenuti',      NULL,  9,  'media', 'Creative',        8, 'internal', 20),
        (t, 'task', 'Pubblicazione e presidio',  NULL, 14,  'media', 'Social Manager',  4, 'internal', 30),
        (t, 'task', 'Report del mese',           'Cosa ha funzionato, con i numeri accanto.',
                                    -1,  'alta',  'Social Manager',  2, 'client_visible', 90);
    END IF;
  END LOOP;
END $$;

COMMIT;

-- verifica: cinque scheletri, e i nodi che ci stanno dentro
SELECT
  (SELECT count(*) FROM public.project_templates WHERE kind='period' AND period_shape='quarter') AS scheletri_trimestre,
  (SELECT count(*) FROM public.project_templates WHERE kind='period' AND period_shape='month')   AS scheletri_mese,
  (SELECT count(*) FROM public.project_template_nodes n
     JOIN public.project_templates p ON p.id = n.template_id WHERE p.kind='period')              AS nodi,
  (SELECT count(*) FROM public.project_templates WHERE kind='project')                           AS template_progetto;
