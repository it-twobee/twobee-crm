'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import type { ResourceProfile } from '@/lib/types/database'

async function assertAdmin() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) throw new Error('Non autenticato')
  const { data: profile } = await sb.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Permesso negato')
}

export type ResourceProfileInput = Omit<ResourceProfile, 'id' | 'created_at' | 'updated_at'>

export async function upsertResourceProfile(input: ResourceProfileInput): Promise<ResourceProfile> {
  await assertAdmin()
  const { data, error } = await createAdminClient()
    .from('resource_profiles')
    .upsert(input, { onConflict: 'profile_id' })
    .select().single()
  if (error) throw new Error(error.message)
  revalidatePath('/hr')
  return data as ResourceProfile
}

export async function deleteResourceProfile(id: string) {
  await assertAdmin()
  const { error } = await createAdminClient().from('resource_profiles').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/hr')
}
