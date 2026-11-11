/**
 * Dal record di database alla fattura dell'analitica, in un posto solo: la
 * pagina Fatturazione e il Laboratorio leggono la stessa tabella, e un mapper
 * scritto due volte è la regola che diverge alla prima colonna nuova.
 */
import { withDueRule, withRectifications, type Invoice } from '@/lib/invoices'

export const INVOICE_COLUMNS =
  'id, direction, doc_type, number, issued_on, counterparty_name, counterparty_vat, '
  + 'client_id, taxable, vat_amount, total, sign, due_date, paid_on, pdf_path, '
  + 'excluded_reason, warnings, sent_on, from_sdi, rectifies_id'

const n = (v: unknown) => Number(v ?? 0)

export function toInvoices(rows: Record<string, unknown>[]): Invoice[] {
  return withDueRule(withRectifications(rows.map(r => ({
    id: String(r.id),
    direction: r.direction === 'ricevuta' ? 'ricevuta' : 'emessa',
    docType: String(r.doc_type ?? 'TD01'),
    number: String(r.number ?? '—'),
    issuedOn: String(r.issued_on),
    counterpartyName: String(r.counterparty_name ?? 'Senza nome'),
    counterpartyVat: (r.counterparty_vat as string) ?? null,
    clientId: (r.client_id as string) ?? null,
    taxable: n(r.taxable), vatAmount: n(r.vat_amount), total: n(r.total),
    sign: r.sign === -1 ? -1 : 1,
    dueDate: (r.due_date as string) ?? null,
    paidOn: (r.paid_on as string) ?? null,
    pdfPath: (r.pdf_path as string) ?? null,
    excludedReason: (r.excluded_reason as string) ?? null,
    warnings: (r.warnings as string[]) ?? undefined,
    fromSdi: r.from_sdi === true,
    sentOn: (r.sent_on as string) ?? null,
    rectifiesId: (r.rectifies_id as string) ?? null,
  } as Invoice))))
}
