-- Asana integration: store GID on tasks for bidirectional sync
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS asana_gid TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS tasks_asana_gid_idx ON public.tasks(asana_gid) WHERE asana_gid IS NOT NULL;
