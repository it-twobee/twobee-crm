import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth'
import { canCreateClients } from '@/lib/permissions'
import { redirect } from 'next/navigation'
import { AdHocClient, type AdHocRow } from '@/components/adhoc/AdHocClient'
import type { MilestoneInput } from '@/lib/task-board'

export const revalidate = 0

export default async function WorkspaceAdHocPage() {
  const profile = await getSessionProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'team' && profile.role !== 'admin') redirect('/workspace')
  const supabase = await createClient()

  // clients_workspace = VIEW senza dati economici; le task le filtra la RLS
  const [{ data: tasks }, { data: clients }, { data: projects }, { data: profiles }, { data: assignments }, { data: milestones }] = await Promise.all([
    // §340 — tutte, non le sole ad hoc: la RLS decide già cosa questo ruolo vede
    supabase.from('tasks')
      .select('id, client_id, title, description, status, priority, due_date, visibility, assignee_id, created_at, completed_at, task_type, project_id, milestone_id')
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabase.from('clients_workspace').select('id, company_name, display_name').order('company_name'),
    // §346 — `client_id` del progetto: senza, le tappe non si filtrano per cliente
    supabase.from('projects').select('id, name, client_id').order('name'),
    supabase.from('profiles').select('id, full_name, avatar_url, app_role').eq('is_active', true).order('full_name'),
    // se la RLS non li espone al workspace il gruppo "lato cliente" resta vuoto
    supabase.from('client_assignments').select('profile_id, client_id'),
    /* §346 — le tappe, con la stessa porta delle task: quello che questo ruolo
       non deve vedere lo toglie la RLS, non una `select` diversa qui */
    supabase.from('milestones')
      .select('id, project_id, workstream_id, title, status, milestone_type, owner_id, due_date, approval_required, is_recurring_instance')
      .order('due_date', { ascending: true, nullsFirst: false }),
  ])

  const clientOf = new Map((assignments ?? []).map(a => [a.profile_id, a.client_id]))

  return (
    <AdHocClient
      rows={(tasks ?? []) as AdHocRow[]}
      clients={(clients ?? []).map((c: { id: string; company_name: string; display_name: string | null }) =>
        ({ id: c.id, name: c.display_name || c.company_name }))}
      projects={(projects ?? []) as { id: string; name: string; client_id: string | null }[]}
      milestones={(milestones ?? []) as MilestoneInput[]}
      profiles={(profiles ?? []).map(p => ({ ...p, client_id: clientOf.get(p.id) ?? null }))}
      canManage
      canCreateClient={canCreateClients(profile.app_role)}
      clientBase="/workspace/clienti"
      projectBase="/workspace/progetti"
    />
  )
}
