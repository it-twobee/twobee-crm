import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { isSuperAdminRaw, isAdminRole } from '@/lib/permissions'
import { PayslipsClient } from '@/components/workspace/payslips/PayslipsClient'
import { SetupNotice } from '@/components/workspace/SetupNotice'
import type { Payslip } from '@/lib/types/database'

export const revalidate = 0

export default async function BustePagaPage() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await sb
    .from('profiles').select('id, email, app_role, role').eq('id', user.id).single()
  const isAdmin =
    isSuperAdminRaw(profile?.email, profile?.app_role) ||
    isAdminRole(profile?.app_role) ||
    profile?.role === 'admin'

  // RLS: senza filtro esplicito il dipendente riceve comunque solo le proprie.
  // Lo mettiamo lo stesso — difesa in profondità, e l'admin qui vuole le sue.
  const query = sb.from('payslips').select('*').order('year', { ascending: false }).order('month', { ascending: false })
  const { data, error } = isAdmin ? await query : await query.eq('profile_id', user.id)

  if (error?.code === 'PGRST205') {
    return <SetupNotice table="payslips" migration="088_payslips.sql" bucket="payslips" />
  }

  // L'elenco dei colleghi serve solo all'admin per caricare le buste altrui.
  const { data: team } = isAdmin
    ? await sb.from('profiles').select('id, full_name').eq('is_active', true).order('full_name')
    : { data: null }

  return (
    <PayslipsClient
      payslips={(data ?? []) as Payslip[]}
      isAdmin={isAdmin}
      currentUserId={user.id}
      team={(team ?? []) as { id: string; full_name: string }[]}
    />
  )
}
