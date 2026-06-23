'use server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { SUPER_ADMIN_EMAILS } from '@/lib/permissions'

async function assertSuperAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  const { data: profile } = await supabase.from('profiles').select('email').eq('id', user.id).single()
  if (!profile || !SUPER_ADMIN_EMAILS.includes(profile.email)) throw new Error('Forbidden')
  return user
}

export interface OsTask {
  id: string
  category: 'costruire' | 'modificare' | 'ottimizzare' | 'eliminare'
  priority: 'critica' | 'alta' | 'media' | 'bassa'
  section: string
  status: 'aperto' | 'completato'
  title: string
  description: string | null
  file_paths: string[] | null
  related_files: string[] | null
  effort_days: number | null
  notes: string | null
  is_next_step: boolean
  ai_suggested: boolean
  completed_at: string | null
  created_at: string
}

export async function createOsTask(data: Omit<OsTask, 'id' | 'created_at' | 'is_next_step' | 'ai_suggested' | 'completed_at'>) {
  await assertSuperAdmin()
  const { data: task, error } = await createAdminClient()
    .from('os_tasks')
    .insert(data)
    .select()
    .single()
  if (error) throw new Error(error.message)
  revalidatePath('/twobee-os')
  return task as OsTask | null
}

export async function updateOsTask(id: string, updates: Partial<OsTask>) {
  await assertSuperAdmin()
  await createAdminClient().from('os_tasks').update(updates).eq('id', id)
  revalidatePath('/twobee-os')
}

export async function deleteOsTask(id: string) {
  await assertSuperAdmin()
  await createAdminClient().from('os_tasks').delete().eq('id', id)
  revalidatePath('/twobee-os')
}

export async function completeOsTask(id: string) {
  await assertSuperAdmin()
  await createAdminClient()
    .from('os_tasks')
    .update({ status: 'completato', completed_at: new Date().toISOString(), is_next_step: false })
    .eq('id', id)
  revalidatePath('/twobee-os')
}

export async function setNextStep(taskId: string | null) {
  await assertSuperAdmin()
  const admin = createAdminClient()
  // Clear all first
  await admin.from('os_tasks').update({ is_next_step: false }).neq('id', '00000000-0000-0000-0000-000000000000')
  if (taskId) {
    await admin.from('os_tasks').update({ is_next_step: true }).eq('id', taskId)
  }
  revalidatePath('/twobee-os')
}

export async function acceptAiTask(data: Partial<OsTask> & { depends_on_titles?: string[]; implementation_order?: number }) {
  await assertSuperAdmin()
  // Strip campi non presenti nella schema base di os_tasks
  const payload = {
    category:     data.category ?? 'costruire',
    priority:     data.priority ?? 'media',
    section:      data.section ?? 'dev',
    title:        data.title ?? '',
    description:  data.description ?? null,
    file_paths:   data.file_paths ?? [],
    related_files: data.related_files ?? [],
    effort_days:  data.effort_days ?? null,
    notes:        data.notes ?? null,
    status:       'aperto' as const,
    ai_suggested: true,
  }
  const admin = createAdminClient()
  const { data: task, error } = await admin
    .from('os_tasks')
    .insert(payload)
    .select()
    .single()
  if (error) {
    if (error.code === '23505') {
      // Titolo già esistente — ritorna il task esistente senza errore
      const { data: existing } = await admin
        .from('os_tasks').select().eq('title', payload.title).single()
      revalidatePath('/twobee-os')
      return existing as OsTask | null
    }
    throw new Error(error.message)
  }
  revalidatePath('/twobee-os')
  return task as OsTask | null
}
