import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { WorkspaceProjectsClient } from '@/components/workspace/WorkspaceProjectsClient'
import type { ProjectKind } from '@/lib/types/database'

export const revalidate = 0

// Ripristinata dalla 135: la sezione "Progetti" sostituisce "Portfolio" nel
// workspace. Il Workload resta la vista del CARICO; questa è la lista dei
// progetti per cliente e linea di servizio.
export default async function WorkspaceProgettiPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const today = new Date().toISOString().slice(0, 10)

  const { data: projectsData } = await supabase
    .from('projects')
    .select('id, name, status, project_kind, service_line, delivery_model, client:clients(id, company_name)')
    .eq('status', 'attivo')
    .order('name')

  type ProjectRow = {
    id: string; name: string; status: string; project_kind: ProjectKind | null
    client: { id: string; company_name: string } | null
  }
  const projectList = (projectsData ?? []) as unknown as ProjectRow[]
  const projectIds = projectList.map(p => p.id)

  type TaskMeta = { id: string; title: string; project_id: string | null; status: string; due_date: string | null }
  const { data: tasksData } = projectIds.length > 0
    ? await supabase.from('tasks')
        .select('id, title, project_id, status, due_date')
        .in('project_id', projectIds)
        .neq('status', 'completato')
    : { data: [] as TaskMeta[] }

  const taskCountMap = new Map<string, { total: number; overdue: number }>()
  const tasksByProject = new Map<string, TaskMeta[]>()
  for (const t of (tasksData ?? []) as TaskMeta[]) {
    if (!t.project_id) continue
    const cur = taskCountMap.get(t.project_id) ?? { total: 0, overdue: 0 }
    cur.total++
    if (t.due_date && t.due_date < today) cur.overdue++
    taskCountMap.set(t.project_id, cur)
    const arr = tasksByProject.get(t.project_id) ?? []
    arr.push(t)
    tasksByProject.set(t.project_id, arr)
  }

  const projects = projectList.map(p => ({
    id: p.id,
    name: p.name,
    status: p.status,
    project_kind: p.project_kind,
    client: p.client,
    taskCount: taskCountMap.get(p.id)?.total ?? 0,
    overdueCount: taskCountMap.get(p.id)?.overdue ?? 0,
    tasks: (tasksByProject.get(p.id) ?? []).map(t => ({
      id: t.id, title: t.title, status: t.status, due_date: t.due_date,
    })),
  }))

  // Chi può creare progetti dal workspace: manager (e admin che entra da qui).
  const [{ data: me }, { data: wsClients }, { data: wsProfiles }] = await Promise.all([
    supabase.from('profiles').select('role, app_role').eq('id', user.id).single(),
    supabase.from('clients_workspace').select('id, company_name').order('company_name'),
    supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
  ])
  const meRow = me as { role?: string; app_role?: string } | null
  const canCreate = meRow?.role === 'admin' || meRow?.app_role === 'manager'

  return (
    <WorkspaceProjectsClient
      projects={projects}
      canCreate={canCreate}
      clients={(wsClients ?? []) as { id: string; company_name: string }[]}
      profiles={(wsProfiles ?? []) as { id: string; full_name: string | null }[]}
    />
  )
}
