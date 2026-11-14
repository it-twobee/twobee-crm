import { invoiceStatus, isOpen, isVoided, partlyVoided, txCandidates, type Invoice, type TxRef } from '@/lib/invoices'
import { toInvoices } from '@/lib/invoices-load'

export type LabInvoice = Invoice & { currency: string; withholding: number; declaredPaidAmount: number | null }

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
