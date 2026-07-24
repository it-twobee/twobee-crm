'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import type { WorkstreamType, WorkstreamStatus, Priority, Visibility } from '@/lib/types/database'

async function requireStaff(): Promise<string> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) throw new Error('Non autenticato')
  const { data: p } = await sb.from('profiles').select('role').eq('id', user.id).single()
  if (p?.role !== 'admin' && p?.role !== 'team') throw new Error('Permesso negato')
  return user.id
}

const rev = (projectId: string) => { revalidatePath(`/progetti/${projectId}`); revalidatePath(`/workspace/progetti/${projectId}`) }

// La milestone di sistema "Operatività continua" nasce dal trigger ensure_system_milestone
export async function createWorkstream(input: {
  project_id: string
  name: string
  workstream_type: WorkstreamType
  start_date?: string | null
  end_date?: string | null
  owner_id?: string | null
  visibility?: Visibility
}) {
  const uid = await requireStaff()
  const { data, error } = await createAdminClient().from('project_workstreams').insert({
    project_id: input.project_id,
    name: input.name.trim(),
    workstream_type: input.workstream_type,
    status: 'active',
    start_date: input.workstream_type === 'project' ? (input.start_date || null) : null,
    end_date: input.workstream_type === 'project' ? (input.end_date || null) : null,
    owner_id: input.owner_id || null,
    visibility: input.visibility ?? 'internal',
    created_by: uid,
  }).select('id').single()
  if (error) throw new Error(error.message)
  rev(input.project_id)
  return data.id as string
}

export async function updateWorkstream(id: string, projectId: string, updates: {
  name?: string
  status?: WorkstreamStatus
  start_date?: string | null
  end_date?: string | null
  owner_id?: string | null
  priority?: Priority
  visibility?: Visibility
}) {
  await requireStaff()
  const { error } = await createAdminClient().from('project_workstreams').update(updates).eq('id', id)
  if (error) throw new Error(error.message)
  rev(projectId)
}

export async function deleteWorkstream(id: string, projectId: string) {
  await requireStaff()
  // milestone e task figlie cadono via ON DELETE CASCADE
  const { error } = await createAdminClient().from('project_workstreams').delete().eq('id', id)
  if (error) throw new Error(error.message)
  rev(projectId)
}
