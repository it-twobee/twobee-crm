import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ReportClient } from '@/components/report/ReportClient'
import type { Client, ClientKpi } from '@/lib/types/database'

export const revalidate = 60

export default async function ReportPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: clients }, { data: kpis }] = await Promise.all([
    supabase.from('clients').select('*').order('company_name'),
    supabase.from('client_kpis').select('*').order('month', { ascending: false }),
  ])

  return (
    <ReportClient
      clients={(clients ?? []) as Client[]}
      kpis={(kpis ?? []) as ClientKpi[]}
    />
  )
}
