-- ============================================================
-- TWO BEE GESTIONALE — Schema iniziale
-- ============================================================

-- PROFILI UTENTE (estende auth.users di Supabase)
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users PRIMARY KEY,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'team', 'client', 'guest')),
  avatar_url TEXT,
  email TEXT NOT NULL,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- CLIENTI
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  package TEXT NOT NULL CHECK (package IN (
    'Worker Bee Start', 'Worker Bee Basic',
    'Hive Basic', 'Hive Custom',
    'Royal Queen', 'IT Digital Partner', 'Partner Quota'
  )),
  mrr NUMERIC(10,2) NOT NULL,
  contract_start DATE NOT NULL,
  contract_end DATE NOT NULL,
  payment_status TEXT NOT NULL CHECK (payment_status IN ('pagato', 'in_attesa', 'scaduto')),
  active_channels TEXT[] DEFAULT '{}',
  status TEXT NOT NULL CHECK (status IN ('verde', 'giallo', 'rosso')) DEFAULT 'verde',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES public.profiles(id)
);

-- REFERENTI CLIENTE
CREATE TABLE public.client_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  role TEXT,
  is_primary BOOLEAN DEFAULT FALSE
);

-- ASSEGNAZIONI TEAM → CLIENTE
CREATE TABLE public.client_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  UNIQUE(client_id, profile_id)
);

-- PROGETTI
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT CHECK (status IN ('attivo', 'in_pausa', 'completato', 'archiviato')) DEFAULT 'attivo',
  sprint_current INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- SPRINT
CREATE TABLE public.sprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT CHECK (status IN ('pianificato', 'in_corso', 'completato')) DEFAULT 'pianificato'
);

-- TASK
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  sprint_id UUID REFERENCES public.sprints(id),
  title TEXT NOT NULL,
  description TEXT,
  assignee_id UUID REFERENCES public.profiles(id),
  priority TEXT CHECK (priority IN ('alta', 'media', 'bassa')) DEFAULT 'media',
  status TEXT CHECK (status IN ('da_fare', 'in_corso', 'in_revisione', 'completato')) DEFAULT 'da_fare',
  due_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES public.profiles(id)
);

-- MEETING NOTES
CREATE TABLE public.meeting_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id),
  title TEXT NOT NULL,
  date TIMESTAMPTZ NOT NULL,
  attendees TEXT[],
  summary TEXT NOT NULL,
  decisions TEXT,
  next_actions TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- KPI MENSILI
CREATE TABLE public.client_kpis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  month DATE NOT NULL,
  roas NUMERIC(6,2),
  cpl NUMERIC(10,2),
  cpa NUMERIC(10,2),
  leads_generated INTEGER,
  conversion_rate NUMERIC(5,2),
  revenue_attributed NUMERIC(12,2),
  ad_spend NUMERIC(12,2),
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id),
  UNIQUE(client_id, month)
);

-- DOCUMENTI
CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id),
  name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT,
  uploaded_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- CANALI CHAT
CREATE TABLE public.chat_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT CHECK (type IN ('cliente', 'interno', 'task')) NOT NULL,
  client_id UUID REFERENCES public.clients(id),
  task_id UUID REFERENCES public.tasks(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- MESSAGGI CHAT
CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES public.profiles(id),
  content TEXT NOT NULL,
  attachments TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  edited_at TIMESTAMPTZ,
  is_deleted BOOLEAN DEFAULT FALSE
);

-- PARTECIPANTI AI CANALI
CREATE TABLE public.channel_members (
  channel_id UUID REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (channel_id, profile_id)
);

