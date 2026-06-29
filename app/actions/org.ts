'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

async function assertAdmin() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) throw new Error('Non autenticato')
  const { data: profile } = await sb.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Permesso negato')
}

export async function createOrgUnit(name: string, color: string, position: number) {
  await assertAdmin()
  const { data, error } = await createAdminClient()
    .from('org_units').insert({ name, color, position }).select().single()
  if (error) throw new Error(error.message)
  revalidatePath('/hr')
  return data
}

export async function updateOrgUnit(id: string, updates: { name?: string; color?: string; responsibilities?: string | null; lead_id?: string | null }) {
  await assertAdmin()
  const { error } = await createAdminClient().from('org_units').update(updates).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/hr')
}

export async function deleteOrgUnit(id: string) {
  await assertAdmin()
  await createAdminClient().from('org_units').delete().eq('id', id)
  revalidatePath('/hr')
}

export async function addOrgMember(unitId: string, profileId: string, roleInUnit: string | null) {
  await assertAdmin()
  const { data, error } = await createAdminClient()
    .from('org_members')
    .upsert({ unit_id: unitId, profile_id: profileId, role_in_unit: roleInUnit }, { onConflict: 'unit_id,profile_id' })
    .select().single()
  if (error) throw new Error(error.message)
  revalidatePath('/hr')
  return data
}

export async function removeOrgMember(id: string) {
  await assertAdmin()
  await createAdminClient().from('org_members').delete().eq('id', id)
  revalidatePath('/hr')
}
