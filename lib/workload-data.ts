import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { WLTask, WLProject, WLResource } from '@/lib/workload'

export interface WorkloadData {
  projects: WLProject[]
  tasks: WLTask[]
  resources: WLResource[]
  clients: { id: string; name: string }[]
  multiAssignees: Record<string, string[]>
  managedProjectIds: string[]
}

/**
 * Dati per la vista Workload. NIENTE dati economici (MRR, costi, margini): il
 * workload è effort e tempo, e questa stessa funzione serve anche il portale
 * operativo dove quei dati non devono comparire.
 *
 * `restrictToUserId`: nel workspace mostriamo solo i progetti su cui l'utente
 * lavora o che gestisce; per l'admin resta null (vede tutto).
 */
export async function fetchWorkloadData(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: SupabaseClient<any, any, any>,
  currentUserId: string,
  restrictToUserId: string | null,
): Promise<WorkloadData> {
  const [projRes, resRes] = await Promise.all([
    sb.from('projects')
      .select('id, name, status, project_kind, client_id, manager_id, client:clients(id, company_name)')
      .neq('status', 'archiviato')
      .order('name'),
    sb.from('profiles').select('id, full_name, avatar_url').eq('is_active', true).order('full_name'),
  ])

  const allProjects: WLProject[] = (projRes.data ?? []).map((p: {
    id: string; name: string; status: string; project_kind: string | null
    client_id: string; manager_id: string | null; client: unknown
  }) => ({
    id: p.id, name: p.name, status: p.status, project_kind: p.project_kind,
    client_id: p.client_id, manager_id: p.manager_id,
    client_name: (p.client as { company_name: string } | null)?.company_name ?? 'Senza cliente',
  }))

  const managedProjectIds = allProjects.filter(p => p.manager_id === currentUserId).map(p => p.id)

  // Task dei progetti visibili (non completate le teniamo comunque, servono al progress).
  const projectIds = allProjects.map(p => p.id)
  let tasks: WLTask[] = []
  const multiAssignees: Record<string, string[]> = {}

  if (projectIds.length > 0) {
    const { data: taskRows } = await sb
      .from('tasks')
      .select('id, title, status, priority, due_date, estimated_hours, logged_hours, assignee_id, project_id, is_milestone')
      .in('project_id', projectIds)
    tasks = (taskRows ?? []) as WLTask[]

    const taskIds = tasks.map(t => t.id)
    if (taskIds.length > 0) {
      // in blocchi per non esplodere l'URL su liste lunghe
      for (let i = 0; i < taskIds.length; i += 300) {
        const chunk = taskIds.slice(i, i + 300)
        const { data: bridge } = await sb
          .from('task_assignees').select('task_id, profile_id, is_primary_owner').in('task_id', chunk)
        for (const r of (bridge ?? []) as { task_id: string; profile_id: string; is_primary_owner: boolean }[]) {
          if (!multiAssignees[r.task_id]) multiAssignees[r.task_id] = []
          if (r.is_primary_owner) multiAssignees[r.task_id].unshift(r.profile_id)
          else multiAssignees[r.task_id].push(r.profile_id)
        }
      }
    }
  }

  // Restrizione workspace: solo i progetti dove l'utente è assegnato o è PM.
  let projects = allProjects
  if (restrictToUserId) {
    const involved = new Set<string>(managedProjectIds)
    for (const t of tasks) {
      const assignees = multiAssignees[t.id] ?? (t.assignee_id ? [t.assignee_id] : [])
      if (assignees.includes(restrictToUserId)) involved.add(t.project_id)
    }
    projects = allProjects.filter(p => involved.has(p.id))
    const keep = new Set(projects.map(p => p.id))
    tasks = tasks.filter(t => keep.has(t.project_id))
  }

  const resources: WLResource[] = (resRes.data ?? []) as WLResource[]
  const clientMap = new Map<string, string>()
  for (const p of projects) clientMap.set(p.client_id, p.client_name)
  const clients = Array.from(clientMap.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return { projects, tasks, resources, clients, multiAssignees, managedProjectIds }
}
