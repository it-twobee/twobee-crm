-- §388 — i periodi di un progetto e le ricorrenze commerciali.
--
-- Prima fetta: solo le tabelle. Il generatore che le riempie arriva dopo,
-- e finché non arriva qui non succede niente — `period_shape` a `none` per
-- tutti tranne dove lo diciamo, e le due tabelle nuove vuote.
--
-- **La forma sta nel catalogo, non nel codice.** Un `switch (area)` avrebbe
-- funzionato oggi e sarebbe stato sbagliato domani: «Sito Web» sta in
-- Marketing e dura tre settimane, i mesi non gli servono, e l'E-commerce
-- potrebbe volere i mesi invece dei trimestri senza che nessuno debba
-- rilasciare. Il catalogo è già modificabile da admin: la forma va lì.
--
-- **I trimestri sono quelli della stagione, non del calendario** (§388):
-- Q1 gen-mar · Q2 apr-giu · Q3 lug-ago · Q4 **set-dic**. Non è una
-- stranezza: per chi fa advertising il blocco che conta va dal rientro al
-- Natale, e spezzarlo in due avrebbe diviso a metà la parte dell'anno in
-- cui si lavora di più. Lo dicono anche i dati: nove corsie in archivio si
-- chiamano «Set-Dic 2026» e nessuna si chiama «Q3».
--
-- Rilanciabile.

BEGIN;

-- ── che forma hanno i periodi di questo servizio ─────────────────────────

ALTER TABLE public.service_catalog
  ADD COLUMN IF NOT EXISTS period_shape text NOT NULL DEFAULT 'none';

DO $$ BEGIN
  ALTER TABLE public.service_catalog
    ADD CONSTRAINT service_catalog_period_shape_check
    CHECK (period_shape IN ('quarter','month','none'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN public.service_catalog.period_shape IS
  '§388 — quarter: il progetto ha i trimestri commerciali come workstream. month: i mesi come milestone. none: niente periodi, solo fasi e corsie a mano.';

UPDATE public.service_catalog SET period_shape = 'quarter'
  WHERE service_type IN ('lead_generation','ecommerce','saas');
UPDATE public.service_catalog SET period_shape = 'month'
  WHERE service_type IN ('social_media_management','continuing_design');

-- ── cosa è gia stato aperto ──────────────────────────────────────────────
--
-- Non si deduce dal nome della corsia: i nomi si cambiano, e alla prima
-- rinomina il generatore riaprirebbe lo stesso trimestre una seconda volta.

CREATE TABLE IF NOT EXISTS public.project_periods (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  -- '2026-Q4' oppure '2026-09'
  period_key    text NOT NULL,
  shape         text NOT NULL CHECK (shape IN ('quarter','month')),
  starts_on     date NOT NULL,
  ends_on       date NOT NULL,
  -- uno dei due, secondo la forma: il trimestre e una corsia, il mese una tappa
  workstream_id uuid REFERENCES public.project_workstreams(id) ON DELETE SET NULL,
  milestone_id  uuid REFERENCES public.milestones(id)          ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, period_key)
);

CREATE INDEX IF NOT EXISTS project_periods_progetto_idx
  ON public.project_periods (project_id, starts_on);

ALTER TABLE public.project_periods ENABLE ROW LEVEL SECURITY;

-- ── la libreria delle ricorrenze commerciali ─────────────────────────────

CREATE TABLE IF NOT EXISTS public.commercial_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         text NOT NULL UNIQUE,
  name         text NOT NULL,
  -- fisso:12-25 | ultimo:5:11 | ultimo:5:11+3 | nesimo:7:2:5 | pasqua+1 | manuale
  date_rule    text NOT NULL,
  -- quanti giorni prima si comincia a lavorarci: il Black Friday non si
  -- prepara il Black Friday
  lead_days    int  NOT NULL DEFAULT 45,
  -- dove si propone: {growth}, {marketing}, o tutte e due
  areas        text[] NOT NULL DEFAULT '{}',
  description  text,
  active       boolean NOT NULL DEFAULT true,
  sort_order   int NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Le date anno per anno. Quelle calcolabili le scrive il generatore, quelle
-- che nessuna formula sa — i saldi, che le Regioni fissano ogni anno — le
-- scrive una persona, e finché non lo fa la voce dice «data da confermare»
-- invece di inventarne una.
CREATE TABLE IF NOT EXISTS public.commercial_event_dates (
  event_id   uuid NOT NULL REFERENCES public.commercial_events(id) ON DELETE CASCADE,
  year       int  NOT NULL,
  event_date date,
  confirmed  boolean NOT NULL DEFAULT false,
  note       text,
  PRIMARY KEY (event_id, year)
);

ALTER TABLE public.commercial_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_event_dates ENABLE ROW LEVEL SECURITY;

-- Chi vede i progetti vede la libreria: e un elenco di feste, non un dato
-- sensibile. Scrive solo il service role, dalle action col gate.
DROP POLICY IF EXISTS commercial_events_leggo ON public.commercial_events;
CREATE POLICY commercial_events_leggo ON public.commercial_events FOR SELECT USING (true);
DROP POLICY IF EXISTS commercial_event_dates_leggo ON public.commercial_event_dates;
CREATE POLICY commercial_event_dates_leggo ON public.commercial_event_dates FOR SELECT USING (true);

INSERT INTO public.commercial_events (slug, name, date_rule, lead_days, areas, description, sort_order) VALUES
  ('black-friday',    'Black Friday',      'ultimo:5:11',    60, '{growth,marketing}', 'Ultimo venerdi di novembre.', 10),
  ('cyber-monday',    'Cyber Monday',      'ultimo:5:11+3',  60, '{growth}',           'Il lunedi dopo il Black Friday.', 20),
  ('natale',          'Natale',            'fisso:12-25',    75, '{growth,marketing}', NULL, 30),
  ('back-to-school',  'Back to school',    'fisso:09-01',    45, '{growth,marketing}', 'Il rientro: apre la stagione.', 40),
  ('san-valentino',   'San Valentino',     'fisso:02-14',    45, '{growth,marketing}', NULL, 50),
  ('festa-mamma',     'Festa della mamma', 'nesimo:7:2:5',   45, '{growth,marketing}', 'Seconda domenica di maggio.', 60),
  ('festa-papa',      'Festa del papa',    'fisso:03-19',    30, '{growth,marketing}', NULL, 70),
  ('pasqua',          'Pasqua',            'pasqua',         45, '{growth,marketing}', NULL, 80),
  ('saldi-invernali', 'Saldi invernali',   'manuale',        30, '{growth}',           'Le date le fissano le Regioni: vanno scritte ogni anno.', 90),
  ('saldi-estivi',    'Saldi estivi',      'manuale',        30, '{growth}',           'Le date le fissano le Regioni: vanno scritte ogni anno.', 100)
ON CONFLICT (slug) DO NOTHING;

COMMIT;

-- verifica: la forma sul catalogo, le tabelle nuove, la libreria seminata
SELECT
  (SELECT count(*) FROM public.service_catalog WHERE period_shape = 'quarter') AS a_trimestri,
  (SELECT count(*) FROM public.service_catalog WHERE period_shape = 'month')   AS a_mesi,
  (SELECT count(*) FROM public.service_catalog WHERE period_shape = 'none')    AS senza_periodi,
  (SELECT count(*) FROM public.commercial_events)                              AS ricorrenze,
  (SELECT count(*) FROM public.project_periods)                                AS periodi_aperti;
