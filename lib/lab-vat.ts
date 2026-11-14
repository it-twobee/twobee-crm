import { monthsVat, vatByQuarter, quarterOf, quarterMonths, type VatActual, type VatRevRow, type VatCostRow } from '@/lib/vat'
import { vatByQuarter as documentVat } from '@/lib/invoices'
import { vatOf, type VatSources } from '@/lib/mese-banca'
import { knownAmount } from '@/lib/lab-deals'
import { resourceF24, type ResourceRow, type ResourceTx } from '@/lib/lab-resources'
import type { LabInvoice } from '@/lib/lab-invoices'
import type { LabBankAccount, LabBankTx } from '@/lib/lab-bank'

const cents = (v: number) => Math.round(v * 100)
const sum = (v: number[]) => v.reduce((s, n) => s + cents(n), 0) / 100
const keyOf = (date: string) => { const q = quarterOf(date); return `${q.year}-T${q.q}` }
export const vatDays = (today: string, due: string) => Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000)
export const vatWhen = (today: string, due: string) => {
  const days = vatDays(today, due)
  return days < 0 ? `Scaduta da ${-days} giorni` : days === 0 ? 'Scade oggi' : `Tra ${days} giorni`
}

export function vatPeriods(monthRows: ResourceRow[], revenue: ResourceRow[], costs: ResourceRow[], settlements: ResourceRow[], invoices: LabInvoice[], today: string) {
  const months = monthRows.map(m => ({ id: String(m.id), month: String(m.month) }))
  const invalidMonths = new Set<string>()
  for (const m of months) if (!revenue.some(r => r.month_id === m.id) && !costs.some(c => c.month_id === m.id)) invalidMonths.add(m.id)
  for (const r of revenue) if (['amount_net', 'vat_rate'].some(k => knownAmount(r[k]) == null)) invalidMonths.add(String(r.month_id))
  for (const c of costs) if (knownAmount(c.actual) == null || typeof c.vat_applied !== 'boolean'
    || (c.vat_applied && (knownAmount(c.vat_rate) == null || (c.vat_deductible_pct != null && (knownAmount(c.vat_deductible_pct) == null || Number(c.vat_deductible_pct) < 0 || Number(c.vat_deductible_pct) > 1))))) invalidMonths.add(String(c.month_id))
  const validMonths = months.filter(m => !invalidMonths.has(m.id))
  const monthly = monthsVat(validMonths, revenue as VatRevRow[], costs as VatCostRow[])
  const actuals: VatActual[] = settlements.map(s => {
    if (knownAmount(s.to_pay) == null || Number(s.to_pay) < 0 || !Number.isInteger(Number(s.year)) || ![1, 2, 3, 4].includes(Number(s.quarter))) throw new Error('Liquidazione incompleta')
    return { quarter: { year: Number(s.year), q: Number(s.quarter) as 1 | 2 | 3 | 4 }, toPay: Number(s.to_pay), docRef: s.doc_ref == null ? null : String(s.doc_ref), paidOn: s.paid_on == null ? null : String(s.paid_on) }
  })
  const keys = new Set([keyOf(today), ...months.map(m => keyOf(m.month)), ...invoices.map(i => keyOf(i.issuedOn)), ...actuals.map(a => `${a.quarter.year}-T${a.quarter.q}`)])
  // Il motore emette solo trimestri con mesi: il segnaposto abilita il calendario,
  // ma non autorizza un importo zero dove il registro manca.
  const calendar = [...monthly]
  for (const key of Array.from(keys)) if (!calendar.some(m => keyOf(m.month) === key)) calendar.push({ month: `${key.slice(0, 4)}-${String((Number(key.slice(-1)) - 1) * 3 + 1).padStart(2, '0')}-01`, debit: 0, credit: 0 })
  const docs = documentVat(invoices.filter(i => i.currency === 'EUR'))
  return vatByQuarter(calendar, today, actuals).map(q => {
    const key = `${q.quarter.year}-T${q.quarter.q}`
    const actual = settlements.find(s => Number(s.year) === q.quarter.year && Number(s.quarter) === q.quarter.q)
    const registered = validMonths.filter(m => keyOf(m.month) === key).length
    const invalid = months.some(m => keyOf(m.month) === key && invalidMonths.has(m.id))
    const priorIncomplete = months.some(m => m.month <= q.months[2] && invalidMonths.has(m.id))
    const estimated = registered > 0 && !invalid && !priorIncomplete ? q.estimated : null
    return { ...q, key, settlement: actual ?? null, registered, estimated,
      due: actual ? Number(actual.to_pay) : estimated,
      documents: docs.find(d => d.quarter === key) ?? null,
      foreignDocuments: invoices.filter(i => keyOf(i.issuedOn) === key && i.currency !== 'EUR').length,
      missingMonths: quarterMonths(q.quarter).filter(m => !validMonths.some(v => v.month === m)),
      why: invalid || priorIncomplete ? 'Righe o riporti storici incompleti: stima n/d' : registered ? `${registered}/3 mesi registrati; riporto dal calcolo storico, base iniziale non certificata` : 'Righe economiche assenti: stima n/d' }
  }).filter(q => quarterMonths(q.quarter)[0] <= today)
}

