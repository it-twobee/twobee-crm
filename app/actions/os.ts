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

export async function updatePhase(id: string, updates: { status?: string; progress?: number; notes?: string; start_date?: string; end_date?: string }) {
  await assertSuperAdmin()
  await createAdminClient().from('os_phases').update(updates).eq('id', id)
  revalidatePath('/twobee-os')
}

export async function createBacklogItem(data: {
  parent_id?: string | null; phase_id?: string | null; level: string; title: string
  description?: string; priority?: string; sprint_target?: number | null; owner?: string; effort_days?: number | null
}) {
  const user = await assertSuperAdmin()
  const { data: item } = await createAdminClient()
    .from('os_backlog_items')
    .insert({ ...data, created_by: user.id })
    .select().single()
  revalidatePath('/twobee-os')
  return item
}

export async function updateBacklogItem(id: string, updates: { status?: string; priority?: string; title?: string; description?: string }) {
  await assertSuperAdmin()
  await createAdminClient().from('os_backlog_items').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id)
  revalidatePath('/twobee-os')
}

export async function deleteBacklogItem(id: string) {
  await assertSuperAdmin()
  await createAdminClient().from('os_backlog_items').delete().eq('id', id)
  revalidatePath('/twobee-os')
}

export async function createIdea(data: {
  name: string; problem?: string; user_type?: string
  impact: number; frequency: number; confidence: number; effort: number
  priority_release?: string; notes?: string
}) {
  const user = await assertSuperAdmin()
  const { data: idea } = await createAdminClient()
    .from('os_ideas')
    .insert({ ...data, created_by: user.id })
    .select().single()
  revalidatePath('/twobee-os')
  return idea
}

export async function updateIdeaStatus(id: string, status: string) {
  await assertSuperAdmin()
  await createAdminClient().from('os_ideas').update({ status }).eq('id', id)
  revalidatePath('/twobee-os')
}

export async function deleteIdea(id: string) {
  await assertSuperAdmin()
  await createAdminClient().from('os_ideas').delete().eq('id', id)
  revalidatePath('/twobee-os')
}
