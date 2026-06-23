import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { TicketSystem } from '@/components/ticket/TicketSystem'
import { SUPER_ADMIN_EMAILS, isSuperAdmin } from '@/lib/permissions'
import type { Profile, Client } from '@/lib/types/database'

export const revalidate = 0

export default async function TicketsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const canAccess = SUPER_ADMIN_EMAILS.includes(profile?.email ?? '') || ['admin', 'manager'].includes(profile?.app_role ?? '')
  if (!canAccess) redirect('/dashboard')

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
        <h1 className="text-2xl font-black text-white">Ticket & Supporto</h1>
        <p className="text-text-secondary text-sm mt-1">Sistema di ticketing per richieste e assistenza clienti</p>
      </div>
      <TicketSystem
        tickets={(ticketRes.data ?? []) as any[]}
        profiles={(profilesRes.data ?? []) as Profile[]}
        clients={(clientsRes.data ?? []) as Pick<Client, 'id' | 'company_name'>[]}
        currentUserId={user.id}
        isSuperAdmin={isSuperAdmin(profile as any)}
      />
    </div>
  )
}
