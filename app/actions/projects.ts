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
