import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { DepartmentBoard } from '@/components/reparti/DepartmentBoard'
import type { ProjectKind } from '@/lib/types/database'
import type { ExtTask, ExtSprint } from '@/components/projects/SprintMilestoneBoardSection'

const VALID_DEPTS = new Set<string>(['growth', 'marketing', 'digital', 'ai'])

export interface DeptProject {
  id: string; name: string; status: string; project_type: string
  client_id: string | null; client_name: string | null
  client_mrr: number | null; client_risk: number | null
  tasks: ExtTask[]; sprints: ExtSprint[]
}

export interface DeptStats {
  totalProjects: number; activeProjects: number
  totalTasks: number; doneTasks: number
  estimatedHours: number; loggedHours: number
  totalMrr: number; avgRisk: number
  completedSprints: number; activeSprints: number
}

export interface ChatMessage { role: 'user' | 'assistant'; content: string }
export interface SavedChat { id: string; title: string; messages: ChatMessage[]; updated_at: string }

export default async function DeptPage({ params }: { params: { dept: string } }) {
  const dept = params.dept
  if (!VALID_DEPTS.has(dept)) redirect('/reparti/growth')

  const sb = await createClient()

  const [projectsRes, profilesRes, clientsRes, chatRes] = await Promise.all([
    sb.from('projects')
      .select('id, name, status, project_type, client_id, clients(company_name, mrr, risk_score)')
      .eq('project_kind', dept)
      .order('status').order('name'),
    sb.from('profiles')
      .select('id, full_name, email, role')
      .in('role', ['admin', 'team', 'manager'])
      .order('full_name'),
    createAdminClient()
      .from('clients')
      .select('id, company_name')
      .order('company_name'),
    sb.from('dept_ai_chats')
      .select('id, title, messages, updated_at')
      .eq('dept', dept)
      .order('updated_at', { ascending: false })
      .limit(20),
  ])

  const rawProjects = (projectsRes.data ?? []) as unknown as {
    id: string; name: string; status: string; project_type: string
    client_id: string | null
    clients: { company_name: string; mrr: number | null; risk_score: number | null } | null
  }[]

  const clients = (clientsRes.data ?? []) as { id: string; company_name: string }[]
  const savedChats = (chatRes.data ?? []) as SavedChat[]

  if (rawProjects.length === 0) {
    const emptyStats: DeptStats = {
      totalProjects: 0, activeProjects: 0, totalTasks: 0, doneTasks: 0,
      estimatedHours: 0, loggedHours: 0, totalMrr: 0, avgRisk: 0,
      completedSprints: 0, activeSprints: 0,
    }
    return (
      <DepartmentBoard dept={dept as ProjectKind} projects={[]} profiles={[]}
        clients={clients} stats={emptyStats} savedChats={savedChats} />
    )
  }

  const projectIds = rawProjects.map(p => p.id)

  const [tasksRes, sprintsRes] = await Promise.all([
    sb.from('tasks').select('*').in('project_id', projectIds).order('order', { ascending: true }),
    sb.from('sprints').select('*').in('project_id', projectIds).order('start_date', { ascending: true }),
  ])

  const allTasks   = (tasksRes.data   ?? []) as ExtTask[]
  const allSprints = (sprintsRes.data ?? []) as (ExtSprint & { project_id: string })[]

  const projects: DeptProject[] = rawProjects.map(p => ({
    id: p.id, name: p.name, status: p.status,
    project_type: p.project_type, client_id: p.client_id,
    client_name: p.clients?.company_name ?? null,
    client_mrr:  p.clients?.mrr ?? null,
    client_risk: p.clients?.risk_score ?? null,
    tasks:   allTasks.filter(t => t.project_id === p.id),
    sprints: allSprints.filter(s => s.project_id === p.id),
  }))

  const realTasks = allTasks.filter(t => !t.is_milestone && !t.parent_id)
  const risks = projects.map(p => p.client_risk).filter((r): r is number => r !== null)

  const stats: DeptStats = {
    totalProjects:   projects.length,
    activeProjects:  projects.filter(p => p.status === 'attivo').length,
    totalTasks:      realTasks.length,
    doneTasks:       realTasks.filter(t => t.status === 'completato').length,
    estimatedHours:  realTasks.reduce((s, t) => s + (t.estimated_hours ?? 0), 0),
    loggedHours:     realTasks.reduce((s, t) => s + (t.logged_hours ?? 0), 0),
    totalMrr:        projects.reduce((s, p) => s + (p.client_mrr ?? 0), 0),
    avgRisk:         risks.length ? Math.round(risks.reduce((s, r) => s + r, 0) / risks.length) : 0,
    completedSprints: allSprints.filter(s => s.status === 'completato').length,
    activeSprints:    allSprints.filter(s => s.status === 'in_corso').length,
  }

  return (
    <DepartmentBoard
      dept={dept as ProjectKind}
      projects={projects}
      profiles={(profilesRes.data ?? []) as any}
      clients={clients}
      stats={stats}
      savedChats={savedChats}
    />
  )
}
