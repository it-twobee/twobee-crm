import 'server-only'
import { loadLabReconciliationStore } from '@/lib/lab-reconciliations-store'
import { requireLabAdmin } from '@/lib/lab-guard'
import { readLabRows } from '@/lib/lab-read'
import type { LabConnectionData } from '@/lib/lab-connections'

export async function loadLabConnections(today: string): Promise<LabConnectionData | null> {
  await requireLabAdmin()
  try {
    const [revenue, costs, months, allocations, legacy, slips, hrInvoices, pdfs, salaryLinks, people, f24, f24Lines, settlements, payouts, reconciliations] = await Promise.all([
      readLabRows('pl_revenue_lines', 'id,invoice_id,stream_id,month_id,label', today),
      readLabRows('pl_cost_lines', 'id,invoice_id,month_id,label', today), readLabRows('pl_months', 'id,month', today),
      readLabRows('payment_allocations', '*', today), readLabRows('bank_tx_lines', '*', today),
      readLabRows('hr_payslips', 'id,person_id,month', today), readLabRows('hr_invoices', 'id,person_id,month,invoice_id', today),
      readLabRows('payslips', 'id,profile_id,year,month', today), readLabRows('bank_tx_payslips', 'tx_id,payslip_id,amount', today),
      readLabRows('hr_people', 'id,profile_id,full_name', today), readLabRows('f24_documents', 'id,due_date', today),
      readLabRows('f24_lines', 'id,doc_id,vat_settlement_id', today), readLabRows('vat_settlements', 'id,year,quarter', today),
      readLabRows('pl_payouts', 'id,month_id,person_label', today), loadLabReconciliationStore(today),
    ])
    if (reconciliations.error) throw new Error(reconciliations.error)
    const active = new Set(reconciliations.heads.filter(h => h.status === 'active').map(h => h.id))
    return { invoiceShares: reconciliations.items.filter(i => active.has(i.reconciliation_id)), revenue, costs, months, allocations, legacy, slips, hrInvoices, pdfs, salaryLinks, people, f24, f24Lines, settlements, payouts }
  } catch {
    return null
  }
}
