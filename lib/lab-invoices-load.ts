import 'server-only'
import { requireLabAdmin } from '@/lib/lab-guard'
import { readLabRows } from '@/lib/lab-read'
import { INVOICE_COLUMNS, toInvoices } from '@/lib/invoices-load'
import type { LabInvoice, LabInvoiceTx } from '@/lib/lab-invoices'

const numeric = (v: unknown): number => {
  if (v == null || v === '' || !Number.isFinite(Number(v))) throw new Error('Valore mancante')
  return Number(v)
}

export async function loadLabInvoices(today: string): Promise<
  | { ok: true; invoices: LabInvoice[]; txs: LabInvoiceTx[]; accountNames: Map<string, string>; observedAt: string }
  | { ok: false; message: string }
> {
  await requireLabAdmin()
  const observedAt = new Date().toISOString()
  try {
    const [rows, bank, allocations, accounts] = await Promise.all([
      readLabRows('invoices', `${INVOICE_COLUMNS}, currency, withholding, paid_amount`, today),
      readLabRows('bank_transactions', 'id,account_id,booked_on,amount,source,kind,description,counterparty,invoice_id,revenue_line_id,cost_line_id,payslip_id,hr_invoice_id,no_match_needed,hidden_reason', today),
      readLabRows('payment_allocations', 'id,tx_id', today),
      readLabRows('bank_accounts', 'id,label,currency', today),
    ])
    for (const r of rows) {
      for (const key of ['taxable', 'vat_amount', 'total', 'withholding']) numeric(r[key])
      if (!['emessa', 'ricevuta'].includes(String(r.direction)) || ![1, -1].includes(Number(r.sign)) || !r.issued_on || !r.currency) {
        throw new Error('Documento incompleto')
      }
    }
    const meta = new Map(rows.map(r => [String(r.id), r]))
    const invoices = toInvoices(rows).map(i => {
      const row = meta.get(i.id)!
      return { ...i, currency: String(row.currency), withholding: numeric(row.withholding), declaredPaidAmount: row.paid_amount == null ? null : numeric(row.paid_amount) }
    })
    const allocated = new Set(allocations.map(a => String(a.tx_id)))
    const accountById = new Map(accounts.map(a => [String(a.id), a]))
    const txs: LabInvoiceTx[] = bank.map(t => {
      const account = accountById.get(String(t.account_id))
      if (!['banca', 'manuale', 'derivato'].includes(String(t.source)) || !account || !t.booked_on) throw new Error('Movimento incompleto')
      return {
        id: String(t.id), accountId: String(t.account_id), currency: String(account.currency), bookedOn: String(t.booked_on),
        amount: numeric(t.amount), source: t.source as LabInvoiceTx['source'], kind: String(t.kind),
        description: String(t.description ?? ''), counterparty: t.counterparty == null ? null : String(t.counterparty),
        invoiceId: t.invoice_id == null ? null : String(t.invoice_id), hidden: !!t.hidden_reason,
        occupied: allocated.has(String(t.id)) || !!(t.revenue_line_id || t.cost_line_id || t.payslip_id || t.hr_invoice_id || t.no_match_needed)
          || account.currency !== 'EUR',
      }
    })
    return { ok: true, invoices, txs, accountNames: new Map(accounts.map(a => [String(a.id), String(a.label)])), observedAt }
  } catch {
    return { ok: false, message: 'Archivio non disponibile, incompleto o con valori mancanti. Totali e residui n/d; ricarica per riprovare.' }
  }
}
