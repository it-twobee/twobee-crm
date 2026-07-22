-- FASE 4 (fix) — L'indice unico delle occorrenze non può essere parziale.
--
-- La 129 lo aveva creato con `WHERE routine_id IS NOT NULL`. Per un indice
-- parziale Postgres pretende che l'ON CONFLICT ripeta lo stesso predicato, e
-- PostgREST non sa esprimerlo: `upsert(onConflict: 'routine_id,period_key')`
-- falliva con 42P10 al primo click sul pulsante "Genera".
--
-- Il WHERE era superfluo: in un indice unico i NULL sono distinti fra loro,
-- quindi le migliaia di task senza routine non collidono comunque.

DROP INDEX IF EXISTS uq_tasks_routine_period;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tasks_routine_period
  ON public.tasks(routine_id, period_key);

SELECT indexname, indexdef FROM pg_indexes
WHERE tablename = 'tasks' AND indexname = 'uq_tasks_routine_period';
