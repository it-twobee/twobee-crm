import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { TaskList, type TaskRow } from '@/components/tasks/TaskList'
import type { MilestoneInput } from '@/lib/task-board'

export const revalidate = 0

/**
 * §348 — la stessa lista della sezione Task, con le sole righe di chi guarda.
 * L'unica differenza è quali task arrivano: tutto il resto — colonne, colori,
 * dettaglio, bacheca, calendario — è lo stesso componente.
 */
export default async function MieAttivitaPage() {
  const profile = await getSessionProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'team' && profile.role !== 'admin') redirect('/workspace')
  const supabase = await createClient()
  const userId = profile.id

  const [{ data: ta }, { data: profiles }, { data: tappe }] = await Promise.all([
    /* §347 — `assigned_by`: chi ha deciso che questa task fosse tua. Se la 231
       non è ancora applicata si ripiega sulla query di prima: perdere tutte le
       task multi-assegnate per una colonna che dice un nome sarebbe peggio. */
    (async () => {
      const r = await supabase.from('task_assignees').select('task_id, assigned_by').eq('profile_id', userId)
      return r.error ? await supabase.from('task_assignees').select('task_id').eq('profile_id', userId) : r
    })(),
    supabase.from('profiles').select('id, full_name, avatar_url, app_role').eq('is_active', true).order('full_name'),
    // §346 — le tappe di cui sono responsabile: lavoro mio come una task
    supabase.from('milestones')
      .select('id, project_id, workstream_id, title, status, milestone_type, owner_id, due_date, approval_required, is_recurring_instance')
      .eq('owner_id', userId),
  ])
  const ids = Array.from(new Set((ta ?? []).map(r => r.task_id)))
  const assignedBy: Record<string, string | null> = {}
  ;((ta ?? []) as { task_id: string; assigned_by?: string | null }[])
    .forEach(a => { assignedBy[a.task_id] = a.assigned_by ?? null })
  const msIds = (tappe ?? []).map(m => m.id)

  const orFilter = ids.length ? `assignee_id.eq.${userId},id.in.(${ids.join(',')})` : `assignee_id.eq.${userId}`
  const { data: tasks } = await supabase
    .from('tasks').select('*').is('deleted_at', null).or(orFilter).order('due_date', { ascending: true, nullsFirst: false })

  const projectIds = Array.from(new Set([
    ...(tasks ?? []).map(t => t.project_id),
    ...(tappe ?? []).map(m => m.project_id),
  ].filter(Boolean))) as string[]

  const [{ data: projects }, { data: workstreams }, { data: msTasks }] = await Promise.all([
    projectIds.length ? supabase.from('projects').select('id, name, client_id').in('id', projectIds) : Promise.resolve({ data: [] }),
    supabase.from('project_workstreams').select('id, name, project_id'),
    msIds.length ? supabase.from('tasks').select('milestone_id, status').is('deleted_at', null).in('milestone_id', msIds)
      : Promise.resolve({ data: [] }),
  ])

  const clientIds = Array.from(new Set([
    ...(tasks ?? []).map(t => t.client_id),
    ...(projects ?? []).map(p => (p as { client_id?: string | null }).client_id ?? null),
  ].filter(Boolean))) as string[]
  // §211 — `clients_workspace`, non `clients`: è la sorgente del portale
  // operativo (economici e fiscali azzerati in tabella) ed è quella che la
  // RLS garantisce leggibile a tutto lo staff. Qui servono solo i nomi.
  const { data: clients } = clientIds.length
    ? await supabase.from('clients_workspace').select('id, company_name, display_name').in('id', clientIds)
    : { data: [] as { id: string; company_name: string; display_name: string | null }[] }

  return (
    <TaskList
      titolo="Le mie attività"
      personale
      rows={(tasks ?? []) as TaskRow[]}
      clients={(clients ?? []).map((c: { id: string; company_name: string; display_name: string | null }) =>
        ({ id: c.id, name: c.display_name || c.company_name }))}
      projects={(projects ?? []) as { id: string; name: string; client_id: string | null }[]}
      workstreams={(workstreams ?? []) as { id: string; name: string; project_id: string }[]}
      milestones={(tappe ?? []) as MilestoneInput[]}
      milestoneTasks={(msTasks ?? []) as { milestone_id: string | null; status: string }[]}
      assignedBy={assignedBy}
      profiles={(profiles ?? []).map(p => ({ ...p, client_id: null }))}
      canManage
      clientBase="/workspace/clienti"
      projectBase="/workspace/progetti"
    />
  )
}
