import { createClient } from '@/lib/supabase/server'
import { getViewer } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { MyTasksClient } from '@/components/workspace/MyTasksClient'
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

  // task assegnate a me (primario via assignee_id o multi-assegnatario)
  const { data: ta } = await supabase.from('task_assignees').select('task_id').eq('profile_id', user.id)
  const ids = Array.from(new Set((ta ?? []).map(r => r.task_id)))

  const orFilter = ids.length ? `assignee_id.eq.${user.id},id.in.(${ids.join(',')})` : `assignee_id.eq.${user.id}`
  const { data: tasks } = await supabase
    .from('tasks').select('*').is('deleted_at', null).or(orFilter).order('due_date', { ascending: true, nullsFirst: false })

  const projectIds = Array.from(new Set((tasks ?? []).map(t => t.project_id).filter(Boolean))) as string[]
  const clientIds = Array.from(new Set((tasks ?? []).map(t => t.client_id)))

  const [{ data: projects }, { data: clients }, { data: profiles }] = await Promise.all([
    projectIds.length ? supabase.from('projects').select('id, name').in('id', projectIds) : Promise.resolve({ data: [] }),
    clientIds.length ? supabase.from('clients').select('id, company_name, display_name').in('id', clientIds) : Promise.resolve({ data: [] }),
    supabase.from('profiles').select('id, full_name, avatar_url').eq('is_active', true),
  ])

  const projectName: Record<string, string> = {}
  ;(projects ?? []).forEach(p => { projectName[p.id] = p.name })
  const clientName: Record<string, string> = {}
  ;(clients ?? []).forEach(c => { clientName[c.id] = c.display_name || c.company_name })

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6">
      <h1 className="text-2xl sm:text-3xl font-bold text-text-primary font-heading mb-1">Le mie attività</h1>
      <p className="text-sm text-text-secondary mb-5">Task assegnate a te, da tutti i progetti e ad hoc.</p>
      <MyTasksClient
        tasks={(tasks ?? []) as Task[]}
        profiles={(profiles ?? []) as { id: string; full_name: string; avatar_url: string | null }[]}
        projectName={projectName}
        clientName={clientName}
      />
    </div>
  )
}
