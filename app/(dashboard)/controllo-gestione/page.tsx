import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ControlloGestioneClient } from '@/components/controllo-gestione/ControlloGestioneClient'
import type { Client, Project, Invoice, ResourceCost, ProjectCostEntry, BusinessCost, Profile } from '@/lib/types/database'

export const revalidate = 0

export default async function ControlloGestionePage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [
    { data: profile },
    { data: clients },
    { data: projects },
    { data: invoices },
    { data: resourceCosts },
    { data: projectCosts },
    { data: businessCosts },
    { data: profiles },
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('clients').select('*').order('company_name'),
    supabase.from('projects').select('*').order('created_at', { ascending: false }),
    supabase.from('invoices').select('*').order('month', { ascending: false }),
    supabase.from('resource_costs').select('*').order('name'),
    supabase.from('project_cost_entries').select('*').order('created_at'),
    supabase.from('business_costs').select('*').order('category'),
    supabase.from('profiles').select('id, full_name, email, avatar_url').order('full_name'),
  ])

  return (
    <ControlloGestioneClient
      clients={(clients ?? []) as Client[]}
      projects={(projects ?? []) as Project[]}
      invoices={(invoices ?? []) as Invoice[]}
      resourceCosts={(resourceCosts ?? []) as ResourceCost[]}
      projectCosts={(projectCosts ?? []) as ProjectCostEntry[]}
      businessCosts={(businessCosts ?? []) as BusinessCost[]}
      profiles={(profiles ?? []) as Pick<Profile, 'id' | 'full_name' | 'email' | 'avatar_url'>[]}
      currentProfile={profile as Profile}
    />
  )
}
