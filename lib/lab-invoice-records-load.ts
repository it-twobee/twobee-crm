import 'server-only'
import { requireLabAdmin } from '@/lib/lab-guard'
import { readLabRows } from '@/lib/lab-read'
import { INVOICE_COLUMNS } from '@/lib/invoices-load'
import { toLabInvoices } from '@/lib/lab-invoices'
export async function loadLabInvoiceRecords(today: string) {
  await requireLabAdmin()
  try { return toLabInvoices(await readLabRows('invoices', `${INVOICE_COLUMNS},currency,withholding,paid_amount`, today)) }
  catch { return null }
}
