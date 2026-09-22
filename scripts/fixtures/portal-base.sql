-- Solo struttura minima per i test isolati: non è uno schema di produzione.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
$$;
CREATE TABLE public.profiles(id uuid PRIMARY KEY REFERENCES auth.users(id),email text,full_name text,
  role text DEFAULT 'guest',app_role text DEFAULT 'guest',is_active boolean DEFAULT true);
CREATE FUNCTION public.fixture_profile() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN INSERT INTO public.profiles(id,email) VALUES(NEW.id,NEW.email); RETURN NEW; END;
$$;
CREATE TRIGGER fixture_profile AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.fixture_profile();
CREATE FUNCTION public.get_my_role() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM public.profiles WHERE id=auth.uid();
$$;
CREATE TABLE public.clients(id uuid PRIMARY KEY,company_name text,display_name text,workspace_hidden boolean DEFAULT false,
  client_label text DEFAULT 'stabile',package text,mrr numeric,contract_start date,contract_end date,payment_status text,notes text);
CREATE TABLE public.projects(id uuid PRIMARY KEY,client_id uuid REFERENCES public.clients(id),name text,area text,status text DEFAULT 'active',
  service_type text,manager_id uuid REFERENCES public.profiles(id),visibility text,deleted_at timestamptz);
CREATE TABLE public.documents(id uuid PRIMARY KEY,client_id uuid REFERENCES public.clients(id),name text,file_url text);
CREATE TABLE public.tasks(id uuid PRIMARY KEY,client_id uuid REFERENCES public.clients(id),project_id uuid REFERENCES public.projects(id),
  task_type text DEFAULT 'ad_hoc',title text DEFAULT 'task',description text,status text DEFAULT 'da_fare',
  due_date date,visibility text,created_by uuid REFERENCES public.profiles(id),deleted_at timestamptz);
CREATE TABLE public.project_workstreams(id uuid PRIMARY KEY);
CREATE TABLE public.milestones(id uuid PRIMARY KEY);
CREATE TABLE public.task_comments(id uuid PRIMARY KEY);
CREATE TABLE public.client_kpis(id uuid PRIMARY KEY);
CREATE TABLE public.client_contacts(id uuid PRIMARY KEY);
CREATE TABLE public.chat_channels(id uuid PRIMARY KEY);
CREATE TABLE public.chat_messages(id uuid PRIMARY KEY);
GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['clients','projects','documents','tasks','project_workstreams','milestones','task_comments','client_kpis','client_contacts','chat_channels','chat_messages'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('CREATE POLICY fixture_legacy_read ON public.%I FOR SELECT TO authenticated USING(true)',t);
  END LOOP;
END $$;
