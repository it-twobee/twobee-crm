import { CONTRACTS, payslipViews, invoiceViews, type ContractKind } from '@/lib/payroll'
import { PAYSLIP_FIELDS, rowToPayslip, rowToParams, rowToInvoice } from '@/lib/payroll-map'
import { knownAmount } from '@/lib/lab-deals'
import { check, type F24Doc, type F24Line } from '@/lib/f24'
import { isVoided, partlyVoided } from '@/lib/invoices'
import type { LabInvoice } from '@/lib/lab-invoices'

export type ResourceRow = Record<string, unknown>
export type ResourceTx = {
  id: string; accountId: string; currency: string; date: string; amount: number
  source: string; kind: string; payslipId: string | null; hrInvoiceId: string | null; invoiceId: string | null
}

const sameMonth = (value: unknown, month: string) => typeof value === 'string' && value.slice(0, 7) === month.slice(0, 7)
const cents = (value: number) => Math.round(value * 100)
const sum = (values: number[]) => values.reduce((n, value) => n + cents(value), 0) / 100

export function resourceGroup(kind: unknown): 'dipendenti' | 'professionisti' | 'altro' {
  const spec = CONTRACTS.find(c => c.kind === kind)
  if (!spec) return 'altro'
  return spec.employment === 'autonomo' ? 'professionisti' : 'dipendenti'
}

export function resourceCost(person: ResourceRow, slips: ResourceRow[], invoices: ResourceRow[], canonical: LabInvoice[], params: ResourceRow[], month: string) {
  const empty = (why: string) => ({ value: null as number | null, estimated: false, why, net: null as number | null })
  const spec = CONTRACTS.find(c => c.kind === person.contract_kind)
  if (!spec) return empty('Tipo di rapporto non riconosciuto')
  if (resourceGroup(person.contract_kind) !== 'professionisti') {
    const own = slips.filter(s => s.person_id === person.id && sameMonth(s.month, month))
    if (own.length !== 1) return empty(own.length ? 'Più cedolini per lo stesso periodo: da verificare' : 'Cedolino del mese da acquisire')
    const s = own[0]
    const required = PAYSLIP_FIELDS.filter(f => !['employer_contrib', 'inail'].includes(f.key))
    if (required.some(f => knownAmount(s[f.key]) == null)
      || ['employer_contrib', 'inail'].some(k => s[k] != null && knownAmount(s[k]) == null)) return empty('Importi del cedolino incompleti')
    const prm = params.find(p => Number(p.year) === Number(month.slice(0, 4)))
    if (!prm || ['inps_employer_pct', 'inps_apprentice_pct', 'inail_pct'].some(k => knownAmount(prm[k]) == null)) {
      return { ...empty('Parametri dell’anno incompleti: costo n/d'), net: knownAmount(s.net_paid) }
    }
    const view = payslipViews(rowToPayslip(s), spec.kind as ContractKind, rowToParams(prm))
    return { value: view.economic, net: view.net, estimated: view.estimated,
      why: view.estimated ? `Registro cedolini con oneri stimati${prm.verified_at ? '' : '; parametri non confermati'}` : 'Dal registro cedolini; origine e oneri da verificare sui documenti' }
  }
  const own = invoices.filter(i => i.person_id === person.id && sameMonth(i.month, month))
  if (!own.length) return empty('Fattura del mese da acquisire o collegare')
  let cost = 0
  for (const i of own) {
    const doc = canonical.find(c => c.id === i.invoice_id)
    if (!doc || doc.direction !== 'ricevuta' || doc.sign < 0 || doc.excludedReason || doc.currency !== 'EUR'
      || isVoided(doc) || partlyVoided(doc)) {
      return empty('Documento canonico assente o rettificato: costo da verificare')
    }
    if (invoices.filter(other => other.invoice_id === i.invoice_id).length !== 1) return empty('Fattura condivisa fra più righe HR: attribuzione da verificare')
    const required = ['taxable', 'pension_fund', 'vat', 'withholding', 'total_invoice', 'amount_to_pay']
    if (required.some(k => knownAmount(i[k]) == null) || typeof i.vat_deductible !== 'boolean') return empty('Componenti della fattura risorsa incomplete')
    if (cents(Number(i.total_invoice)) !== cents(doc.total) || cents(Number(i.vat)) !== cents(doc.vatAmount)) return empty('Registro risorsa e fattura non coincidono')
    const base = Number(i.taxable) + Number(i.pension_fund)
    if (cents(base) !== cents(doc.taxable) || cents(base + Number(i.vat)) !== cents(doc.total)
      || cents(Number(i.total_invoice) - Number(i.withholding)) !== cents(Number(i.amount_to_pay))) {
      return empty('Bollo, ritenute o componenti da raccordare al documento')
    }
    cost += invoiceViews(rowToInvoice(i)).economic
  }
  return { value: Math.round(cost * 100) / 100, net: null, estimated: false, why: 'Dal registro risorsa e dalla stessa fattura ricevuta; non è un secondo costo' }
}

