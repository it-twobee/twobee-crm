import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { RisorsaTasks, type RisorsaTaskRow } from '@/components/risorsa/RisorsaTasks'

export const revalidate = 0

export default async function RisorsaAttivitaPage() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')

  const { data } = await sb.from('tasks')
    .select('*, project:projects(id, name, client_id, clients(company_name))')
    .eq('assignee_id', user.id)
    .order('due_date', { ascending: true, nullsFirst: false })

  return <RisorsaTasks initialTasks={(data ?? []) as unknown as RisorsaTaskRow[]} />
}