-- NOTIFICHE
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_kpis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Helper function: ottieni il ruolo dell'utente corrente
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- Helper function: i client_id assegnati all'utente corrente
CREATE OR REPLACE FUNCTION public.get_my_client_ids()
RETURNS UUID[] AS $$
  SELECT ARRAY(
    SELECT client_id FROM public.client_assignments WHERE profile_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Helper function: client_id dell'utente client (se ruolo = 'client')
CREATE OR REPLACE FUNCTION public.get_my_client_id_as_client()
RETURNS UUID AS $$
  SELECT client_id FROM public.client_assignments
  WHERE profile_id = auth.uid()
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;

-- PROFILES
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT USING (
    auth.uid() = id OR public.get_my_role() IN ('admin', 'team')
  );

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- CLIENTS
CREATE POLICY "clients_admin_all" ON public.clients
  FOR ALL USING (public.get_my_role() = 'admin');

CREATE POLICY "clients_team_assigned" ON public.clients
  FOR SELECT USING (
    public.get_my_role() = 'team' AND
    id = ANY(public.get_my_client_ids())
  );

CREATE POLICY "clients_client_own" ON public.clients
  FOR SELECT USING (
    public.get_my_role() IN ('client', 'guest') AND
    id = public.get_my_client_id_as_client()
  );

-- CLIENT CONTACTS
CREATE POLICY "client_contacts_admin" ON public.client_contacts
  FOR ALL USING (public.get_my_role() = 'admin');

CREATE POLICY "client_contacts_team" ON public.client_contacts
  FOR SELECT USING (
    public.get_my_role() = 'team' AND
    client_id = ANY(public.get_my_client_ids())
  );

CREATE POLICY "client_contacts_client" ON public.client_contacts
  FOR SELECT USING (
    public.get_my_role() IN ('client', 'guest') AND
    client_id = public.get_my_client_id_as_client()
  );

-- CLIENT ASSIGNMENTS
CREATE POLICY "assignments_admin" ON public.client_assignments
  FOR ALL USING (public.get_my_role() = 'admin');

CREATE POLICY "assignments_view_own" ON public.client_assignments
  FOR SELECT USING (profile_id = auth.uid());

-- PROJECTS
CREATE POLICY "projects_admin" ON public.projects
  FOR ALL USING (public.get_my_role() = 'admin');

CREATE POLICY "projects_team" ON public.projects
  FOR SELECT USING (
    public.get_my_role() = 'team' AND
    client_id = ANY(public.get_my_client_ids())
  );

CREATE POLICY "projects_client" ON public.projects
  FOR SELECT USING (
    public.get_my_role() IN ('client', 'guest') AND
    client_id = public.get_my_client_id_as_client()
  );

-- SPRINTS
CREATE POLICY "sprints_admin" ON public.sprints
  FOR ALL USING (public.get_my_role() = 'admin');

CREATE POLICY "sprints_team" ON public.sprints
  FOR SELECT USING (
    public.get_my_role() = 'team' AND
    project_id IN (
      SELECT id FROM public.projects WHERE client_id = ANY(public.get_my_client_ids())
    )
  );

CREATE POLICY "sprints_client" ON public.sprints
  FOR SELECT USING (
    public.get_my_role() IN ('client', 'guest') AND
    project_id IN (
      SELECT id FROM public.projects WHERE client_id = public.get_my_client_id_as_client()
    )
  );

-- TASKS
CREATE POLICY "tasks_admin" ON public.tasks
  FOR ALL USING (public.get_my_role() = 'admin');

CREATE POLICY "tasks_team_read_write" ON public.tasks
  FOR ALL USING (
    public.get_my_role() = 'team' AND
    project_id IN (
      SELECT id FROM public.projects WHERE client_id = ANY(public.get_my_client_ids())
    )
  );

CREATE POLICY "tasks_client" ON public.tasks
  FOR SELECT USING (
    public.get_my_role() IN ('client', 'guest') AND
    project_id IN (
      SELECT id FROM public.projects WHERE client_id = public.get_my_client_id_as_client()
    )
  );

-- MEETING NOTES
CREATE POLICY "meeting_notes_admin" ON public.meeting_notes
  FOR ALL USING (public.get_my_role() = 'admin');

CREATE POLICY "meeting_notes_team" ON public.meeting_notes
  FOR ALL USING (
    public.get_my_role() = 'team' AND
    client_id = ANY(public.get_my_client_ids())
  );

CREATE POLICY "meeting_notes_client" ON public.meeting_notes
  FOR SELECT USING (
    public.get_my_role() IN ('client', 'guest') AND
    client_id = public.get_my_client_id_as_client()
  );

-- CLIENT KPIS
CREATE POLICY "kpis_admin" ON public.client_kpis
  FOR ALL USING (public.get_my_role() = 'admin');

CREATE POLICY "kpis_team" ON public.client_kpis
  FOR ALL USING (
    public.get_my_role() = 'team' AND
    client_id = ANY(public.get_my_client_ids())
  );

CREATE POLICY "kpis_client" ON public.client_kpis
  FOR SELECT USING (
    public.get_my_role() IN ('client', 'guest') AND
    client_id = public.get_my_client_id_as_client()
  );

-- DOCUMENTS
CREATE POLICY "documents_admin" ON public.documents
  FOR ALL USING (public.get_my_role() = 'admin');

CREATE POLICY "documents_team" ON public.documents
  FOR ALL USING (
    public.get_my_role() = 'team' AND
    client_id = ANY(public.get_my_client_ids())
  );

CREATE POLICY "documents_client" ON public.documents
  FOR SELECT USING (
    public.get_my_role() IN ('client', 'guest') AND
    client_id = public.get_my_client_id_as_client()
  );

-- CHAT CHANNELS
CREATE POLICY "channels_admin" ON public.chat_channels
  FOR ALL USING (public.get_my_role() = 'admin');

CREATE POLICY "channels_team_internal" ON public.chat_channels
  FOR SELECT USING (
    public.get_my_role() = 'team' AND (
      type = 'interno' OR
      (type = 'cliente' AND client_id = ANY(public.get_my_client_ids()))
    )
  );

CREATE POLICY "channels_client_own" ON public.chat_channels
  FOR SELECT USING (
    public.get_my_role() = 'client' AND
    type = 'cliente' AND
    client_id = public.get_my_client_id_as_client()
  );

-- CHAT MESSAGES
CREATE POLICY "messages_admin" ON public.chat_messages
  FOR ALL USING (public.get_my_role() = 'admin');

CREATE POLICY "messages_members" ON public.chat_messages
  FOR SELECT USING (
    channel_id IN (
      SELECT channel_id FROM public.channel_members WHERE profile_id = auth.uid()
    )
  );

CREATE POLICY "messages_insert_members" ON public.chat_messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid() AND
    channel_id IN (
      SELECT channel_id FROM public.channel_members WHERE profile_id = auth.uid()
    )
  );

