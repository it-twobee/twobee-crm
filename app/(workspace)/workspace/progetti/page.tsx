import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { WorkspaceProjectsClient } from '@/components/workspace/WorkspaceProjectsClient'

export const revalidate = 0

export default async function WorkspaceProgettiPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const today = new Date().toISOString().slice(0, 10)

  // Progetti da task assegnate (con titolo e id per timeline)
  const [ownedTasksRes, assignedIdsRes] = await Promise.all([
    supabase.from('tasks')
      .select('id, title, project_id, status, due_date, assignee_id')
      .eq('assignee_id', user.id)
      .neq('status', 'completato'),
    supabase.from('task_assignees').select('task_id').eq('profile_id', user.id),
  ])

  const assignedIds = (assignedIdsRes.data ?? []).map((a: { task_id: string }) => a.task_id)
  let extraTaskMeta: Array<{ id: string; title: string; project_id: string | null; status: string; due_date: string | null; assignee_id: string | null }> = []
  if (assignedIds.length > 0) {
    const { data } = await supabase.from('tasks')
      .select('id, title, project_id, status, due_date, assignee_id')
      .in('id', assignedIds)
      .neq('status', 'completato')
    extraTaskMeta = data ?? []
  }

  type TaskMeta = { id: string; title: string; project_id: string | null; status: string; due_date: string | null; assignee_id: string | null }
  const ownedSet = new Set((ownedTasksRes.data ?? []).map((t: TaskMeta) => t.id))
  const allTaskMeta: TaskMeta[] = [
    ...(ownedTasksRes.data ?? []),
    ...extraTaskMeta.filter((t: TaskMeta) => !ownedSet.has(t.id)),
  ]

  const projectIds = Array.from(new Set(allTaskMeta.map(t => t.project_id).filter(Boolean) as string[]))

  if (projectIds.length === 0) {
    return (
      <div className="p-6 text-center py-20 text-white/30 text-sm">
        Nessun progetto con task assegnate
      </div>
    )
  }

  const { data: projectsData } = await supabase
    .from('projects')
    .select('id, name, status, project_kind, client:clients(id, company_name)')
    .in('id', projectIds)
    .order('name')

  const taskCountMap = new Map<string, { total: number; overdue: number }>()
  const tasksByProject = new Map<string, TaskMeta[]>()
  for (const t of allTaskMeta) {
    if (!t.project_id) continue
    const cur = taskCountMap.get(t.project_id) ?? { total: 0, overdue: 0 }
    cur.total++
    if (t.due_date && t.due_date < today) cur.overdue++
    taskCountMap.set(t.project_id, cur)
    const arr = tasksByProject.get(t.project_id) ?? []
    arr.push(t)
    tasksByProject.set(t.project_id, arr)
  }

  const projects = (projectsData ?? []).map((p: {
    id: string; name: string; status: string; project_kind: string | null;
    client: unknown
  }) => ({
    id: p.id,
    name: p.name,
    status: p.status,
    project_kind: p.project_kind,
    client: (p.client as { id: string; company_name: string } | null),
    taskCount: taskCountMap.get(p.id)?.total ?? 0,
    overdueCount: taskCountMap.get(p.id)?.overdue ?? 0,
    tasks: (tasksByProject.get(p.id) ?? []).map(t => ({
      id: t.id, title: t.title, status: t.status, due_date: t.due_date,
    })),
  }))

  return <WorkspaceProjectsClient projects={projects} />
}
