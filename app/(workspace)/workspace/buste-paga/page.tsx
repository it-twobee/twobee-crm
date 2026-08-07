import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getViewer } from '@/lib/auth'
import { PayslipsClient } from '@/components/workspace/payslips/PayslipsClient'
import { SetupNotice } from '@/components/workspace/SetupNotice'
import type { Payslip } from '@/lib/types/database'

export const revalidate = 0

export default async function BustePagaPage() {
  const { user, isAdmin } = await getViewer()
  if (!user) redirect('/login')
  const sb = await createClient()

  // RLS: senza filtro esplicito il dipendente riceve comunque solo le proprie.
  // Lo mettiamo lo stesso — difesa in profondità, e l'admin qui vuole le sue.
  // L'elenco dei colleghi (solo admin, per caricare le buste altrui) non
  // dipende dalle buste: parte insieme.
  const query = sb.from('payslips').select('*').order('year', { ascending: false }).order('month', { ascending: false })
  const [{ data, error }, { data: team }] = await Promise.all([
    isAdmin ? query : query.eq('profile_id', user.id),
    isAdmin
      ? sb.from('profiles').select('id, full_name').eq('is_active', true).order('full_name')
      : Promise.resolve({ data: null }),
  ])

  if (error?.code === 'PGRST205') {
    return <SetupNotice table="payslips" migration="088_payslips.sql" bucket="payslips" />
  }

  return (
    <PayslipsClient
      payslips={(data ?? []) as Payslip[]}
      isAdmin={isAdmin}
      currentUserId={user.id}
      team={(team ?? []) as { id: string; full_name: string }[]}
    />
  )
}
