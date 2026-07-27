import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AdHocClient, type AdHocRow } from '@/components/adhoc/AdHocClient'

export const revalidate = 0

export default async function WorkspaceAdHocPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role, app_role').eq('id', user.id).single()
  if (profile?.role !== 'team' && profile?.role !== 'admin') redirect('/workspace')

  // clients_workspace = VIEW senza dati economici; le task le filtra la RLS
  const [{ data: tasks }, { data: clients }, { data: profiles }, { data: assignments }] = await Promise.all([
    supabase.from('tasks')
      .select('id, client_id, title, description, status, priority, due_date, visibility, assignee_id, created_at')
      .eq('task_type', 'ad_hoc').is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabase.from('clients_workspace').select('id, company_name, display_name').order('company_name'),
    supabase.from('profiles').select('id, full_name, avatar_url, app_role').eq('is_active', true).order('full_name'),
    // se la RLS non li espone al workspace il gruppo "lato cliente" resta vuoto
    supabase.from('client_assignments').select('profile_id, client_id'),
  ])

  const clientOf = new Map((assignments ?? []).map(a => [a.profile_id, a.client_id]))

  return (
    <AdHocClient
      rows={(tasks ?? []) as AdHocRow[]}
      clients={(clients ?? []).map((c: { id: string; company_name: string; display_name: string | null }) =>
        ({ id: c.id, name: c.display_name || c.company_name }))}
      profiles={(profiles ?? []).map(p => ({ ...p, client_id: clientOf.get(p.id) ?? null }))}
      canManage
      clientBase="/workspace/clienti"
    />
  )
}
