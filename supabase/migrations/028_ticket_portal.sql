-- Portali ticket per clienti (magic link, no auth)
CREATE TABLE IF NOT EXISTS public.ticket_portals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  token UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT ticket_portals_client_unique UNIQUE (client_id)
);

-- Aggiungiamo campi ai ticket per supporto guest
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS submitted_by_guest BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS guest_name TEXT,
  ADD COLUMN IF NOT EXISTS guest_email TEXT;

-- Aggiungiamo campi ai ticket_messages per risposte guest
ALTER TABLE public.ticket_messages
  ADD COLUMN IF NOT EXISTS guest_name TEXT,
  ADD COLUMN IF NOT EXISTS guest_email TEXT;

-- RLS per portali
ALTER TABLE public.ticket_portals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ticket_portals_team" ON public.ticket_portals FOR ALL USING (auth.uid() IS NOT NULL);

-- Funzione: recupera dati portale per token (SECURITY DEFINER per guest access)
CREATE OR REPLACE FUNCTION get_portal_by_token(p_token UUID)
RETURNS TABLE(
  portal_id UUID,
  client_id UUID,
  company_name TEXT
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT tp.id, tp.client_id, c.company_name
  FROM public.ticket_portals tp
  JOIN public.clients c ON c.id = tp.client_id
  WHERE tp.token = p_token
  LIMIT 1;
$$;

-- Funzione: recupera ticket per token portale
CREATE OR REPLACE FUNCTION get_portal_tickets(p_token UUID)
RETURNS TABLE(
  id UUID,
  title TEXT,
  description TEXT,
  status TEXT,
  priority TEXT,
  category TEXT,
  submitted_by_guest BOOLEAN,
  guest_name TEXT,
  guest_email TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT t.id, t.title, t.description, t.status, t.priority, t.category,
         t.submitted_by_guest, t.guest_name, t.guest_email, t.created_at, t.updated_at
  FROM public.tickets t
  JOIN public.ticket_portals tp ON tp.client_id = t.client_id
  WHERE tp.token = p_token
  ORDER BY t.created_at DESC;
$$;

-- Funzione: crea ticket da portale guest
CREATE OR REPLACE FUNCTION create_portal_ticket(
  p_token UUID,
  p_title TEXT,
  p_description TEXT,
  p_priority TEXT,
  p_category TEXT,
  p_guest_name TEXT,
  p_guest_email TEXT
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_client_id UUID;
  v_ticket_id UUID;
BEGIN
  SELECT client_id INTO v_client_id FROM public.ticket_portals WHERE token = p_token;
  IF v_client_id IS NULL THEN RAISE EXCEPTION 'Invalid token'; END IF;

  INSERT INTO public.tickets (
    client_id, title, description, priority, category,
    submitted_by_guest, guest_name, guest_email,
    status, sla_hours, source
  ) VALUES (
    v_client_id, p_title, p_description, p_priority, p_category,
    TRUE, p_guest_name, p_guest_email,
    'aperto', 24, 'manuale'
  ) RETURNING id INTO v_ticket_id;

  RETURN v_ticket_id;
END;
$$;

-- Funzione: recupera messaggi ticket (verifica token ownership)
CREATE OR REPLACE FUNCTION get_portal_ticket_messages(p_token UUID, p_ticket_id UUID)
RETURNS TABLE(
  id UUID,
  content TEXT,
  is_internal BOOLEAN,
  sender_id UUID,
  guest_name TEXT,
  created_at TIMESTAMPTZ
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT tm.id, tm.content, tm.is_internal, tm.sender_id, tm.guest_name, tm.created_at
  FROM public.ticket_messages tm
  JOIN public.tickets t ON t.id = tm.ticket_id
  JOIN public.ticket_portals tp ON tp.client_id = t.client_id
  WHERE tp.token = p_token AND tm.ticket_id = p_ticket_id
    AND (tm.is_internal = FALSE OR tm.is_internal IS NULL)
  ORDER BY tm.created_at;
$$;

-- Funzione: aggiungi messaggio a ticket da portale guest
CREATE OR REPLACE FUNCTION add_portal_ticket_message(
  p_token UUID,
  p_ticket_id UUID,
  p_content TEXT,
  p_guest_name TEXT,
  p_guest_email TEXT
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_client_id UUID;
  v_msg_id UUID;
BEGIN
  SELECT t.client_id INTO v_client_id
  FROM public.tickets t
  JOIN public.ticket_portals tp ON tp.client_id = t.client_id
  WHERE tp.token = p_token AND t.id = p_ticket_id;

  IF v_client_id IS NULL THEN RAISE EXCEPTION 'Invalid token or ticket'; END IF;

  INSERT INTO public.ticket_messages (ticket_id, content, is_internal, guest_name, guest_email)
  VALUES (p_ticket_id, p_content, FALSE, p_guest_name, p_guest_email)
  RETURNING id INTO v_msg_id;

  RETURN v_msg_id;
END;
$$;
