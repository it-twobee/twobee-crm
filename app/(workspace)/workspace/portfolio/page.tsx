import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { WorkspacePortfolioClient } from '@/components/workspace/WorkspacePortfolioClient'

export const revalidate = 0

export interface PortfolioProject {
  id: string
  name: string
  status: string
  project_kind: string | null
  project_type: string | null
  client_name: string
  client_id: string
  taskTotal: number
  taskDone: number
}

export default async function WorkspacePortfolioPage() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')

  // Solo i progetti su cui la risorsa lavora. E nessun dato economico: MRR,
  // stato pagamenti e marginalità restano fuori dal portale operativo.
  const [{ data: ownedTasks }, { data: assignedIds }] = await Promise.all([
    sb.from('tasks').select('id, project_id, status').eq('assignee_id', user.id),
    sb.from('task_assignees').select('task_id').eq('profile_id', user.id),
  ])

  let extraTasks: { id: string; project_id: string | null; status: string }[] = []
  const ids = (assignedIds ?? []).map((a: { task_id: string }) => a.task_id)
  if (ids.length > 0) {
    const { data } = await sb.from('tasks').select('id, project_id, status').in('id', ids)
    extraTasks = data ?? []
  }

  const ownedSet = new Set((ownedTasks ?? []).map((t: { id: string }) => t.id))
  const allTasks = [...(ownedTasks ?? []), ...extraTasks.filter(t => !ownedSet.has(t.id))]

  const projectIds = Array.from(new Set(allTasks.map(t => t.project_id).filter(Boolean) as string[]))
  if (projectIds.length === 0) {
    return <WorkspacePortfolioClient projects={[]} />
  }

  const { data: projectsData } = await sb
    .from('projects')
    .select('id, name, status, project_kind, project_type, client:clients(id, company_name)')
    .in('id', projectIds)
    .order('name')

  const counts = new Map<string, { total: number; done: number }>()
  for (const t of allTasks) {
    if (!t.project_id) continue
    const c = counts.get(t.project_id) ?? { total: 0, done: 0 }
    c.total++
    if (t.status === 'completato') c.done++
    counts.set(t.project_id, c)
  }

  const projects: PortfolioProject[] = (projectsData ?? []).map((p: {
    id: string; name: string; status: string; project_kind: string | null; project_type: string | null; client: unknown
  }) => {
    const client = p.client as { id: string; company_name: string } | null
    const c = counts.get(p.id) ?? { total: 0, done: 0 }
    return {
      id: p.id,
      name: p.name,
      status: p.status,
      project_kind: p.project_kind,
      project_type: p.project_type,
      client_id: client?.id ?? '',
      client_name: client?.company_name ?? 'Senza cliente',
      taskTotal: c.total,
      taskDone: c.done,
    }
  })

  return <WorkspacePortfolioClient projects={projects} />
}
