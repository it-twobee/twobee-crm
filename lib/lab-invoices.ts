import { invoiceStatus, isOpen, isVoided, partlyVoided, txCandidates, type Invoice, type TxRef } from '@/lib/invoices'
import { toInvoices } from '@/lib/invoices-load'
import { quarterMonths, quarterLabel, type Quarter } from '@/lib/vat'

export type LabInvoice = Invoice & { currency: string; withholding: number; declaredPaidAmount: number | null }

export function invoicePeriod(value: string | undefined) {
  if (!value || !/^(19|20)\d{2}-T[1-4]$/.test(value)) return null
  const quarter: Quarter = { year: Number(value.slice(0, 4)), q: Number(value.slice(-1)) as Quarter['q'] }
  return { key: value, months: quarterMonths(quarter), label: quarterLabel(quarter) }
}

export function inInvoicePeriod(invoice: Pick<LabInvoice, 'issuedOn'>, period: ReturnType<typeof invoicePeriod>) {
  return !period || period.months.includes(`${invoice.issuedOn.slice(0, 7)}-01`)
}

export type InvoiceEconomicLink = { id: string; side: 'ricavo' | 'costo'; label: string; month: string | null; streamId: string | null }

export function invoiceEconomicLinks(revenue: Record<string, unknown>[], costs: Record<string, unknown>[], months: Record<string, unknown>[]) {
  const dates = new Map(months.map(m => [m.id, String(m.month)]))
  const links = new Map<string, InvoiceEconomicLink[]>()
  for (const [side, rows] of [['ricavo', revenue], ['costo', costs]] as const) for (const row of rows) {
    if (typeof row.invoice_id !== 'string' || !row.invoice_id || typeof row.id !== 'string') continue
    const month = dates.get(row.month_id)
    const list = links.get(row.invoice_id) ?? []
    if (list.some(link => link.id === row.id && link.side === side)) continue
    list.push({ id: row.id, side, label: String(row.label || (side === 'ricavo' ? 'Ricavo' : 'Costo')),
      month: month && /^\d{4}-(0[1-9]|1[0-2])-01$/.test(month) ? month : null,
      streamId: side === 'ricavo' && typeof row.stream_id === 'string' && row.stream_id ? row.stream_id : null })
    links.set(row.invoice_id, list)
  }
  return links
}

export function toLabInvoices(rows: Record<string, unknown>[]): LabInvoice[] {
  const numeric = (v: unknown) => {
    if (v == null || v === '' || !Number.isFinite(Number(v))) throw new Error('Valore mancante')
    return Number(v)
  }
  for (const row of rows) {
    for (const key of ['taxable', 'vat_amount', 'total', 'withholding']) numeric(row[key])
    if (!['emessa', 'ricevuta'].includes(String(row.direction)) || ![1, -1].includes(Number(row.sign)) || !row.issued_on || !row.currency) {
      throw new Error('Documento incompleto')
    }
  }
  const meta = new Map(rows.map(row => [String(row.id), row]))
  return toInvoices(rows).map(invoice => {
    const row = meta.get(invoice.id)!
    return { ...invoice, currency: String(row.currency), withholding: numeric(row.withholding),
      declaredPaidAmount: row.paid_amount == null ? null : numeric(row.paid_amount) }
  })
}
export type LabInvoiceTx = TxRef & {
  accountId: string
  currency: string
  source: 'banca' | 'manuale' | 'derivato'
  kind: string
  hidden: boolean
  occupied: boolean
}

export function invoiceEvidence(invoice: LabInvoice, txs: LabInvoiceTx[], today: string) {
  const linked = txs.filter(t => t.invoiceId === invoice.id && t.bookedOn <= today)
  const real = linked.filter(t => t.source === 'banca')
  const declared = linked.filter(t => t.source !== 'banca')
  const direction = invoice.direction === 'emessa' ? 1 : -1
  const wrongDirection = real.some(t => Math.sign(t.amount) !== direction * invoice.sign)
  const currencyMismatch = real.some(t => t.currency !== invoice.currency)
  const nominal = Math.round(real.reduce((sum, t) => sum + Math.abs(t.amount) * 100, 0)) / 100
  return {
    status: invoiceStatus(invoice, today), open: isOpen(invoice),
    real, declared, wrongDirection, currencyMismatch,
    linkedGross: real.length && !currencyMismatch ? nominal : null,
    needsReview: isOpen(invoice) || (invoice.sign > 0 && !invoice.excludedReason && !isVoided(invoice)
      && (!real.length || wrongDirection || currencyMismatch || real.some(t => t.hidden || t.kind === 'giroconto' || t.kind === 'finanziamento')
        || invoice.withholding !== 0 || partlyVoided(invoice)
        || Math.round(nominal * 100) !== Math.round(invoice.total * 100))),
  }
}

export function invoiceProposals(invoices: LabInvoice[], txs: LabInvoiceTx[], today: string) {
  const pool = txs.filter(t => t.source === 'banca' && t.currency === 'EUR' && t.bookedOn <= today && !t.invoiceId
    && !t.occupied && !t.hidden && !['giroconto', 'finanziamento', 'stipendio', 'imposta'].includes(t.kind))
  const proposals = new Map(invoices.filter(i => i.currency === 'EUR' && isOpen(i) && !partlyVoided(i))
    .map(i => [i.id, txCandidates(i, pool).slice(0, 2)]))
  const contenders = new Map<string, number>()
  for (const candidates of Array.from(proposals.values())) {
    for (const c of candidates) contenders.set(c.item.id, (contenders.get(c.item.id) ?? 0) + 1)
  }
  return { proposals, contenders }
}
