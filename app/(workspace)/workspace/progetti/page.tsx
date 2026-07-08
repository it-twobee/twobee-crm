import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { WorkspaceProjectsClient } from '@/components/workspace/WorkspaceProjectsClient'

export const revalidate = 0

export default async function WorkspaceProgettiPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const today = new Date().toISOString().slice(0, 10)

  // Progetti da task assegnate
  const [ownedTasksRes, assignedIdsRes] = await Promise.all([
    supabase.from('tasks')
      .select('project_id, status, due_date')
      .eq('assignee_id', user.id)
      .neq('status', 'completato'),
    supabase.from('task_assignees').select('task_id').eq('profile_id', user.id),
  ])

  const assignedIds = (assignedIdsRes.data ?? []).map((a: { task_id: string }) => a.task_id)
  let extraTaskMeta: Array<{ project_id: string | null; status: string; due_date: string | null }> = []
  if (assignedIds.length > 0) {
    const { data } = await supabase.from('tasks')
      .select('project_id, status, due_date')
      .in('id', assignedIds)
      .neq('status', 'completato')
    extraTaskMeta = data ?? []
  }

  const allTaskMeta = [
    ...(ownedTasksRes.data ?? []),
    ...extraTaskMeta,
  ] as Array<{ project_id: string | null; status: string; due_date: string | null }>

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
  for (const t of allTaskMeta) {
    if (!t.project_id) continue
    const cur = taskCountMap.get(t.project_id) ?? { total: 0, overdue: 0 }
    cur.total++
    if (t.due_date && t.due_date < today) cur.overdue++
    taskCountMap.set(t.project_id, cur)
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
  }))

  return <WorkspaceProjectsClient projects={projects} />
}
