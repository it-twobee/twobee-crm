-- ============================================================
-- TWO BEE — Migration 002: Schema esteso
-- ============================================================

-- Aggiungi tipo e label cliente
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS client_type TEXT CHECK (client_type IN ('growth', 'digital')) DEFAULT 'growth',
  ADD COLUMN IF NOT EXISTS client_label TEXT CHECK (client_label IN ('stabile', 'in_bilico', 'perso', 'partner')) DEFAULT 'stabile';

-- CICLO DI FATTURAZIONE
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  month DATE NOT NULL,                          -- primo giorno del mese (es: 2026-06-01)
  amount NUMERIC(10,2) NOT NULL,
  invoice_number TEXT,                          -- numero fattura
  sent_at TIMESTAMPTZ,                          -- data invio fattura
  paid_at TIMESTAMPTZ,                          -- data pagamento
  status TEXT CHECK (status IN ('da_inviare', 'inviata', 'pagata', 'in_ritardo')) DEFAULT 'da_inviare',
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, month)
);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoices_admin" ON public.invoices
  FOR ALL USING (public.get_my_role() = 'admin');

CREATE POLICY "invoices_team_read" ON public.invoices
  FOR SELECT USING (
    public.get_my_role() = 'team' AND
    client_id = ANY(public.get_my_client_ids())
  );

-- STAKEHOLDERS (owner, stakeholder, collaboratore esterno)
CREATE TABLE IF NOT EXISTS public.client_stakeholders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL CHECK (role IN ('owner', 'stakeholder', 'collaboratore_esterno', 'agenzia_supporto')),
  company TEXT,                                 -- per collaboratori esterni/agenzie
  piva TEXT,                                    -- partita IVA esterna
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.client_stakeholders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stakeholders_admin" ON public.client_stakeholders
  FOR ALL USING (public.get_my_role() = 'admin');

CREATE POLICY "stakeholders_team" ON public.client_stakeholders
  FOR SELECT USING (
    public.get_my_role() = 'team' AND
    client_id = ANY(public.get_my_client_ids())
  );

-- SUBTASK (2 livelli: subtask di task, e sub-subtask di subtask)
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS parent_task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS depth INTEGER DEFAULT 0 CHECK (depth IN (0, 1, 2));
  -- 0 = task principale, 1 = subtask, 2 = sub-subtask

CREATE INDEX IF NOT EXISTS idx_tasks_parent ON public.tasks(parent_task_id);

-- ALLEGATI CHAT
CREATE TABLE IF NOT EXISTS public.chat_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER,
  file_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.chat_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attachments_members" ON public.chat_attachments
  FOR SELECT USING (
    message_id IN (
      SELECT id FROM public.chat_messages
      WHERE channel_id IN (
        SELECT channel_id FROM public.channel_members WHERE profile_id = auth.uid()
      )
    )
  );

-- MENZIONI CHAT
CREATE TABLE IF NOT EXISTS public.chat_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.chat_mentions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mentions_own" ON public.chat_mentions
  FOR ALL USING (profile_id = auth.uid());

-- Indici performance
CREATE INDEX IF NOT EXISTS idx_invoices_client_month ON public.invoices(client_id, month DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_stakeholders_client ON public.client_stakeholders(client_id);

-- Aggiorna seed: aggiungi client_type e label ai clienti esistenti
UPDATE public.clients SET client_type = 'growth', client_label = 'stabile' WHERE client_type IS NULL;
