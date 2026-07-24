'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { isSuperAdminRaw } from '@/lib/permissions'
import type { ProjectArea } from '@/lib/types/database'

const PATH = '/impostazioni/catalogo'

async function requireSuperAdmin(): Promise<string> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) throw new Error('Non autenticato')
  const { data: p } = await sb.from('profiles').select('email, app_role').eq('id', user.id).single()
  if (!isSuperAdminRaw(p?.email, p?.app_role)) throw new Error('Permesso negato')
  return user.id
}

export async function createService(input: {
  area: ProjectArea
  service_type: string
  service_subtype?: string | null
  label: string
  sort_order?: number
}) {
  await requireSuperAdmin()
  const { data, error } = await createAdminClient()
    .from('service_catalog')
    .insert({
      area: input.area,
      service_type: input.service_type.trim(),
      service_subtype: input.service_subtype?.trim() || null,
      label: input.label.trim(),
      sort_order: input.sort_order ?? 0,
    })
    .select()
    .single()
  if (error) throw new Error(error.message)
  revalidatePath(PATH)
  return data
}

export async function updateService(
  id: string,
  updates: { label?: string; is_active?: boolean; sort_order?: number },
) {
  await requireSuperAdmin()
  const { error } = await createAdminClient().from('service_catalog').update(updates).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(PATH)
}

export async function deleteService(id: string) {
  await requireSuperAdmin()
  const { error } = await createAdminClient().from('service_catalog').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(PATH)
}
