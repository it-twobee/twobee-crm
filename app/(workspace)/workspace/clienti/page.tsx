import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ClientiList } from '@/components/clients/ClientiList'
import { fetchClientTaskStats } from '@/lib/client-task-stats'
import type { Client, Profile } from '@/lib/types/database'

export const revalidate = 30

export default async function WorkspaceClientiPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile) redirect('/login')

  // Solo clienti attivi (esclusi i persi). Fonte: VIEW clients_workspace (colonne
  // economiche/fiscali azzerate a livello DB — Fase 0, migration 100).
  const { data } = await supabase
    .from('clients_workspace')
    .select('*')
    .neq('client_label', 'perso')
    .order('company_name')

  const clients = (data ?? []) as Client[]
  const taskStats = await fetchClientTaskStats(supabase, clients.map(c => c.id))

  return (
    <ClientiList
      clients={clients}
      currentProfile={profile as Profile}
      taskStats={taskStats}
      hideEconomics
    />
  )
}
