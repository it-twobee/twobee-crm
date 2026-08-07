import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth'
import { notFound, redirect } from 'next/navigation'
import { ClientPageClient } from '@/components/clients/ClientPageClient'
import type { Client, ClientContact, ClientKpi, Profile, ClientStakeholder, ClientInteraction } from '@/lib/types/database'
import { PROFILE_COLUMNS } from '@/lib/profile-columns'

export const revalidate = 0

interface Props {
  params: Promise<{ id: string }>
}

export default async function WorkspaceClientePage({ params }: Props) {
  const { id } = await params
  const currentProfile = await getSessionProfile()
  if (!currentProfile) redirect('/login')

  const supabase = await createClient()

  // Le interazioni non dipendono dalle altre letture: erano un ottavo giro in
  // fila dopo che tutto il resto era già arrivato.
  const [
    { data: client },
    { data: contacts },
    { data: assignments },
    { data: stakeholders },
    { data: allProfiles },
    { data: kpis },
    { count: openTickets },
    { data: intData },
  ] = await Promise.all([
    supabase.from('clients_workspace').select('*').eq('id', id).single(),
    supabase.from('client_contacts').select('*').eq('client_id', id).order('is_primary', { ascending: false }),
    supabase.from('client_assignments').select('profile_id, profiles(*)').eq('client_id', id),
    supabase.from('client_stakeholders').select('*').eq('client_id', id).order('role'),
    supabase.from('profiles').select(PROFILE_COLUMNS).order('full_name'),
    supabase.from('client_kpis').select('*').eq('client_id', id).order('month', { ascending: false }),
    supabase.from('tickets').select('id', { count: 'exact', head: true }).eq('client_id', id).in('status', ['aperto', 'in_lavorazione']),
    supabase.from('client_interactions')
      .select('*, conductor:profiles!client_interactions_conducted_by_fkey(id, full_name, avatar_url)')
      .eq('client_id', id)
      .order('date', { ascending: false }),
  ])

  if (!client) notFound()

  /* §211 — come nella lista: stato pagamenti e date di contratto non li mostra
     nessuno di questi riquadri (`contractsCount` e `hasBilling` non arrivano
     apposta), quindi non viaggiano nemmeno nel payload. */
  const safeClient = { ...client, payment_status: null, contract_start: null, contract_end: null }

  return (
    <ClientPageClient
      client={safeClient as unknown as Client}
      contacts={(contacts ?? []) as ClientContact[]}
      kpis={(kpis ?? []) as ClientKpi[]}
      teamMembers={(assignments ?? []).map((a: { profiles: unknown }) => a.profiles).filter(Boolean) as Profile[]}
      stakeholders={(stakeholders ?? []) as ClientStakeholder[]}
      currentProfile={currentProfile as Profile}
      allProfiles={(allProfiles ?? []) as Profile[]}
      interactions={(intData ?? []) as ClientInteraction[]}
      openTickets={openTickets ?? 0}
      hideEconomics
      backHref="/workspace/clienti"
    />
  )
}
