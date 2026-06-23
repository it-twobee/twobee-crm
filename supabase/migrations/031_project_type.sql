-- Aggiunge tipologia progetto per i template
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS project_type TEXT DEFAULT 'custom'
  CHECK (project_type IN ('ecommerce','lead_gen','sito_web','app_ai','campagna','custom'));
