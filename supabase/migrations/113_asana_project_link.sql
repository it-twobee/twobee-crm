-- Import massivo da Asana: lega il progetto TwoBee al progetto Asana di origine.
-- Senza questa colonna l'import non è ripetibile: rilanciarlo creerebbe progetti
-- duplicati (i task erano già protetti da tasks.asana_gid, migration 003).
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS asana_gid TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS projects_asana_gid_idx
  ON public.projects(asana_gid) WHERE asana_gid IS NOT NULL;
