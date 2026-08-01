import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { TaxClient } from '@/components/tax/TaxClient'
import { monthKey } from '@/lib/pl'
import type { MonthVat } from '@/lib/vat'
import { DEFAULT_TAX_CONFIG, type Provision, type TaxConfig } from '@/lib/tax'

export const revalidate = 0

export default async function FiscalePage({ searchParams }: { searchParams: { m?: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const month = /^\d{4}-\d{2}-01$/.test(searchParams.m ?? '') ? searchParams.m! : monthKey(new Date())
  const year = month.slice(0, 4)

  const [{ data: cfgRow, error: cfgErr }, { data: provisions }, { data: months }] = await Promise.all([
    supabase.from('tax_config').select('*').eq('id', true).maybeSingle(),
    supabase.from('tax_provisions').select('*').gte('month', `${year}-01-01`).lte('month', `${year}-12-01`).order('month'),
    supabase.from('pl_months').select('id, month').gte('month', `${year}-01-01`).lte('month', `${year}-12-01`).order('month'),
  ])

  // 42P01 = la 175 non è stata eseguita
  const setupNeeded = cfgErr?.code === '42P01'

  const ids = (months ?? []).map((m: { id: string }) => m.id)
  const [{ data: rev }, { data: cost }] = ids.length
    ? await Promise.all([
        supabase.from('pl_revenue_lines').select('month_id, amount_net, vat_rate, paid').in('month_id', ids),
        supabase.from('pl_cost_lines').select('month_id, actual, vat_applied, vat_rate, category, label').in('month_id', ids),
      ])
    : [{ data: [] }, { data: [] }]

  const num = (v: unknown) => Number(v ?? 0)

  const vatMonths: MonthVat[] = (months ?? []).map((m: { id: string; month: string }) => ({
    month: m.month,
    debit: (rev ?? []).filter((r: { month_id: string }) => r.month_id === m.id)
      .reduce((s: number, r: Record<string, unknown>) => s + num(r.amount_net) * num(r.vat_rate), 0),
    credit: (cost ?? []).filter((c: { month_id: string; vat_applied: boolean }) => c.month_id === m.id && c.vat_applied)
      .reduce((s: number, c: Record<string, unknown>) => s + num(c.actual) * num(c.vat_rate), 0),
  }))

  // ── i numeri dell'anno che alimentano stime e diagnosi ────────────────────
  const revenueYtd = (rev ?? []).reduce((s: number, r: Record<string, unknown>) => s + num(r.amount_net), 0)
  const costsYtd = (cost ?? []).reduce((s: number, c: Record<string, unknown>) => s + num(c.actual), 0)
  const monthsBooked = (months ?? []).filter((m: { id: string }) =>
    (rev ?? []).some((r: { month_id: string }) => r.month_id === m.id)).length

  const costsWithVat = (cost ?? []).filter((c: { vat_applied: boolean }) => c.vat_applied)
    .reduce((s: number, c: Record<string, unknown>) => s + num(c.actual), 0)
  const costsWithoutVat = Math.max(0, costsYtd - costsWithVat)

  const vatOnUnpaid = (rev ?? []).filter((r: { paid: boolean }) => !r.paid)
    .reduce((s: number, r: Record<string, unknown>) => s + num(r.amount_net) * num(r.vat_rate), 0)

  // quanto dell'anno cade negli ultimi tre mesi: è quello che pesa a giugno
  const q4Ids = new Set((months ?? [])
    .filter((m: { month: string }) => Number(m.month.slice(5, 7)) >= 10)
    .map((m: { id: string }) => m.id))
  const q4Revenue = (rev ?? []).filter((r: { month_id: string }) => q4Ids.has(r.month_id))
    .reduce((s: number, r: Record<string, unknown>) => s + num(r.amount_net), 0)

  // segnali dal piano dei costi: welfare, formazione, sviluppo interno
  const { data: items } = await supabase.from('cost_items')
    .select('label, category, amount, frequency, is_active').eq('is_active', true)
  const text = (items ?? []).map((i: { label: string; category: string }) => `${i.label} ${i.category}`.toLowerCase())
  const has = (...words: string[]) => text.some(t => words.some(w => t.includes(w)))
  type PlanItem = { label: string; category: string; amount: unknown; frequency: string }
  const yearly = (i: PlanItem) =>
    i.frequency === 'una_tantum' ? num(i.amount)
      : num(i.amount) * (i.frequency === 'mensile' ? 12 : i.frequency === 'trimestrale' ? 4
        : i.frequency === 'bimestrale' ? 6 : i.frequency === 'semestrale' ? 2 : 1)
  // sviluppo interno: AI, repository, infrastruttura. Sono i costi che un
  // prodotto costruito in casa genera, e che valgono più di una spesa
  const rndSpend = ((items ?? []) as PlanItem[])
    .filter(i => /ai tools|claude|gpt|github|vps|hosting|repository/i.test(i.label))
    .reduce((s, i) => s + yearly(i), 0)

  return (
    <TaxClient
      month={month}
      today={new Date().toISOString().slice(0, 10)}
      setupNeeded={setupNeeded}
      config={cfgRow ? {
        ires_pct: num(cfgRow.ires_pct), irap_pct: num(cfgRow.irap_pct),
        irap_applies: cfgRow.irap_applies ?? true,
        set_aside_pct: num(cfgRow.set_aside_pct),
        irap_addback_pct: num(cfgRow.irap_addback_pct),
      } as TaxConfig : DEFAULT_TAX_CONFIG}
      provisions={(provisions ?? []).map((p: Record<string, unknown>) => ({
        id: String(p.id), month: String(p.month),
        kind: p.kind === 'iva' ? 'iva' : 'imposte',
        amount: num(p.amount), note: (p.note as string) ?? null,
      })) as Provision[]}
      vatMonths={vatMonths}
      revenueYtd={revenueYtd}
      costsYtd={costsYtd}
      monthsBooked={monthsBooked}
      costsWithVat={costsWithVat}
      costsWithoutVat={costsWithoutVat}
      vatOnUnpaid={vatOnUnpaid}
      q4Share={revenueYtd > 0 ? q4Revenue / revenueYtd : 0}
      hasWelfare={has('welfare', 'benefit', 'fringe')}
      hasTraining={has('formazione', 'corso', 'certificazion', 'training')}
      rndSpend={rndSpend}
    />
  )
}
