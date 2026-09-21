-- Estende portal-base solo nel database effimero del runner.
CREATE TABLE public.feedback(id uuid PRIMARY KEY,author_id uuid REFERENCES public.profiles(id));
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY feedback_read_staff ON public.feedback FOR SELECT TO authenticated USING(public.get_my_role() IN ('admin','team'));
GRANT SELECT ON public.feedback TO authenticated;
GRANT ALL ON public.feedback TO service_role;
