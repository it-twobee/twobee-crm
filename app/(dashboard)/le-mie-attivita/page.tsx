import { createClient } from '@/lib/supabase/server'
import { getViewer } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { MyTasksClient } from '@/components/workspace/MyTasksClient'
import type { MilestoneInput } from '@/lib/task-board'
import type { Task } from '@/lib/types/database'

export const revalidate = 0

export default async function LeMieAttivitaPage() {
  const { user, isAdmin } = await getViewer()
  if (!user) redirect('/login')
  /* La voce è nel menu senza `adminOnly`, ma il gate guardava la colonna
     legacy `role`: chi è admin per `app_role` — che è la colonna su cui decide
     il middleware — entrava nella dashboard e veniva rimbalzato proprio qui,
     su una voce che il suo menu gli mostra. Una domanda sola, la stessa del
     middleware: `getViewer()`. E chi admin non è ha la stessa pagina dentro il
     portale, quindi ci va diretto invece di rimbalzare due volte. */
  if (!isAdmin) redirect('/workspace/attivita')
  const supabase = await createClient()

  // task assegnate a me (primario via assignee_id o multi-assegnatario) e
  // §346 — le tappe di cui sono responsabile: sono lavoro mio esattamente come
  // una task, e non comparivano in nessuna lista personale
  const [{ data: ta }, { data: tappe }] = await Promise.all([
    supabase.from('task_assignees').select('task_id').eq('profile_id', user.id),
    supabase.from('milestones')
      .select('id, project_id, workstream_id, title, status, milestone_type, owner_id, due_date, approval_required, is_recurring_instance')
      .eq('owner_id', user.id),
  ])
  const ids = Array.from(new Set((ta ?? []).map(r => r.task_id)))
  const msIds = (tappe ?? []).map(m => m.id)

  const orFilter = ids.length ? `assignee_id.eq.${user.id},id.in.(${ids.join(',')})` : `assignee_id.eq.${user.id}`
  const { data: tasks } = await supabase
    .from('tasks').select('*').is('deleted_at', null).or(orFilter).order('due_date', { ascending: true, nullsFirst: false })

  const projectIds = Array.from(new Set([
    ...(tasks ?? []).map(t => t.project_id),
    ...(tappe ?? []).map(m => m.project_id),
  ].filter(Boolean))) as string[]

  const [{ data: projects }, { data: msTasks }, { data: profiles }] = await Promise.all([
    // §346 — `client_id`: la milestone non ce l'ha, e la fascia dice di chi è il lavoro
    projectIds.length ? supabase.from('projects').select('id, name, client_id').in('id', projectIds) : Promise.resolve({ data: [] }),
    /* le task **di tutti** sotto quelle tappe: «2 aperte su 3» contato sulle mie
       direbbe un numero più piccolo del vero, e la domanda è quanto manca alla
       consegna, non quanto manca a me */
    msIds.length ? supabase.from('tasks').select('milestone_id, status').is('deleted_at', null).in('milestone_id', msIds)
      : Promise.resolve({ data: [] }),
    supabase.from('profiles').select('id, full_name, avatar_url').eq('is_active', true),
  ])

  const clientIds = Array.from(new Set([
    ...(tasks ?? []).map(t => t.client_id),
    ...(projects ?? []).map(p => (p as { client_id?: string | null }).client_id ?? null),
  ].filter(Boolean))) as string[]
  const { data: clients } = clientIds.length
    ? await supabase.from('clients').select('id, company_name, display_name').in('id', clientIds)
    : { data: [] as { id: string; company_name: string; display_name: string | null }[] }

  const projectName: Record<string, string> = {}
  ;(projects ?? []).forEach(p => { projectName[p.id] = p.name })
  const clientName: Record<string, string> = {}
  ;(clients ?? []).forEach(c => { clientName[c.id] = c.display_name || c.company_name })

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6">
      <h1 className="text-2xl sm:text-3xl font-bold text-text-primary font-heading mb-1">Le mie attività</h1>
      <p className="text-sm text-text-secondary mb-5">Task assegnate a te e tappe che hai in carico, da tutti i progetti.</p>
      <MyTasksClient
        tasks={(tasks ?? []) as Task[]}
        profiles={(profiles ?? []) as { id: string; full_name: string; avatar_url: string | null }[]}
        projectName={projectName}
        clientName={clientName}
        milestones={(tappe ?? []) as MilestoneInput[]}
        milestoneTasks={(msTasks ?? []) as { milestone_id: string | null; status: string }[]}
        projects={(projects ?? []) as { id: string; name: string; client_id: string | null }[]}
        projectBase="/progetti"
      />
    </div>
  )
}
