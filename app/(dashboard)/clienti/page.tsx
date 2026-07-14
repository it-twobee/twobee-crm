import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ClientiList } from '@/components/clients/ClientiList'
import { fetchClientTaskStats } from '@/lib/client-task-stats'
import type { Client, Profile } from '@/lib/types/database'
import { SUPER_ADMIN_EMAILS } from '@/lib/permissions'

export const revalidate = 30

export default async function ClientiPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile) redirect('/login')

  const isAdminLevel = SUPER_ADMIN_EMAILS.includes(profile.email) || ['admin', 'manager'].includes(profile.app_role ?? '')

  let clients: Client[] = []

  if (isAdminLevel) {
    // Admin e manager vedono tutti i clienti
    const { data } = await supabase.from('clients').select('*').order('company_name')
    clients = (data ?? []) as Client[]
  } else {
    // Senior, junior, viewer: solo i clienti assegnati
    const { data: assignments } = await supabase
      .from('user_client_assignments')
      .select('client_id')
      .eq('user_id', user.id)
    const clientIds = (assignments ?? []).map((a: { client_id: string }) => a.client_id)
    if (clientIds.length > 0) {
      const { data } = await supabase.from('clients').select('*').in('id', clientIds).order('company_name')
      clients = (data ?? []) as Client[]
    }
  }

  const taskStats = await fetchClientTaskStats(supabase, clients.map(c => c.id))

  return <ClientiList clients={clients} currentProfile={profile as Profile} taskStats={taskStats} />
}
