-- ═══════════════════════════════════════════════════
-- AREA COMMERCIALE — Pipeline & Offerte
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.deals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  company_name TEXT NOT NULL,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  value NUMERIC(12,2),
  stage TEXT NOT NULL DEFAULT 'lead'
    CHECK (stage IN ('lead','contatto','proposta','trattativa','chiuso_vinto','chiuso_perso')),
  probability INTEGER DEFAULT 50 CHECK (probability BETWEEN 0 AND 100),
  expected_close DATE,
  source TEXT,
  notes TEXT,
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.deal_activities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('nota','chiamata','email','meeting','followup')),
  content TEXT NOT NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.quotes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  items JSONB DEFAULT '[]',
  total NUMERIC(12,2) DEFAULT 0,
  status TEXT DEFAULT 'bozza' CHECK (status IN ('bozza','inviata','accettata','rifiutata','scaduta')),
  valid_until DATE,
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deals_all" ON public.deals FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "deal_activities_all" ON public.deal_activities FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "quotes_all" ON public.quotes FOR ALL USING (auth.uid() IS NOT NULL);

-- ═══════════════════════════════════════════════════
-- AREA FATTURAZIONE — Solleciti & auto
-- ═══════════════════════════════════════════════════
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS due_date DATE,
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS description TEXT;

-- ═══════════════════════════════════════════════════
-- AREA OPERATIVA — Task templates & ricorrenti
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.task_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  service_type TEXT NOT NULL CHECK (service_type IN ('growth','digital','entrambi')),
  tasks JSONB DEFAULT '[]',
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS recurrence TEXT CHECK (recurrence IN ('settimanale','mensile','quindicinale')),
  ADD COLUMN IF NOT EXISTS recurrence_end DATE,
  ADD COLUMN IF NOT EXISTS depends_on UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES public.task_templates(id) ON DELETE SET NULL;

ALTER TABLE public.task_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "task_templates_all" ON public.task_templates FOR ALL USING (auth.uid() IS NOT NULL);

-- ═══════════════════════════════════════════════════
-- AREA CUSTOMER CARE — Ticket & SLA
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.tickets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'aperto' CHECK (status IN ('aperto','in_lavorazione','in_attesa','risolto','chiuso')),
  priority TEXT DEFAULT 'normale' CHECK (priority IN ('bassa','normale','alta','urgente')),
  category TEXT CHECK (category IN ('tecnico','billing','strategia','altro')),
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  sla_hours INTEGER DEFAULT 24,
  first_response_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  source TEXT DEFAULT 'manuale' CHECK (source IN ('manuale','email','chat')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ticket_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT FALSE,
  sender_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tickets_all" ON public.tickets FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "ticket_messages_all" ON public.ticket_messages FOR ALL USING (auth.uid() IS NOT NULL);
