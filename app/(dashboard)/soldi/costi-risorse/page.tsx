import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SUPER_ADMIN_EMAILS } from '@/lib/permissions'
import { ResourceCostsClient } from '@/components/finance/ResourceCostsClient'
import type { ResourceCost, Profile } from '@/lib/types/database'

export const revalidate = 0

export default async function CostiRisorsePage() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await sb.from('profiles').select('email, app_role, role').eq('id', user.id).single()
  const isGod = SUPER_ADMIN_EMAILS.includes(profile?.email ?? '')
  // Dati sensibili: solo super admin e admin. Manager/senior/junior esclusi.
  if (!isGod && profile?.app_role !== 'admin') redirect('/dashboard')

  const [resourcesRes, profilesRes] = await Promise.all([
    sb.from('resource_costs').select('*').order('is_active', { ascending: false }).order('name'),
    sb.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
  ])

  // Migration 063 non ancora applicata → pagina vuota funzionante, nessun crash
  if (resourcesRes.error) {
    console.error('[costi-risorse]', resourcesRes.error.message)
  }

  return (
    <ResourceCostsClient
      initialResources={(resourcesRes.data ?? []) as ResourceCost[]}
      profiles={(profilesRes.data ?? []) as Pick<Profile, 'id' | 'full_name'>[]}
    />
  )
}
