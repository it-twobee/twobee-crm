import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { TicketSystem } from '@/components/ticket/TicketSystem'
import { isSuperAdmin } from '@/lib/permissions'
import type { Profile, Client } from '@/lib/types/database'

export const revalidate = 0

export default async function WorkspaceTicketsPage() {
  const profile = await getSessionProfile()
  if (!profile) redirect('/login')
  const supabase = await createClient()

  const [ticketRes, profilesRes, clientsRes] = await Promise.all([
    supabase.from('tickets').select(`
      id, title, description, status, priority, category, assigned_to,
      sla_hours, first_response_at, resolved_at, source, created_by,
      created_at, updated_at, client_id,
      submitted_by_guest, guest_name, guest_email,
      client:clients(id,company_name),
      assignee:profiles!tickets_assigned_to_fkey(id,full_name)
    `).order('created_at', { ascending: false }).limit(200),
    supabase.from('profiles').select('id,full_name,email,avatar_url').eq('is_active', true).order('full_name'),
    supabase.from('clients').select('id,company_name').order('company_name'),
  ])

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-text-primary">Ticket & Supporto</h1>
        <p className="text-text-secondary text-sm mt-1">Sistema di ticketing per richieste e assistenza clienti</p>
      </div>
      <TicketSystem
        tickets={(ticketRes.data ?? []) as any[]}
        profiles={(profilesRes.data ?? []) as Profile[]}
        clients={(clientsRes.data ?? []) as Pick<Client, 'id' | 'company_name'>[]}
        currentUserId={profile.id}
        isSuperAdmin={isSuperAdmin(profile as any)}
      />
    </div>
  )
}
