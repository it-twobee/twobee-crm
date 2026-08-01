'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { SUPER_ADMIN_EMAILS } from '@/lib/permissions'
import type { TaxConfig } from '@/lib/tax'

const PATH = '/economics/fiscale'

/** Aliquote e accantonamenti: il dato più sensibile che c'è. Admin e basta. */
async function requireAdmin(): Promise<string> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) throw new Error('Non autenticato')
  const { data: p } = await sb.from('profiles').select('role, email').eq('id', user.id).single()
  const ok = p?.role === 'admin' || SUPER_ADMIN_EMAILS.includes(p?.email ?? '')
  if (!ok) throw new Error('Permesso negato: la sezione fiscale è riservata agli admin')
  return user.id
}

export async function updateTaxConfig(patch: Partial<TaxConfig> & { note?: string | null }) {
  await requireAdmin()
  const { error } = await createAdminClient().from('tax_config')
    .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', true)
  if (error) throw new Error(error.message)
  revalidatePath(PATH)
}

/**
 * Quanto hai messo davvero da parte.
 *
 * È la riga che trasforma il tool da «ecco quanto dovrai pagare» a «ecco se
 * sei coperto». Senza, resta un preventivo che nessuno confronta col conto.
 */
export async function addProvision(month: string, kind: 'iva' | 'imposte', amount: number, note?: string) {
  await requireAdmin()
  const { error } = await createAdminClient().from('tax_provisions')
    .insert({ month, kind, amount, note: note ?? null })
  if (error) throw new Error(error.message)
  revalidatePath(PATH)
}

export async function updateProvision(id: string, patch: Partial<{ month: string; kind: 'iva' | 'imposte'; amount: number; note: string | null }>) {
  await requireAdmin()
  const { error } = await createAdminClient().from('tax_provisions').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(PATH)
}

export async function deleteProvision(id: string) {
  await requireAdmin()
  const { error } = await createAdminClient().from('tax_provisions').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(PATH)
}
