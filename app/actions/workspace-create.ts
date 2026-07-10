'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminRole, isSuperAdminRaw } from '@/lib/permissions'
import { revalidatePath } from 'next/cache'

// La RLS vieta ai ruoli 'team' di inserire progetti/sprint. Questi action girano
// col service role ma solo dopo aver verificato che il chiamante sia
// manager/senior (o admin+). Nessun altro ruolo può crearli dalla dashboard.
async function guard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' as const }
  const { data: me } = await supabase
    .from('profiles').select('app_role, email').eq('id', user.id).single()
  const role = me?.app_role ?? null
  const allowed = role === 'manager' || role === 'senior'
    || isAdminRole(role) || isSuperAdminRaw(me?.email, role)
  if (!allowed) return { error: 'Permessi insufficienti' as const }
  return { userId: user.id, admin: createAdminClient() }
}

export async function createProjectWs(input: {
  clientId: string; name: string; description?: string
  projectKind?: 'growth' | 'digital'; projectType?: string
}) {
  const g = await guard()
  if ('error' in g) return { ok: false, error: g.error }
  if (!input.clientId || !input.name.trim()) return { ok: false, error: 'Cliente e nome obbligatori' }

  const { data, error } = await g.admin.from('projects').insert({
    client_id: input.clientId,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    status: 'attivo',
    project_kind: input.projectKind ?? 'growth',
    project_type: input.projectType ?? 'custom',
    sprint_current: 1,
  } as never).select('id, name').single()

  if (error) return { ok: false, error: error.message }
  revalidatePath('/workspace')
  revalidatePath('/workspace/progetti')
  return { ok: true, project: data as { id: string; name: string } }
}

export async function createSprintWs(input: {
  projectId: string; name: string; startDate?: string; endDate?: string
}) {
  const g = await guard()
  if ('error' in g) return { ok: false, error: g.error }
  if (!input.projectId || !input.name.trim()) return { ok: false, error: 'Progetto e nome obbligatori' }

  const { data, error } = await g.admin.from('sprints').insert({
    project_id: input.projectId,
    name: input.name.trim(),
    start_date: input.startDate || null,
    end_date: input.endDate || null,
    status: 'pianificato',
  } as never).select('id, name').single()

  if (error) return { ok: false, error: error.message }
  revalidatePath('/workspace')
  revalidatePath('/workspace/progetti')
  return { ok: true, sprint: data as { id: string; name: string } }
}

// Task delle "Mie attività": la crea qualunque membro interno per sé stesso.
// Con projectId è una task di progetto (condivisa); senza, è personale/privata
// (project_id NULL → invisibile ai colleghi via RLS, vedi migration 094).
// Passa dal service role perché la RLS vieta al team di scrivere task su clienti
// non assegnati; qui verifichiamo solo che sia staff interno e che assegni a sé.
export async function createMyTask(input: {
  title: string; projectId?: string | null; dueDate?: string; priority?: string
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Non autenticato' }
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'admin' && me?.role !== 'team') return { ok: false, error: 'Permessi insufficienti' }
  if (!input.title.trim()) return { ok: false, error: 'Titolo obbligatorio' }

  const admin = createAdminClient()
  const { data, error } = await admin.from('tasks').insert({
    title: input.title.trim(),
    assignee_id: user.id,
    status: 'da_fare',
    priority: input.priority ?? 'media',
    project_id: input.projectId || null,
    due_date: input.dueDate || null,
    is_milestone: false,
    tags: [],
    logged_hours: 0,
    depth: 0,
    position: 0,
  } as never)
    .select('*, assignee:profiles!tasks_assignee_id_fkey(id, full_name, avatar_url), project:projects(id, name, client_id, clients(company_name))')
    .single()

  if (error) return { ok: false, error: error.message }
  revalidatePath('/workspace/attivita')
  revalidatePath('/le-mie-attivita')
  return { ok: true, task: data }
}

export async function createTaskWs(input: {
  projectId: string; title: string; isMilestone?: boolean
  sprintId?: string; dueDate?: string; priority?: string; assigneeId?: string
}) {
  const g = await guard()
  if ('error' in g) return { ok: false, error: g.error }
  if (!input.projectId || !input.title.trim()) return { ok: false, error: 'Progetto e titolo obbligatori' }

  const { data, error } = await g.admin.from('tasks').insert({
    project_id: input.projectId,
    title: input.title.trim(),
    status: 'da_fare',
    priority: input.priority ?? 'media',
    is_milestone: input.isMilestone ?? false,
    sprint_id: input.sprintId || null,
    due_date: input.dueDate || null,
    assignee_id: input.assigneeId || g.userId,
    tags: [],
    logged_hours: 0,
    depth: 0,
    position: 0,
  } as never).select('id, title').single()

  if (error) return { ok: false, error: error.message }
  revalidatePath('/workspace')
  revalidatePath('/workspace/task')
  return { ok: true, task: data as { id: string; title: string } }
}
