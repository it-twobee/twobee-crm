'use server'

import { createClient } from '@/lib/supabase/server'

export type TicketUrgency = 'bassa' | 'normale' | 'alta' | 'urgente'
export type TicketCategory = 'tecnico' | 'billing' | 'strategia' | 'altro'

export interface GuestTicket {
  id: string
  title: string
  description: string | null
  status: string
  priority: string
  category: string | null
  created_at: string
  updated_at: string
}

export interface GuestTicketMessage {
  id: string
  content: string
  is_internal: boolean
  sender_id: string | null
  guest_name?: string | null
  sender_name?: string | null
  created_at: string
}

// Crea ticket direttamente dalla chat (guest già autenticato)
export async function createTicketFromChat(
  channelId: string,
  title: string,
  description: string,
  priority: TicketUrgency,
  category: TicketCategory,
): Promise<{ ticketId: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  if (!title.trim()) return { error: 'Titolo obbligatorio' }

  // Recupera client_id dal canale
  const { data: channel } = await supabase
    .from('chat_channels')
    .select('client_id, name')
    .eq('id', channelId)
    .single()

  if (!channel?.client_id) return { error: 'Canale non associato a un cliente' }

  // Crea ticket
  const { data: ticket, error: ticketError } = await supabase
    .from('tickets')
    .insert({
      client_id: channel.client_id,
      title: title.trim(),
      description: description.trim() || null,
      priority,
      category,
      status: 'aperto',
      sla_hours: priority === 'urgente' ? 4 : priority === 'alta' ? 8 : 24,
      source: 'chat',
      created_by: user.id,
      submitted_by_guest: true,
    })
    .select('id')
    .single()

  if (ticketError || !ticket) return { error: ticketError?.message ?? 'Errore creazione ticket' }

  // Posta messaggio sistema nella chat
  const urgencyEmoji: Record<TicketUrgency, string> = { urgente: '🔴', alta: '🟠', normale: '🔵', bassa: '🟢' }
  const urgencyLabel: Record<TicketUrgency, string> = { urgente: 'Urgente', alta: 'Alta', normale: 'Normale', bassa: 'Bassa' }

  const systemContent = `__TICKET__${JSON.stringify({
    ticketId: ticket.id,
    title: title.trim(),
    priority,
    category,
    emoji: urgencyEmoji[priority],
    priorityLabel: urgencyLabel[priority],
  })}`

  await supabase.from('chat_messages').insert({
    channel_id: channelId,
    sender_id: user.id,
    content: systemContent,
    is_deleted: false,
    is_pinned: false,
  })

  return { ticketId: ticket.id }
}

// Recupera ticket del guest corrente per un dato client
export async function getMyTickets(clientId: string): Promise<GuestTicket[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('tickets')
    .select('id, title, description, status, priority, category, created_at, updated_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(50)

  return data ?? []
}

// Recupera messaggi di un ticket (filtrando le note interne)
export async function getTicketMessages(ticketId: string): Promise<GuestTicketMessage[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('ticket_messages')
    .select('*, sender:profiles!ticket_messages_sender_id_fkey(full_name)')
    .eq('ticket_id', ticketId)
    .order('created_at')

  return (data ?? [])
    .filter((m: { is_internal: boolean }) => !m.is_internal)
    .map((m: { id: string; content: string; is_internal: boolean; sender_id: string | null; guest_name: string | null; sender: { full_name: string } | null; created_at: string }) => ({
      id: m.id,
      content: m.content,
      is_internal: m.is_internal,
      sender_id: m.sender_id,
      guest_name: m.guest_name,
      sender_name: m.sender?.full_name ?? null,
      created_at: m.created_at,
    }))
}

// ─── Admin actions ────────────────────────────────────────────────────────────

export interface AdminTicket {
  id: string
  title: string
  description: string | null
  status: string
  priority: string
  category: string | null
  submitted_by_guest: boolean
  guest_name: string | null
  guest_email: string | null
  assigned_to: string | null
  assignee_name: string | null
  sla_hours: number
  first_response_at: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
}

export interface AdminTicketMessage {
  id: string
  content: string
  is_internal: boolean
  sender_id: string | null
  sender_name: string | null
  guest_name: string | null
  created_at: string
}

// Admin: recupera tutti i ticket di un cliente
export async function getClientTickets(clientId: string): Promise<AdminTicket[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('tickets')
    .select(`
      id, title, description, status, priority, category,
      submitted_by_guest, guest_name, guest_email,
      assigned_to, sla_hours, first_response_at, resolved_at, created_at, updated_at,
      assignee:profiles!tickets_assigned_to_fkey(full_name)
    `)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(100)

  return (data ?? []).map((t: Record<string, unknown>) => ({
    ...(t as Omit<AdminTicket, 'assignee_name'>),
    assignee_name: (t.assignee as { full_name: string } | null)?.full_name ?? null,
  }))
}

// Admin: recupera messaggi ticket incluse note interne
export async function getAdminTicketMessages(ticketId: string): Promise<AdminTicketMessage[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('ticket_messages')
    .select('*, sender:profiles!ticket_messages_sender_id_fkey(full_name)')
    .eq('ticket_id', ticketId)
    .order('created_at')

  return (data ?? []).map((m: Record<string, unknown>) => ({
    id: m.id as string,
    content: m.content as string,
    is_internal: m.is_internal as boolean,
    sender_id: m.sender_id as string | null,
    sender_name: (m.sender as { full_name: string } | null)?.full_name ?? null,
    guest_name: m.guest_name as string | null,
    created_at: m.created_at as string,
  }))
}

// Admin: cambia stato ticket
export async function adminUpdateTicketStatus(
  ticketId: string,
  status: string,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const updates: Record<string, unknown> = { status }
  if (status === 'risolto') updates.resolved_at = new Date().toISOString()

  const { error } = await supabase.from('tickets').update(updates).eq('id', ticketId)
  return error ? { error: error.message } : {}
}

// Admin: assegna ticket
export async function adminAssignTicket(
  ticketId: string,
  assignedTo: string | null,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { error } = await supabase.from('tickets').update({ assigned_to: assignedTo }).eq('id', ticketId)
  return error ? { error: error.message } : {}
}

// Admin: risposta con opzione nota interna
export async function adminReplyTicket(
  ticketId: string,
  content: string,
  isInternal: boolean,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { error } = await supabase.from('ticket_messages').insert({
    ticket_id: ticketId,
    content: content.trim(),
    is_internal: isInternal,
    sender_id: user.id,
  })

  if (!error && !isInternal) {
    const { data: t } = await supabase.from('tickets').select('first_response_at, status').eq('id', ticketId).single()
    if (t && !t.first_response_at) {
      await supabase.from('tickets').update({
        first_response_at: new Date().toISOString(),
        status: t.status === 'aperto' ? 'in_lavorazione' : t.status,
      }).eq('id', ticketId)
    }
  }

  return error ? { error: error.message } : {}
}

// Admin: elimina ticket (solo super admin)
export async function deleteTicket(ticketId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  // Elimina messaggi prima (FK)
  await supabase.from('ticket_messages').delete().eq('ticket_id', ticketId)
  const { error } = await supabase.from('tickets').delete().eq('id', ticketId)
  return error ? { error: error.message } : {}
}

// ─── Guest actions ────────────────────────────────────────────────────────────

// Risposta del guest a un ticket
export async function replyToTicket(ticketId: string, content: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { error } = await supabase.from('ticket_messages').insert({
    ticket_id: ticketId,
    content: content.trim(),
    is_internal: false,
    sender_id: user.id,
  })

  return error ? { error: error.message } : {}
}
