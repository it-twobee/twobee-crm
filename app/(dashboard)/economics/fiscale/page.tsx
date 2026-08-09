import { createClient } from '@/lib/supabase/server'
import { getSessionUser, getSessionProfile } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { TaxClient } from '@/components/tax/TaxClient'
import { monthKey } from '@/lib/pl'
import type { MonthVat, VatActual } from '@/lib/vat'
import { DEFAULT_TAX_CONFIG, type Provision, type TaxConfig } from '@/lib/tax'

export const revalidate = 0

export default async function FiscalePage({ searchParams }: { searchParams: { m?: string } }) {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  const supabase = await createClient()
  const profile = await getSessionProfile()
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
        supabase.from('pl_cost_lines').select('month_id, actual, vat_applied, vat_rate, category, label, deductible_pct, vat_deductible_pct, partner_id').in('month_id', ids),
      ])
    : [{ data: [] }, { data: [] }]

  const num = (v: unknown) => Number(v ?? 0)
  /* Percentuale di deducibilità: assente = piena. Una colonna che non c'è ancora
     (migration non eseguita) non deve azzerare un costo: lo zero si legge come
     «non deducibile» e cambierebbe l'imposta. */
  const pctOf = (v: unknown) => {
    if (v == null) return 1
    const x = Number(v)
    return Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 1
  }

  const vatMonths: MonthVat[] = (months ?? []).map((m: { id: string; month: string }) => ({
    month: m.month,
    debit: (rev ?? []).filter((r: { month_id: string }) => r.month_id === m.id)
      .reduce((s: number, r: Record<string, unknown>) => s + num(r.amount_net) * num(r.vat_rate), 0),
    /* §191 — l'IVA a credito è quella **detraibile**: su un pranzo con lo
       scontrino è zero, sul carburante a uso promiscuo è il 40%. Contarla per
       intero gonfierebbe il credito e la liquidazione arriverebbe più alta. */
    credit: (cost ?? []).filter((c: { month_id: string; vat_applied: boolean }) => c.month_id === m.id && c.vat_applied)
      .reduce((s: number, c: Record<string, unknown>) =>
        s + num(c.actual) * num(c.vat_rate) * pctOf(c.vat_deductible_pct), 0),
  }))

  /* §242 — i modelli F24 già arrivati. Dove c'è il documento, il documento
     vince: la stima resta accanto e la differenza dice quanto fatturato manca
     al conto economico. Se la 206 non è stata eseguita la query fallisce e la
     pagina continua a stimare, come prima. */
  const { data: settlementRows } = await supabase
    .from('vat_settlements').select('year, quarter, to_pay, doc_ref, paid_on')
  const vatActuals: VatActual[] = (settlementRows ?? []).map((r: Record<string, unknown>) => ({
    quarter: { year: Number(r.year), q: Number(r.quarter) as 1 | 2 | 3 | 4 },
    toPay: num(r.to_pay),
    docRef: (r.doc_ref as string) ?? null,
    paidOn: r.paid_on ? String(r.paid_on).slice(0, 10) : null,
  }))

  // ── i numeri dell'anno che alimentano stime e diagnosi ────────────────────

  const revenueYtd = (rev ?? []).reduce((s: number, r: Record<string, unknown>) => s + num(r.amount_net), 0)
  const costsYtd = (cost ?? []).reduce((s: number, c: Record<string, unknown>) => s + num(c.actual), 0)
  // §191 — quanto di quei costi non abbassa l'imponibile: va riaggiunto alla base
  const nonDeductibleYtd = (cost ?? []).reduce((s: number, c: Record<string, unknown>) =>
    s + num(c.actual) * (1 - pctOf(c.deductible_pct)), 0)
  /* §191 — la rappresentanza ha un tetto annuo proporzionale ai ricavi, e si
     riconosce dal trattamento: 75% deducibile e IVA indetraibile è la firma dei
     pasti e dell'ospitalità. Leggerla dall'etichetta sarebbe più fragile: le
     etichette le scrive una persona, le percentuali le scrive il motore. */
  const entertainmentYtd = (cost ?? []).filter((c: Record<string, unknown>) =>
    Math.abs(pctOf(c.deductible_pct) - 0.75) < 0.001)
    .reduce((s: number, c: Record<string, unknown>) => s + num(c.actual), 0)
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

  /* §184 — le agevolazioni: quello che il tool sa già dell'organico. Le
     assunzioni dell'anno alimentano la maxi-deduzione, gli esoneri dicono
     quanti contributi non stiamo versando (e quali stiamo lasciando lì). */
  const [{ data: people }, { data: prm }, { data: incentiveRows }] = await Promise.all([
    supabase.from('hr_people').select('*').eq('is_active', true),
    supabase.from('hr_payroll_params').select('*').eq('year', Number(year)).maybeSingle(),
    supabase.from('hr_incentives').select('*').order('sort_order'),
  ])

  let newHires = 0, newHiresCost = 0, protectedCost = 0, contribRelief = 0, reliefAvailable = 0, impatriates = 0
  if ((people ?? []).length) {
    const { personCost, incentiveOptions, contractSpec, DEFAULT_PAYROLL_PARAMS } = await import('@/lib/payroll')
    const { rowToParams, rowToPerson, rowsToIncentives } = await import('@/lib/payroll-map')
    const params = prm
      ? rowToParams(prm as Record<string, unknown>, rowsToIncentives(incentiveRows as Record<string, unknown>[] | null))
      : DEFAULT_PAYROLL_PARAMS

    for (const row of (people ?? []) as Record<string, unknown>[]) {
      const person = rowToPerson(row)
      if (contractSpec(person.kind).employment !== 'subordinato') continue
      const c = personCost(person, params)
      if (person.hiredOn?.slice(0, 4) === year && (person.kind === 'indeterminato' || person.kind === 'apprendistato')) {
        newHires++
        newHiresCost += c.total
        if (person.protectedCategory) protectedCost += c.total
      }
      contribRelief += c.relief
      if (person.impatriateFrom) impatriates++
      if (!person.incentiveCode) {
        const best = incentiveOptions(person, params, `${year}-12-31`).find(o => o.eligible && o.value > 0)
        reliefAvailable += best?.value ?? 0
      }
    }
  }

  // investimenti in beni strumentali registrati nel piano: alimentano l'iper-ammortamento
  const investments = ((items ?? []) as PlanItem[])
    .filter(i => /hardware|attrezzatur|macchinar|server|pc |computer|impiant|software gestion/i.test(i.label))
    .reduce((s, i) => s + yearly(i), 0)

  return (
    <TaxClient
      month={month}
      newHires={newHires}
      newHiresCost={Math.round(newHiresCost)}
      protectedCost={Math.round(protectedCost)}
      contribRelief={Math.round(contribRelief)}
      reliefAvailable={Math.round(reliefAvailable)}
      impatriates={impatriates}
      investments={Math.round(investments)}
      today={new Date().toISOString().slice(0, 10)}
      setupNeeded={setupNeeded}
      config={cfgRow ? {
        ires_pct: num(cfgRow.ires_pct), irap_pct: num(cfgRow.irap_pct),
        irap_applies: cfgRow.irap_applies ?? true,
        set_aside_pct: num(cfgRow.set_aside_pct),
        irap_addback_pct: num(cfgRow.irap_addback_pct),
        maxi_deduction_pct: cfgRow.maxi_deduction_pct == null
          ? DEFAULT_TAX_CONFIG.maxi_deduction_pct : num(cfgRow.maxi_deduction_pct),
        maxi_deduction_protected_pct: cfgRow.maxi_deduction_protected_pct == null
          ? DEFAULT_TAX_CONFIG.maxi_deduction_protected_pct : num(cfgRow.maxi_deduction_protected_pct),
        hyper_amort_pct: cfgRow.hyper_amort_pct == null
          ? DEFAULT_TAX_CONFIG.hyper_amort_pct : num(cfgRow.hyper_amort_pct),
        hyper_amort_cap: cfgRow.hyper_amort_cap == null
          ? DEFAULT_TAX_CONFIG.hyper_amort_cap : num(cfgRow.hyper_amort_cap),
      } as TaxConfig : DEFAULT_TAX_CONFIG}
      provisions={(provisions ?? []).map((p: Record<string, unknown>) => ({
        id: String(p.id), month: String(p.month),
        kind: p.kind === 'iva' ? 'iva' : 'imposte',
        amount: num(p.amount), note: (p.note as string) ?? null,
      })) as Provision[]}
      vatMonths={vatMonths}
      vatActuals={vatActuals}
      revenueYtd={revenueYtd}
      costsYtd={costsYtd}
      nonDeductibleYtd={nonDeductibleYtd}
      entertainmentYtd={entertainmentYtd}
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
