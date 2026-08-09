'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { requireEconomicsAdmin as requireAdmin } from '@/lib/economics-guard'
import type { TaxConfig } from '@/lib/tax'

const PATH = '/economics/fiscale'


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
