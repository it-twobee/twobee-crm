'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export interface PortalInfo {
  portal_id: string
  client_id: string
  company_name: string
}

export interface PortalTicket {
  id: string
  title: string
  description: string | null
  status: string
  priority: string
  category: string | null
  submitted_by_guest: boolean
  guest_name: string | null
  guest_email: string | null
  created_at: string
  updated_at: string
}

export interface PortalMessage {
  id: string
  content: string
  is_internal: boolean
  sender_id: string | null
  guest_name: string | null
  created_at: string
}

// Team: genera o recupera portal token per cliente
export async function getOrCreatePortal(clientId: string): Promise<{ token: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autorizzato' }

  const sb = serviceClient()
  const { data: existing } = await sb.from('ticket_portals').select('token').eq('client_id', clientId).single()
  if (existing) return { token: existing.token }

  const { data, error } = await sb.from('ticket_portals').insert({ client_id: clientId }).select('token').single()
  if (error) return { error: error.message }
  return { token: data.token }
}

// Guest: recupera info portale da token
export async function getPortalInfo(token: string): Promise<PortalInfo | null> {
  const sb = serviceClient()
  const { data } = await sb.rpc('get_portal_by_token', { p_token: token })
  return data?.[0] ?? null
}

// Guest: recupera ticket del portale
export async function getPortalTickets(token: string): Promise<PortalTicket[]> {
  const sb = serviceClient()
  const { data } = await sb.rpc('get_portal_tickets', { p_token: token })
  return data ?? []
}

// Guest: crea nuovo ticket
export async function createPortalTicket(
  token: string,
  title: string,
  description: string,
  priority: string,
  category: string,
  guestName: string,
  guestEmail: string
): Promise<{ id: string } | { error: string }> {
  if (!title.trim()) return { error: 'Titolo obbligatorio' }
  if (!guestName.trim()) return { error: 'Nome obbligatorio' }
  const sb = serviceClient()
  const { data, error } = await sb.rpc('create_portal_ticket', {
    p_token: token,
    p_title: title.trim(),
    p_description: description.trim() || null,
    p_priority: priority,
    p_category: category,
    p_guest_name: guestName.trim(),
    p_guest_email: guestEmail.trim(),
  })
  if (error) return { error: error.message }
  return { id: data }
}

// Guest: recupera messaggi ticket
export async function getPortalTicketMessages(token: string, ticketId: string): Promise<PortalMessage[]> {
  const sb = serviceClient()
  const { data } = await sb.rpc('get_portal_ticket_messages', { p_token: token, p_ticket_id: ticketId })
  return data ?? []
}

// Guest: aggiungi messaggio
export async function addPortalTicketMessage(
  token: string,
  ticketId: string,
  content: string,
  guestName: string,
  guestEmail: string
): Promise<{ id: string } | { error: string }> {
  if (!content.trim()) return { error: 'Messaggio vuoto' }
  const sb = serviceClient()
  const { data, error } = await sb.rpc('add_portal_ticket_message', {
    p_token: token,
    p_ticket_id: ticketId,
    p_content: content.trim(),
    p_guest_name: guestName,
    p_guest_email: guestEmail,
  })
  if (error) return { error: error.message }
  return { id: data }
}
