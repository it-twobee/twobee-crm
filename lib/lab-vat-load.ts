import 'server-only'
import { requireLabAdmin } from '@/lib/lab-guard'
import { readLabRows } from '@/lib/lab-read'
import { loadLabBank } from '@/lib/lab-bank-load'
import { INVOICE_COLUMNS } from '@/lib/invoices-load'
import { toLabInvoices } from '@/lib/lab-invoices'
import { vatPeriods } from '@/lib/lab-vat'

export async function loadLabVat(today: string) {
  await requireLabAdmin()
  const observedAt = new Date().toISOString()
  try {
    const [bank, invoiceRows, settlements, months, revenue, costs, heads, lines, allocations] = await Promise.all([
      loadLabBank(today), readLabRows('invoices', `${INVOICE_COLUMNS},currency,withholding,paid_amount`, today),
      readLabRows('vat_settlements', 'id,year,quarter,to_pay,doc_ref,paid_on', today), readLabRows('pl_months', 'id,month', today),
      readLabRows('pl_revenue_lines', 'id,month_id,amount_net,vat_rate', today),
      readLabRows('pl_cost_lines', 'id,month_id,actual,vat_applied,vat_rate,vat_deductible_pct', today),
      readLabRows('f24_documents', '*', today), readLabRows('f24_lines', '*', today), readLabRows('payment_allocations', '*', today),
    ])
    if (!bank.ok) throw new Error('Banca non disponibile')
    const invoices = toLabInvoices(invoiceRows)
    return { ...bank, invoices, settlements, heads, lines, allocations, observedAt,
      periods: vatPeriods(months.filter(m => String(m.month) <= today), revenue, costs, settlements, invoices, today) }
  } catch {
    return { ok: false as const, message: 'Una fonte IVA, fatture o banca non è disponibile. Importi n/d; nessuna assenza viene trasformata in zero.' }
  }
}
