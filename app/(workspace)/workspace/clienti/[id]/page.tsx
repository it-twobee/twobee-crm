import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { ClientPageClient } from '@/components/clients/ClientPageClient'
import type { Client, ClientContact, ClientKpi, Profile, ClientStakeholder, Document, ClientInteraction } from '@/lib/types/database'

export const revalidate = 0

interface Props {
  params: Promise<{ id: string }>
}

export default async function WorkspaceClientePage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [
    { data: client },
    { data: contacts },
    { data: assignments },
    { data: stakeholders },
    { data: documents },
    { data: currentProfile },
    { data: allProfiles },
    { data: kpis },
    { data: kpiConfigsData },
    { count: openTickets },
  ] = await Promise.all([
    supabase.from('clients_workspace').select('*').eq('id', id).single(),
    supabase.from('client_contacts').select('*').eq('client_id', id).order('is_primary', { ascending: false }),
    supabase.from('client_assignments').select('profile_id, profiles(*)').eq('client_id', id),
    supabase.from('client_stakeholders').select('*').eq('client_id', id).order('role'),
    supabase.from('documents').select('*').eq('client_id', id).order('created_at', { ascending: false }),
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('profiles').select('*').order('full_name'),
    supabase.from('client_kpis').select('*').eq('client_id', id).order('month', { ascending: false }),
    supabase.from('client_kpi_config').select('*').eq('client_id', id),
    supabase.from('tickets').select('*', { count: 'exact', head: true }).eq('client_id', id).in('status', ['aperto', 'in_lavorazione']),
  ])

  if (!client) notFound()

  const { data: intData } = await supabase
    .from('client_interactions')
    .select('*, conductor:profiles!client_interactions_conducted_by_fkey(id, full_name, avatar_url)')
    .eq('client_id', id)
    .order('date', { ascending: false })

  return (
    <ClientPageClient
      client={client as Client}
      contacts={(contacts ?? []) as ClientContact[]}
      kpis={(kpis ?? []) as ClientKpi[]}
      kpiConfigs={(kpiConfigsData ?? []) as import('@/lib/types/database').ClientKpiConfig[]}
      teamMembers={(assignments ?? []).map((a: { profiles: unknown }) => a.profiles).filter(Boolean) as Profile[]}
      stakeholders={(stakeholders ?? []) as ClientStakeholder[]}
      documents={(documents ?? []) as Document[]}
      currentProfile={currentProfile as Profile}
      allProfiles={(allProfiles ?? []) as Profile[]}
      interactions={(intData ?? []) as ClientInteraction[]}
      openTickets={openTickets ?? 0}
      hideEconomics
      backHref="/workspace/clienti"
    />
  )
}
