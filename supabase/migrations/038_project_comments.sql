CREATE TABLE IF NOT EXISTS public.project_comments (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id  UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  author_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  content     TEXT NOT NULL,
  is_client   BOOLEAN DEFAULT false,
  parent_id   UUID REFERENCES public.project_comments(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.project_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth users" ON public.project_comments
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
