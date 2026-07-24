'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { isSuperAdminRaw } from '@/lib/permissions'
import type {
  ProjectTemplateNode,
  WorkstreamType,
  MilestoneType,
  RecurrenceFrequency,
  Priority,
  Visibility,
} from '@/lib/types/database'

const PATH = '/impostazioni/catalogo'

async function requireSuperAdmin(): Promise<string> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) throw new Error('Non autenticato')
  const { data: p } = await sb.from('profiles').select('email, app_role').eq('id', user.id).single()
  if (!isSuperAdminRaw(p?.email, p?.app_role)) throw new Error('Permesso negato')
  return user.id
}

// ── Template ────────────────────────────────────────────────────────────────
export async function createTemplate(input: {
  service_type: string
  service_subtype?: string | null
  name: string
  description?: string | null
}) {
  const uid = await requireSuperAdmin()
  const { data, error } = await createAdminClient()
    .from('project_templates')
    .insert({
      service_type: input.service_type,
      service_subtype: input.service_subtype ?? null,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      created_by: uid,
    })
    .select()
    .single()
  if (error) throw new Error(error.message)
  revalidatePath(PATH)
  return data
}

export async function updateTemplate(
  id: string,
  updates: { name?: string; description?: string | null; is_active?: boolean; sort_order?: number },
) {
  await requireSuperAdmin()
  const { error } = await createAdminClient().from('project_templates').update(updates).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(PATH)
}

export async function deleteTemplate(id: string) {
  await requireSuperAdmin()
  // i nodi cadono via ON DELETE CASCADE
  const { error } = await createAdminClient().from('project_templates').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(PATH)
}

export async function duplicateTemplate(id: string) {
  const uid = await requireSuperAdmin()
  const admin = createAdminClient()
  const { data: tpl, error: e1 } = await admin
    .from('project_templates').select('*').eq('id', id).single()
  if (e1 || !tpl) throw new Error(e1?.message ?? 'Template non trovato')
  const { data: nodes, error: e2 } = await admin
    .from('project_template_nodes').select('*').eq('template_id', id).order('sort_order')
  if (e2) throw new Error(e2.message)

  const { data: copy, error: e3 } = await admin
    .from('project_templates')
    .insert({
      service_type: tpl.service_type,
      service_subtype: tpl.service_subtype,
      name: `${tpl.name} (copia)`,
      description: tpl.description,
      created_by: uid,
    })
    .select().single()
  if (e3 || !copy) throw new Error(e3?.message ?? 'Copia fallita')

  // rimappa i parent_id preservando la gerarchia
  const list = (nodes ?? []) as ProjectTemplateNode[]
  const idMap = new Map<string, string>()
  // ordina genitori prima dei figli (i root hanno parent_id null)
  const ordered = [...list].sort((a, b) => (a.parent_id ? 1 : 0) - (b.parent_id ? 1 : 0))
  for (const n of ordered) {
    const { data: inserted, error } = await admin
      .from('project_template_nodes')
      .insert({
        template_id: copy.id,
        parent_id: n.parent_id ? idMap.get(n.parent_id) ?? null : null,
        node_type: n.node_type,
        name: n.name,
        description: n.description,
        workstream_type: n.workstream_type,
        milestone_type: n.milestone_type,
        frequency: n.frequency,
        suggested_owner_role: n.suggested_owner_role,
        relative_due_days: n.relative_due_days,
        priority: n.priority,
        visibility: n.visibility,
        estimated_hours: n.estimated_hours,
        sort_order: n.sort_order,
      })
      .select('id').single()
    if (error || !inserted) throw new Error(error?.message ?? 'Copia nodo fallita')
    idMap.set(n.id, inserted.id)
  }
  revalidatePath(PATH)
  return copy
}

// ── Nodi del template ─────────────────────────────────────────────────────────
export async function createNode(input: {
  template_id: string
  parent_id?: string | null
  node_type: 'workstream' | 'milestone' | 'task' | 'recurring_task'
  name: string
  description?: string | null
  workstream_type?: WorkstreamType | null
  milestone_type?: MilestoneType | null
  frequency?: RecurrenceFrequency | null
  suggested_owner_role?: string | null
  relative_due_days?: number | null
  priority?: Priority | null
  visibility?: Visibility
  estimated_hours?: number | null
  sort_order?: number
}) {
  await requireSuperAdmin()
  const { data, error } = await createAdminClient()
    .from('project_template_nodes')
    .insert({
      template_id: input.template_id,
      parent_id: input.parent_id ?? null,
      node_type: input.node_type,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      workstream_type: input.workstream_type ?? null,
      milestone_type: input.milestone_type ?? null,
      frequency: input.frequency ?? null,
      suggested_owner_role: input.suggested_owner_role?.trim() || null,
      relative_due_days: input.relative_due_days ?? null,
      priority: input.priority ?? null,
      visibility: input.visibility ?? 'internal',
      estimated_hours: input.estimated_hours ?? null,
      sort_order: input.sort_order ?? 0,
    })
    .select().single()
  if (error) throw new Error(error.message)
  revalidatePath(PATH)
  return data
}

export async function updateNode(
  id: string,
  updates: Partial<Pick<ProjectTemplateNode,
    'name' | 'description' | 'workstream_type' | 'milestone_type' | 'frequency' |
    'suggested_owner_role' | 'relative_due_days' | 'priority' | 'visibility' |
    'estimated_hours' | 'sort_order'>>,
) {
  await requireSuperAdmin()
  const { error } = await createAdminClient().from('project_template_nodes').update(updates).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(PATH)
}

export async function deleteNode(id: string) {
  await requireSuperAdmin()
  // i figli cadono via ON DELETE CASCADE
  const { error } = await createAdminClient().from('project_template_nodes').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(PATH)
}
