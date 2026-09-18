import { createClient } from '@/lib/supabase/server'
import { getSessionUser, getSessionProfile } from '@/lib/auth'
import { canCreateClients } from '@/lib/permissions'
import { redirect } from 'next/navigation'
import { AdHocClient, type AdHocRow } from '@/components/adhoc/AdHocClient'
import type { MilestoneInput } from '@/lib/task-board'

export const revalidate = 0

export default async function AdHocPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  const supabase = await createClient()
  const profile = await getSessionProfile()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const [{ data: tasks }, { data: clients }, { data: projects }, { data: profiles }, { data: workstreams }, { data: assignments }, { data: milestones }] = await Promise.all([
    /* §340 — **tutte**, non le sole ad hoc. La sezione rispondeva a metà della
       domanda «cosa c'è da fare», e l'altra metà stava nella scheda di ogni
       progetto: per vedere il carico di una persona bisognava sapere già dove
       cercarlo. `task_type` e `project_id` restano, e il selettore in pagina
       rifà la separazione quando serve. */
    supabase.from('tasks')
      // §283 — `completed_at` serve alla sezione delle completate: senza, non si
      // sa da quando contare i sessanta giorni né quando è stata chiusa
      .select('id, client_id, title, description, status, priority, due_date, visibility, assignee_id, created_at, completed_at, task_type, project_id, milestone_id, workstream_id')
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabase.from('clients').select('id, company_name, display_name').order('company_name'),
    // §346 — `client_id` del progetto: la milestone non ce l'ha, e senza le
    // tappe non si filtrano per cliente come tutto il resto della pagina
    supabase.from('projects').select('id, name, client_id').order('name'),
    supabase.from('profiles').select('id, full_name, avatar_url, app_role').eq('is_active', true).order('full_name'),
    // §346 — i nomi delle corsie: sulla riga della task il workstream è l'unica
    // cosa che distingue due lavori dello stesso progetto
    supabase.from('project_workstreams').select('id, name, project_id'),
    // referenti lato cliente: servono a sapere a quale anagrafica appartengono
    supabase.from('client_assignments').select('profile_id, client_id'),
    /* §346 — le tappe. Le `system` le scarta `tappeRows`, non la query: la
       regola di cosa è una tappa sta in un posto solo, e le tre pagine che la
       chiedono non devono ricordarsene una per una. */
    supabase.from('milestones')
      .select('id, project_id, workstream_id, title, status, milestone_type, owner_id, due_date, approval_required, is_recurring_instance')
      .order('due_date', { ascending: true, nullsFirst: false }),
  ])

  const clientOf = new Map((assignments ?? []).map(a => [a.profile_id, a.client_id]))

  return (
    <AdHocClient
      rows={(tasks ?? []) as AdHocRow[]}
      clients={(clients ?? []).map(c => ({ id: c.id, name: c.display_name || c.company_name }))}
      projects={(projects ?? []) as { id: string; name: string; client_id: string | null }[]}
      workstreams={(workstreams ?? []) as { id: string; name: string; project_id: string }[]}
      milestones={(milestones ?? []) as MilestoneInput[]}
      profiles={(profiles ?? []).map(p => ({ ...p, client_id: clientOf.get(p.id) ?? null }))}
      canManage
      canCreateClient={canCreateClients(profile?.app_role)}
    />
  )
}