-- CHANNEL MEMBERS
CREATE POLICY "channel_members_admin" ON public.channel_members
  FOR ALL USING (public.get_my_role() = 'admin');

CREATE POLICY "channel_members_view_own" ON public.channel_members
  FOR SELECT USING (profile_id = auth.uid());

-- NOTIFICATIONS
CREATE POLICY "notifications_own" ON public.notifications
  FOR ALL USING (profile_id = auth.uid());

-- ============================================================
-- TRIGGER: crea profilo automaticamente dopo signup
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'role', 'team')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Indici per performance
CREATE INDEX idx_tasks_project ON public.tasks(project_id);
CREATE INDEX idx_tasks_assignee ON public.tasks(assignee_id);
CREATE INDEX idx_tasks_due_date ON public.tasks(due_date);
CREATE INDEX idx_tasks_status ON public.tasks(status);
CREATE INDEX idx_messages_channel ON public.chat_messages(channel_id, created_at DESC);
CREATE INDEX idx_notifications_profile ON public.notifications(profile_id, read, created_at DESC);
CREATE INDEX idx_kpis_client_month ON public.client_kpis(client_id, month DESC);
CREATE INDEX idx_assignments_profile ON public.client_assignments(profile_id);
CREATE INDEX idx_assignments_client ON public.client_assignments(client_id);
