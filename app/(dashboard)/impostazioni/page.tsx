import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ImpostazioniClient } from '@/components/impostazioni/ImpostazioniClient'
import { SUPER_ADMIN_EMAILS } from '@/lib/permissions'
import type { Profile, RolePermission, Invitation, Approval } from '@/lib/types/database'

export const revalidate = 0

export default async function ImpostazioniPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile) redirect('/login')

  const isAdmin = SUPER_ADMIN_EMAILS.includes(profile.email) || profile.app_role === 'admin'
  if (!isAdmin) redirect('/dashboard')

  const [
    { data: profiles },
    { data: permissions },
    { data: invitations },
    { data: approvals },
    { data: clients },
  ] = await Promise.all([
    supabase.from('profiles').select('*').order('full_name'),
    supabase.from('role_permissions').select('*').then(r => r.error ? { data: [] } : r),
    supabase.from('invitations').select('*').order('created_at', { ascending: false }).then(r => r.error ? { data: [] } : r),
    supabase.from('approvals')
      .select('*, requester:profiles!approvals_requested_by_fkey(full_name,email,app_role)')
      .order('created_at', { ascending: false })
      .limit(50)
      .then(r => r.error ? { data: [] } : r),
    supabase.from('clients').select('id,company_name').order('company_name'),
  ])

  return (
    <ImpostazioniClient
      currentProfile={profile as Profile}
      profiles={(profiles ?? []) as Profile[]}
      permissions={(permissions ?? []) as RolePermission[]}
      invitations={(invitations ?? []) as Invitation[]}
      approvals={(approvals ?? []) as (Approval & { requester?: { full_name: string; email: string; app_role: string } })[]}
      clients={(clients ?? []) as { id: string; company_name: string }[]}
    />
  )
}
