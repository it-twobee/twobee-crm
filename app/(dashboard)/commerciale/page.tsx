import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CommercialeClient } from '@/components/commerciale/CommercialeClient'
import { SUPER_ADMIN_EMAILS } from '@/lib/permissions'
import type { Deal, Profile, Client } from '@/lib/types/database'

export const revalidate = 0

export default async function CommercialePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const canAccess = SUPER_ADMIN_EMAILS.includes(profile?.email ?? '') || ['admin', 'manager'].includes(profile?.app_role ?? '')
  if (!canAccess) redirect('/dashboard')

  const [{ data: deals }, { data: profiles }, { data: clients }] = await Promise.all([
    supabase.from('deals').select('*').order('created_at', { ascending: false }).then(r => r.error ? { data: [] } : r),
    supabase.from('profiles').select('id,full_name,avatar_url,email').eq('is_active', true).order('full_name'),
    supabase.from('clients').select('id,company_name').order('company_name'),
  ])

  return (
    <CommercialeClient
      deals={(deals ?? []) as Deal[]}
      profiles={(profiles ?? []) as Profile[]}
      clients={(clients ?? []) as Pick<Client, 'id' | 'company_name'>[]}
      currentUserId={user.id}
    />
  )
}
