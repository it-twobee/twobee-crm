import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { forecastOptions, labForecast, eventCurve, searchCustomerMix, templateSample } from '@/lib/lab-forecast'
import { DEFAULT_PL_CONFIG } from '@/lib/pl'
import type { EconomicsInput } from '@/lib/lab-economics'
import { toLabInvoices } from '@/lib/lab-invoices'

const growth = { id: 'g', label: 'Growth tipo', status: 'attivo', billing: 'recurring', kind: 'growth', amount: 1000, vat_rate: .22,
  start_date: '2026-01-01', end_date: null, project_id: 'pg', client_id: 'cg', payment_terms: 'giorni_15' } as EconomicsInput['streams'][number]
const digital = { ...growth, id: 'd', label: 'Digital tipo', kind: 'digital', billing: 'one_off', amount: 6000, project_id: 'pd', client_id: 'cd' } as EconomicsInput['streams'][number]
const input: EconomicsInput = { month: '2026-11-01', today: '2026-11-14', observedAt: '2026-11-14T12:00:00Z',
  streams: [growth, digital], installments: [{ id: 'i1', stream_id: 'd', due_month: '2026-08-01', amount: 3000, label: 'Acconto', invoiced: true, paid: true }, { id: 'i2', stream_id: 'd', due_month: '2026-10-01', amount: 3000, label: 'Saldo', invoiced: true, paid: true }],
  links: [], items: [{ id: 'ext', project_id: 'pd', installment_id: 'i1', label: 'Esterno', amount: 1000, frequency: 'una_tantum', is_active: true, start_month: '2026-08-01', vat_applied: true, vat_rate: .22 } as unknown as EconomicsInput['items'][number]],
  months: [], revenue: [], costs: [], clients: [], config: [{ ...DEFAULT_PL_CONFIG, id: true }], partners: ['Marco', 'Walter', 'Toto'].map((label, n) => ({ id: 'p'+n, label, is_active: true, takes_delivery: true, takes_residual: true })),
  accounts: [], txs: [], allocations: [], legacy: [], invoices: [] }
const defaults = forecastOptions({})
const result = labForecast(input, defaults)
assert.equal(result.from, '2026-12-01')
assert.equal(result.base.rows.length, 6)
assert.deepEqual(result.base, result.scenario, 'Caso neutro: stessa base, anche con rate passate')
assert.deepEqual(labForecast(input, { ...defaults, riskFund: true }).base, result.base, 'Il fondo scelto per i nuovi clienti non cambia la base esistente')
assert.equal(result.cashDelta, 0)
assert.ok(result.delta.every(r => r.revenue === 0 && r.cost === 0 && r.companyBeforeCapacity === 0))
assert.equal(result.proposal.status, 'incompleta', 'Saldo/IVA ignoti non producono numero di clienti necessario')
const frozen = JSON.stringify(input)
const sim = labForecast(input, { ...defaults, growth: 1, digital: 1, growthProfile: 'g', digitalProfile: 'd', externalComplete: true })
assert.equal(JSON.stringify(input), frozen, 'Nessuna modifica delle fonti')
assert.equal(sim.delta[0].revenue, 4000)
assert.equal(sim.delta[1].revenue, 1000, 'Il digital a corpo non diventa un canone mensile')
assert.equal(sim.delta[2].revenue, 4000, 'La seconda rata conserva la distanza di due mesi')
assert.equal(sim.delta[0].cost, 1000)
assert.equal(sim.delta[0].partners[0].amount, 750, 'Effetto soci dal medesimo motore, distinto dal contributo societario')
const externalSales = labForecast({ ...input, clients: [{ id: 'cg', sales_owner_name: 'Consulente esterno' }] }, { ...defaults, growth: 1, growthProfile: 'g', externalComplete: true })
assert.equal(externalSales.delta[0].partners[0].amount, 100, 'Il commerciale anagrafico del profilo non diventa un pool fra soci')
const leadCost = labForecast({ ...input, items: [{ ...input.items[0], installment_id: null, start_month: '2026-07-01' }] }, { ...defaults, digital: 1, digitalProfile: 'd', externalComplete: true })
assert.ok(leadCost.extraEvents.some(e => e.kind === 'fornitore' && e.date === '2026-11-30'), 'Anticipo di costo prima dell’avvio non perso al bordo dell’orizzonte')
assert.equal(leadCost.curve.minimum, -1220)
assert.equal(labForecast(input, { ...defaults, growth: 1, growthProfile: 'g' }).delta[0].cost, null, 'Esterni non confermati come ipotesi non diventano zero')
const noProfile = labForecast(input, { ...defaults, digital: 1 })
assert.equal(noProfile.delta[0].revenue, null)
assert.equal(noProfile.cashDelta, null)
const late = labForecast(input, { ...defaults, growth: 1, growthProfile: 'g', externalComplete: true, mode: 'ritardo', delay: 60 })
const incoming = late.extraEvents.find(e => e.kind === 'incasso')!, paid = late.extraEvents.find(e => e.kind === 'compenso')!
assert.ok(paid.date >= incoming.date, 'Compenso mai prima della copertura simulata')
const stress = labForecast(input, { ...defaults, digital: 1, digitalProfile: 'd', externalComplete: true, mode: 'senza' })
assert.ok(stress.extraEvents.some(e => e.kind === 'fornitore'), 'Stress non cancella i fornitori')
assert.ok(stress.extraEvents.every(e => e.kind !== 'incasso' && e.kind !== 'compenso'))
const shared = labForecast({ ...input, links: [{ stream_id: 'g', project_id: 'a' }, { stream_id: 'g', project_id: 'b' }] }, { ...defaults, growth: 1, growthProfile: 'g' })
assert.equal(shared.cashDelta, null, 'Nessun costo inventato per profilo pluriprogetto')
assert.equal(templateSample([{ ...growth, status: 'bozza' }], 'growth').eligible.length, 0)
assert.equal(templateSample([growth], 'growth').automaticTicket, null)
const mismatched = labForecast({ ...input, streams: [growth, { ...digital, amount: 7000 }] }, { ...defaults, digital: 1, digitalProfile: 'd', externalComplete: true })
assert.equal(mismatched.cashDelta, null, 'Rate non coerenti col totale non generano un cliente tipo certo')
assert.throws(() => labForecast({ ...input, config: [] }, defaults), /Fonte numerica/)
assert.throws(() => labForecast({ ...input, config: [{ ...input.config[0], growth_sales_pct: 5 }] }, defaults), /Fonte numerica/)
const decMonth = { id: 'dec', month: '2026-12-01' }
const withOpen = labForecast({ ...input, months: [decMonth], revenue: [{ id: 'r', month_id: 'dec', stream_id: 'g', amount_net: 500, plan_amount: 500, invoices: 1, kind: 'growth', vat_rate: .22 }] }, defaults)
assert.equal(withOpen.base.rows[0].revenue, 500, 'Mese registrato sostituisce il contratto, non si aggiunge')
const invoice = toLabInvoices([{ id: 'doc', direction: 'emessa', sign: 1, issued_on: '2026-11-01', taxable: 500, vat_amount: 110, total: 610, withholding: 0, currency: 'EUR' }])[0]
const prepaid = labForecast({ ...input, months: [decMonth], accounts: [{ id: 'a', currency: 'EUR' } as EconomicsInput['accounts'][number]],
  revenue: [{ id: 'r', month_id: 'dec', invoice_id: 'doc', stream_id: 'g', amount_net: 500, kind: 'growth', vat_rate: .22 }], invoices: [invoice],
  txs: [{ id: 't', source: 'banca', account_id: 'a', amount: 610, booked_on: '2026-11-10', invoice_id: 'doc', revenue_line_id: 'r' } as EconomicsInput['txs'][number]] }, defaults)
