import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CostPlanClient } from '@/components/costs/CostPlanClient'
import { monthKey } from '@/lib/pl'
import type { CostActual, CostBudget, CostCenter, CostItem } from '@/lib/costs'

export const revalidate = 0

export default async function CostiPage({ searchParams }: { searchParams: { m?: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const month = /^\d{4}-\d{2}-01$/.test(searchParams.m ?? '') ? searchParams.m! : monthKey(new Date())

  const [{ data: centers, error: setupErr }, { data: items }, { data: budgets }, { data: monthRow }] =
    await Promise.all([
      supabase.from('cost_centers').select('*').order('sort_order'),
      // §176: i subappalti (project_id valorizzato) stanno nell'economics del
      // progetto: qui dentro ci sono solo i costi interni e societari, altrimenti
      // il budget di un'area si muoverebbe per una lavorazione venduta al cliente
      supabase.from('cost_items').select('*').is('project_id', null).order('sort_order'),
      supabase.from('cost_budgets').select('*'),
      supabase.from('pl_months').select('id, status').eq('month', month).maybeSingle(),
    ])

  // 42P01 = la 171 non è stata eseguita: va detto, non fallito
  const setupNeeded = setupErr?.code === '42P01'

  const { data: lines } = monthRow && !setupNeeded
    ? await supabase.from('pl_cost_lines')
        .select('id, center_id, cost_item_id, project_id, category, label, cost_type, budget, actual, paid')
        .eq('month_id', monthRow.id).is('project_id', null).order('sort_order')
    : { data: [] }

  // nomi dei progetti dei subappalti: nel piano una lavorazione affidata fuori
  // deve dire a quale lavoro appartiene, altrimenti sembra un costo di struttura
  const projectIds = Array.from(new Set((items ?? [])
    .map((i: { project_id?: string | null }) => i.project_id).filter(Boolean))) as string[]
  const { data: projRows } = projectIds.length
    ? await supabase.from('projects').select('id, name').in('id', projectIds)
    : { data: [] }
  const projectNames = Object.fromEntries(
    (projRows ?? []).map((p: { id: string; name: string }) => [p.id, p.name]))

  const num = (v: unknown) => Number(v ?? 0)

  return (
    <CostPlanClient
      month={month}
      setupNeeded={setupNeeded}
      monthExists={!!monthRow}
      monthLocked={monthRow?.status === 'chiuso'}
      centers={(centers ?? []).map((c: Record<string, unknown>) => ({
        id: String(c.id), name: String(c.name),
        description: (c.description as string) ?? null,
        monthly_budget: num(c.monthly_budget),
        sort_order: num(c.sort_order), is_active: !!c.is_active,
      })) as CostCenter[]}
      projectNames={projectNames}
      items={(items ?? []).map((i: Record<string, unknown>) => ({
        id: String(i.id), center_id: (i.center_id as string) ?? null,
        project_id: (i.project_id as string) ?? null,
        category: String(i.category), label: String(i.label),
        cost_type: i.cost_type === 'V' ? 'V' : 'F',
        amount: num(i.amount), frequency: i.frequency as CostItem['frequency'],
        vat_applied: !!i.vat_applied, vat_rate: num(i.vat_rate),
        supplier: (i.supplier as string) ?? null,
        start_month: (i.start_month as string) ?? null,
        end_month: (i.end_month as string) ?? null,
        is_active: !!i.is_active, note: (i.note as string) ?? null,
      })) as CostItem[]}
      budgets={(budgets ?? []).map((b: Record<string, unknown>) => ({
        id: String(b.id), center_id: String(b.center_id),
        month: String(b.month), amount: num(b.amount),
      })) as CostBudget[]}
      actuals={(lines ?? []).map((l: Record<string, unknown>) => ({
        id: String(l.id), center_id: (l.center_id as string) ?? null,
        cost_item_id: (l.cost_item_id as string) ?? null,
        project_id: (l.project_id as string) ?? null,
        category: String(l.category), label: String(l.label),
        cost_type: l.cost_type === 'V' ? 'V' : 'F',
        budget: num(l.budget), actual: num(l.actual), paid: !!l.paid,
      })) as CostActual[]}
    />
  )
}
