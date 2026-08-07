import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { ClientiList } from '@/components/clients/ClientiList'
import type { Client, Profile } from '@/lib/types/database'

export const revalidate = 30

export default async function WorkspaceClientiPage() {
  const profile = await getSessionProfile()
  if (!profile) redirect('/login')
  const supabase = await createClient()

  // Solo clienti attivi (esclusi i persi). Fonte: VIEW clients_workspace (colonne
  // economiche/fiscali azzerate a livello DB — Fase 0, migration 100).
  const { data } = await supabase
    .from('clients_workspace')
    .select('*')
    .neq('client_label', 'perso')
    .order('company_name')

  const clients = (data ?? []) as Client[]

  return (
    <ClientiList
      clients={clients}
      currentProfile={profile as Profile}
      hideEconomics
    />
  )
}