assert.ok(!prepaid.base.events.some(e => e.sourceId === 'g' && e.date.startsWith('2026-12')), 'Incasso già osservato non entra di nuovo negli eventi futuri')
const curve = eventCurve([{ id: 'out', date: '2026-12-02', amount: -1000 }, { id: 'in', date: '2026-12-30', amount: 1200 }] as Parameters<typeof eventCurve>[0], '2026-12-01', '2026-12-31', 0)
assert.equal(curve.minimum, -1000); assert.equal(curve.minOn, '2026-12-02'); assert.equal(curve.final, 200)
assert.equal(eventCurve([{ id: 'x', date: '2026-12-02', amount: -1000 }, { id: 'x', date: '2026-12-02', amount: -1000 }] as Parameters<typeof eventCurve>[0], '2026-12-01', '2026-12-31', 0).final, -1000)
assert.throws(() => eventCurve([{ id: 'x', date: '2026-12-02', amount: -1000 }, { id: 'x', date: '2026-12-03', amount: -1000 }] as Parameters<typeof eventCurve>[0], '2026-12-01', '2026-12-31', 0), /Evento incoerente/)
assert.equal(searchCustomerMix({ complete: false, capacityGrowth: 20, capacityDigital: 20, evaluate: () => ({ minimum: 1000, fixed: 0 }) }).status, 'incompleta')
const best = searchCustomerMix({ complete: true, capacityGrowth: 2, capacityDigital: 2, evaluate: (g, d) => ({ minimum: -1000 + g*1000+d*800, fixed: d*100 }) })
assert.equal(best.status, 'condizionata'); assert.equal(best.growth, 1); assert.equal(best.digital, 0)
assert.equal(searchCustomerMix({ complete: true, capacityGrowth: 0, capacityDigital: 0, evaluate: () => ({ minimum: -1, fixed: 0 }) }).status, 'insufficiente')
assert.equal(forecastOptions({ growth: '99999', digital: '-1', capacitaGrowth: '' }).growth, 0)
assert.equal(forecastOptions({ capacitaGrowth: '' }).capacityGrowth, null)
for (const path of ['lib/lab-forecast-load.ts', 'app/(dashboard)/lab/previsionale/page.tsx']) {
  const source = readFileSync(path, 'utf8')
  assert.match(source, /await requireLabAdmin\(\)/)
  assert.doesNotMatch(source, /\.\s*(insert|update|upsert|delete|rpc)\s*\(/)
  assert.doesNotMatch(source, /from ['"]@\/app\/actions\//)
}
console.log('Tutti i controlli passano')
