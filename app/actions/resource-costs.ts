'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import type { ResourceCost } from '@/lib/types/database'

async function assertAdmin() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) throw new Error('Non autenticato')
  const { data: profile } = await sb.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Permesso negato')
}

export type ResourceCostInput = Omit<ResourceCost, 'id' | 'calculated_hourly_cost' | 'created_at' | 'updated_at'>

// costo_orario_reale = (mensile × (1 + overhead%) + tool mensili) / ore fatturabili
// esterni: tariffa oraria · daily: giornaliera/8 · fee/retainer/partner: non orario (null)
export async function computeHourlyCost(input: Pick<ResourceCostInput,
  'cost_type' | 'monthly_cost' | 'hourly_cost' | 'daily_cost' | 'tools_cost_monthly' | 'overhead_percentage' | 'billable_target_hours_month'
>): Promise<number | null> {
  const billable = input.billable_target_hours_month > 0 ? input.billable_target_hours_month : 120
  switch (input.cost_type) {
    case 'monthly_salary':
    case 'retainer': {
      if (input.monthly_cost == null) return null
      const full = input.monthly_cost * (1 + (input.overhead_percentage ?? 0) / 100) + (input.tools_cost_monthly ?? 0)
      return Math.round((full / billable) * 100) / 100
    }
    case 'hourly': return input.hourly_cost ?? null
    case 'daily':  return input.daily_cost != null ? Math.round((input.daily_cost / 8) * 100) / 100 : null
    default:       return null
  }
}

export async function createResourceCost(input: ResourceCostInput): Promise<ResourceCost> {
  await assertAdmin()
  const calculated_hourly_cost = await computeHourlyCost(input)
  const { data, error } = await createAdminClient()
    .from('resource_costs').insert({ ...input, calculated_hourly_cost }).select().single()
  if (error) throw new Error(error.message)
  revalidatePath('/soldi/costi-risorse')
  return data as ResourceCost
}

export async function updateResourceCost(id: string, input: Partial<ResourceCostInput>): Promise<ResourceCost> {
  await assertAdmin()
  const admin = createAdminClient()
  const { data: existing } = await admin.from('resource_costs').select('*').eq('id', id).single()
  if (!existing) throw new Error('Risorsa non trovata')
  const merged = { ...existing, ...input }
  const calculated_hourly_cost = await computeHourlyCost(merged)
  const { data, error } = await admin
    .from('resource_costs').update({ ...input, calculated_hourly_cost }).eq('id', id).select().single()
  if (error) throw new Error(error.message)
  revalidatePath('/soldi/costi-risorse')
  return data as ResourceCost
}

export async function toggleResourceCost(id: string, isActive: boolean) {
  await assertAdmin()
  const { error } = await createAdminClient()
    .from('resource_costs').update({ is_active: isActive }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/soldi/costi-risorse')
}
