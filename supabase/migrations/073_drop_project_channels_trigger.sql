-- Rimuove il trigger che causa "record new has no field created_by"
-- I canali progetto vengono creati via ensureProjectChannels() server action
DROP TRIGGER IF EXISTS on_project_created ON public.projects;
DROP FUNCTION IF EXISTS public.create_project_channels();