export function salaryEvidence(person: ResourceRow, people: ResourceRow[], pdfs: ResourceRow[], slips: ResourceRow[], links: ResourceRow[], txs: ResourceTx[], allocations: ResourceRow[], month: string, today: string) {
  const ownPdfs = person.profile_id ? pdfs.filter(p => p.profile_id === person.profile_id && Number(p.year) === Number(month.slice(0, 4)) && Number(p.month) === Number(month.slice(5, 7))) : []
  const entries: { tx: ResourceTx; amount: number }[] = []
  let issue = ''
  if (!person.profile_id || people.filter(p => p.profile_id === person.profile_id).length !== 1 || ownPdfs.length > 1) {
    return { entries, paid: null, pdfs: ownPdfs, issue: 'Identità o versione del PDF da verificare' }
  }
  const activeAlloc = allocations.filter(a => !a.superseded)
  for (const pdf of ownPdfs) for (const link of links.filter(l => l.payslip_id === pdf.id)) {
    const tx = txs.find(t => t.id === link.tx_id)
    const parts = links.filter(l => l.tx_id === link.tx_id)
    const value = knownAmount(link.amount)
    if (!tx || tx.date > today || tx.source !== 'banca' || tx.currency !== 'EUR' || tx.amount >= 0 || tx.kind === 'giroconto'
      || activeAlloc.some(a => a.tx_id === tx.id) || parts.some(p => knownAmount(p.amount) == null || Number(p.amount) <= 0)
      || parts.some(p => !pdfs.some(pdf => pdf.id === p.payslip_id))
      || new Set(parts.map(p => String(p.payslip_id))).size !== parts.length
      || cents(sum(parts.map(p => Number(p.amount)))) !== cents(-tx.amount) || value == null || value <= 0) {
      issue = 'Distinta o registri da raccordare: nessuna quota inventata'
      continue
    }
    entries.push({ tx, amount: value })
  }
  const ownSlips = slips.filter(s => s.person_id === person.id && sameMonth(s.month, month))
  if (txs.some(t => ownSlips.some(s => s.id === t.payslipId) && !entries.some(e => e.tx.id === t.id))) {
    issue = 'Movimento diretto al cedolino da raccordare alle quote'
  }
  return { entries, paid: entries.length ? sum(entries.map(e => e.amount)) : null, pdfs: ownPdfs, issue }
}

export function resourceF24(head: ResourceRow, rows: ResourceRow[], allocations: ResourceRow[], txs: ResourceTx[], today: string) {
  const raw = rows.filter(r => r.doc_id === head.id)
  const kinds = ['iva', 'ritenute', 'inps', 'inail', 'credito', 'altro']
  const valid = knownAmount(head.total) != null && raw.length > 0
    && raw.every(r => knownAmount(r.amount) != null && kinds.includes(String(r.kind)))
  const doc: F24Doc | null = valid ? {
    id: String(head.id), dueDate: String(head.due_date), paidOn: head.paid_on == null ? null : String(head.paid_on),
    total: Number(head.total), lines: raw.map(r => ({ id: String(r.id), codice: String(r.codice), label: String(r.label),
      kind: r.kind as F24Line['kind'], amount: Number(r.amount), period: r.period == null ? null : String(r.period) })),
  } : null
  const checked = doc ? check(doc) : null
  const entries: { tx: ResourceTx; amount: number }[] = []
  const all = allocations.filter(a => !a.superseded)
  for (const a of all.filter(a => a.f24_id === head.id)) {
    const tx = txs.find(t => t.id === a.tx_id)
    const amount = knownAmount(a.amount)
    const parts = all.filter(p => p.tx_id === a.tx_id)
    if (!tx || tx.date > today || tx.source !== 'banca' || tx.currency !== 'EUR' || tx.amount >= 0 || ['giroconto', 'finanziamento'].includes(tx.kind) || a.evidence !== 'certificata'
      || amount == null || amount <= 0 || parts.some(p => knownAmount(p.amount) == null || Number(p.amount) <= 0)
      || cents(sum(parts.map(p => Number(p.amount)))) > cents(-tx.amount)) continue
    entries.push({ tx, amount })
  }
  const moved = entries.length ? sum(entries.map(e => e.amount)) : null
  return { doc, checked, entries, moved, overpaid: moved != null && doc != null && cents(moved) > cents(doc.total) }
}

export function privateResourceKey(kind: string, key: unknown): key is string {
  const prefix = kind === 'cedolino' ? 'payslips/' : kind === 'personale' ? 'personal/' : kind === 'economico' ? 'economics/' : null
  return !!prefix && typeof key === 'string' && key.startsWith(prefix) && key.length > prefix.length
    && !/(?:^|\/)\.\.?(?:\/|$)/.test(key) && !/[\\\x00-\x1f]/.test(key)
}
