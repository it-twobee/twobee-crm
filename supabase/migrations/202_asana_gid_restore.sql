-- ═══════════════════════════════════════════════════════════════════════════
-- §222 · Le ancore di Asana, che il reset si era portato via
-- ═══════════════════════════════════════════════════════════════════════════
--
-- La **003** aveva aggiunto `tasks.asana_gid` e la **113** `projects.asana_gid`,
-- con un indice unico parziale su ciascuna. Il reset del dominio progetto
-- (2026-07-23, migration 146) ha ricreato entrambe le tabelle da zero, e quelle
-- due colonne sono cadute con tutto il resto: il registro delle migration le
-- elenca ancora come applicate, perché applicate lo erano — prima.
--
-- **A cosa servono.** Sono l'unica cosa che rende il travaso da Asana
-- ripetibile: senza, rilanciare l'import crea di nuovo le stesse task, e non
-- c'è modo di sapere quali erano già entrate. Con l'indice unico il database
-- stesso impedisce il doppione, e il codice può limitarsi a saltare quelle già
-- presenti contandole invece di far fallire il lotto.
--
-- L'indice è **parziale** (`WHERE ... IS NOT NULL`) perché la quasi totalità
-- delle righe non viene da Asana: un indice unico pieno tratterebbe migliaia di
-- NULL come valori da confrontare, e in Postgres i NULL non collidono ma
-- l'indice li memorizza lo stesso — spazio speso per niente.
--
-- Temporanee come la sezione che le usa: quando Asana è chiuso si droppano
-- insieme a `/asana`.
--
-- Idempotente: si può rilanciare.

-- Prima: NULL su entrambe = non ci sono
SELECT
  to_regclass('public.tasks')    AS tabella_tasks,
  to_regclass('public.projects') AS tabella_projects;

ALTER TABLE public.tasks    ADD COLUMN IF NOT EXISTS asana_gid TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS asana_gid TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS tasks_asana_gid_idx
  ON public.tasks(asana_gid) WHERE asana_gid IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS projects_asana_gid_idx
  ON public.projects(asana_gid) WHERE asana_gid IS NOT NULL;

COMMENT ON COLUMN public.tasks.asana_gid IS
  '§222 — il gid della task su Asana da cui questa è nata. Unica (indice parziale): è ciò che rende il travaso ripetibile senza duplicare. Temporanea, si droppa con la sezione /asana.';
COMMENT ON COLUMN public.projects.asana_gid IS
  '§222 — il gid della board Asana da cui questo progetto è nato. Vedi tasks.asana_gid.';

-- Senza questo le colonne ci sono e l'API continua a non vederle
NOTIFY pgrst, 'reload schema';

-- Dopo: devono comparire entrambe
SELECT column_name, table_name
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND column_name = 'asana_gid'
 ORDER BY table_name;