export function vatPayment(settlement: ResourceRow | null, heads: ResourceRow[], lines: ResourceRow[], allocations: ResourceRow[], txs: ResourceTx[], today: string) {
  const empty = (why: string) => ({ paid: null as number | null, residual: null as number | null, completedOn: null as string | null, why, models: [] as string[] })
  if (!settlement) return empty('Liquidazione e attribuzione del versamento da acquisire')
  const own = lines.filter(l => l.vat_settlement_id === settlement.id)
  if (!own.length || own.some(l => l.kind !== 'iva' || knownAmount(l.amount) == null || Number(l.amount) <= 0)
    || cents(sum(own.map(l => Number(l.amount)))) !== cents(Number(settlement.to_pay))) return empty('Componenti IVA da raccordare alla liquidazione')
  const models = Array.from(new Set(own.map(l => String(l.doc_id))))
  const entries: { date: string; amount: number }[] = []
  for (const id of models) {
    const head = heads.find(h => h.id === id)
    if (!head) return { ...empty('Modello F24 mancante'), models }
    const result = resourceF24(head, lines, allocations, txs.filter(t => !t.payslipId && !t.hrInvoiceId && !t.invoiceId), today)
    if (!result.checked?.ok || result.moved == null || cents(result.moved) !== cents(Number(head.total)) || result.overpaid
      || lines.some(l => l.doc_id === id && l.kind === 'credito')) return { ...empty('Pagamento parziale, compensazioni o componenti da verificare: nessuna ripartizione automatica'), models }
    for (const line of own.filter(l => l.doc_id === id)) entries.push({ date: result.entries.map(e => e.tx.date).sort().at(-1)!, amount: Number(line.amount) })
  }
  const paid = sum(entries.map(e => e.amount))
  return { paid, residual: Math.round((Number(settlement.to_pay) - paid) * 100) / 100,
    completedOn: entries.map(e => e.date).sort().at(-1) ?? null, models,
    why: 'Componente IVA in modelli integralmente coperti da quote bancarie certificate, senza compensazioni' }
}

export function vatCash(txs: LabBankTx[], accounts: LabBankAccount[], invoices: LabInvoice[], allocations: ResourceRow[], from: string, upTo: string) {
  const accountIds = new Set(accounts.filter(a => !a.parent_id && a.currency === 'EUR').map(a => a.id))
  const real = txs.filter(t => accountIds.has(t.account_id) && t.source === 'banca' && t.booked_on <= upTo && t.kind !== 'giroconto' && !t.transfer_pair_id)
  const src: VatSources = { invoices: new Map(), revenue: new Map(), cost: new Map() }
  for (const invoice of invoices) {
    const linked = txs.filter(t => t.source === 'banca' && t.booked_on <= upTo && t.invoice_id === invoice.id)
    if (invoice.currency !== 'EUR' || invoice.sign !== 1 || invoice.withholding !== 0 || linked.length !== 1 || invoice.total <= 0
      || linked[0].booked_on < invoice.issuedOn || cents(Math.abs(linked[0].amount)) !== cents(invoice.total)
      || (linked[0].amount > 0) !== (invoice.direction === 'emessa') || allocations.some(a => a.tx_id === linked[0].id && !a.superseded)
      || linked[0].payslip_id || linked[0].hr_invoice_id || linked[0].revenue_line_id || linked[0].cost_line_id) continue
    src.invoices.set(invoice.id, { vat: invoice.vatAmount, total: invoice.total })
  }
  const entries = real.filter(t => t.booked_on >= from).map(t => {
    // La vista conserva anche i nascosti. Il ripiego sulle righe è sospeso finché
    // quote concorrenti e detraibilità non siano provate.
    const invoiceKnown = !!t.invoice_id && src.invoices.has(t.invoice_id)
    const nature = !t.invoice_id && !t.revenue_line_id && !t.cost_line_id
    const value = vatOf({ ...t, hidden_reason: null, invoice_id: invoiceKnown ? t.invoice_id : null,
      revenue_line_id: null, cost_line_id: null, kind: invoiceKnown || nature ? t.kind : 'altro' }, [], src)
    return { tx: t, ...value, deductible: t.amount < 0 && value.via === 'fattura' ? null : value.via === 'natura' ? 0 : null }
  })
  const incoming = entries.filter(e => e.tx.amount > 0), outgoing = entries.filter(e => e.tx.amount < 0)
  return { entries, inVat: incoming.some(e => e.via) ? sum(incoming.map(e => e.vat)) : null,
    outVat: outgoing.some(e => e.via) ? sum(outgoing.map(e => e.vat)) : null,
    inUnknown: sum(incoming.map(e => Math.max(0, e.tx.amount - e.basis))),
    outUnknown: sum(outgoing.map(e => Math.max(0, -e.tx.amount - e.basis))) }
}

export function vatReserve(reserve: number | null, balance: number | null) {
  if (reserve == null || balance == null || !Number.isFinite(reserve) || !Number.isFinite(balance)) return { covered: null, used: null, after: null }
  const positive = Math.max(0, reserve), covered = Math.min(positive, Math.max(0, balance))
  return { covered, used: Math.round((positive - covered) * 100) / 100, after: Math.round((balance - positive) * 100) / 100 }
}
