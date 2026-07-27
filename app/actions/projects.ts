'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import type { ProjectStatus } from '@/lib/types/database'

async function requireManagerOrAdmin(projectId?: string) {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) throw new Error('Non autenticato')
  const { data: p } = await sb.from('profiles').select('role, app_role').eq('id', user.id).single()
  if (p?.role === 'admin') return
  if (p?.app_role === 'manager' && projectId) {
    const { data: proj } = await sb.from('projects').select('manager_id').eq('id', projectId).single()
    const { data: mem } = await sb.from('project_members').select('profile_id').eq('project_id', projectId).eq('profile_id', user.id).maybeSingle()
    if (proj?.manager_id === user.id || mem) return
  }
  throw new Error('Permesso negato')
}

export async function updateProjectStatus(projectId: string, status: ProjectStatus) {
  await requireManagerOrAdmin(projectId)
  const { error } = await createAdminClient().from('projects').update({ status }).eq('id', projectId)
  if (error) throw new Error(error.message)
  revalidatePath(`/progetti/${projectId}`)
  revalidatePath('/progetti')
}

// Brief = campo description del progetto (editabile/cancellabile dalla panoramica)
export async function updateProjectBrief(projectId: string, description: string | null) {
  await requireManagerOrAdmin(projectId)
  const { error } = await createAdminClient().from('projects')
    .update({ description: description?.trim() || null }).eq('id', projectId)
  if (error) throw new Error(error.message)
  revalidatePath(`/progetti/${projectId}`)
}

// Elimina il progetto intero (soft-delete). Le task figlie vengono soft-deleted;
// workstream/milestone/ricorrenti restano collegati (cadono su hard-delete futuro).
export async function deleteProject(projectId: string, clientId: string | null) {
  await requireManagerOrAdmin(projectId)
  const admin = createAdminClient()
  const now = new Date().toISOString()
  // soft-delete progetto + tutte le sue task (per non lasciarle orfane nelle viste)
  const { error } = await admin.from('projects').update({ deleted_at: now }).eq('id', projectId)
  if (error) throw new Error(error.message)
  await admin.from('tasks').update({ deleted_at: now }).eq('project_id', projectId).is('deleted_at', null)
  revalidatePath('/progetti')
  revalidatePath(`/clienti/${clientId}`)
}
