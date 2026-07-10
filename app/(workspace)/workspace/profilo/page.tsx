import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ProfiloClient } from '@/components/workspace/ProfiloClient'
import type { Profile } from '@/lib/types/database'

export const revalidate = 0

export default async function ProfiloPage() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')

  // Colonne esplicite: `select('*')` porterebbe monthly_cost fino al client.
  const { data: profile } = await sb
    .from('profiles')
    .select('id, full_name, role, app_role, avatar_url, email, phone, area, competencies, job_title, is_active, invited_by, last_seen_at, created_at, resource_type, seniority, hire_date, birth_date, contract_type')
    .eq('id', user.id)
    .single()
  if (!profile) redirect('/login')

  // I token Google vivono in user_metadata (vedi /api/google/callback).
  // Qui ci serve solo sapere se il collegamento esiste, non il token.
  const googleConnected = Boolean(user.user_metadata?.google_refresh_token)

  return <ProfiloClient profile={profile as Profile} googleConnected={googleConnected} />
}
