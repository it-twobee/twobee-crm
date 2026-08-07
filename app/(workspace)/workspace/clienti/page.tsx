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

  /* §211 — la VIEW azzera canone e dati fiscali (migration 100), ma continua a
     portare stato pagamenti e date di contratto: la lista li nasconde con
     `hideEconomics`, e allora non devono nemmeno partire. Quello che non arriva
     al browser non si legge dal pannello di rete. */
  const clients = (data ?? []).map(c => ({
    ...c, payment_status: null, contract_start: null, contract_end: null,
  })) as unknown as Client[]

  return (
    <ClientiList
      clients={clients}
      currentProfile={profile as Profile}
      hideEconomics
    />
  )
}
