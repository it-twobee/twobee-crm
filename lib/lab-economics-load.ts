import 'server-only'
import { requireLabAdmin } from '@/lib/lab-guard'
import { readLabRows } from '@/lib/lab-read'
import { loadLabBank } from '@/lib/lab-bank-load'
import { INVOICE_COLUMNS } from '@/lib/invoices-load'
import { toLabInvoices } from '@/lib/lab-invoices'
import { economicAccrual, economicCash, type EconomicsInput } from '@/lib/lab-economics'

export async function loadLabEconomics(month: string, today: string) {
  await requireLabAdmin()
  const observedAt = new Date().toISOString()
  try {
    const [bank, months, revenue, costs, clients, streams, installments, links, items, config, partners, invoiceRows, allocations, legacy] = await Promise.all([
      loadLabBank(today), readLabRows('pl_months', '*', today), readLabRows('pl_revenue_lines', '*', today),
      readLabRows('pl_cost_lines', '*', today), readLabRows('clients', 'id,display_name,company_name,sales_owner_id,sales_owner_name', today),
      readLabRows('revenue_streams', '*', today), readLabRows('revenue_installments', '*', today),
      readLabRows('revenue_stream_projects', 'stream_id,project_id', today), readLabRows('cost_items', '*', today),
      readLabRows('pl_config', '*', today), readLabRows('pl_partners', '*', today),
      readLabRows('invoices', `${INVOICE_COLUMNS},currency,withholding,paid_amount`, today),
      readLabRows('payment_allocations', '*', today), readLabRows('bank_tx_lines', '*', today),
    ])
    if (!bank.ok) throw new Error('Banca non disponibile')
    const input = { month, today, observedAt, months, revenue, costs, clients, streams, installments, links, items, config, partners,
      invoices: toLabInvoices(invoiceRows), accounts: bank.accounts, txs: bank.txs, allocations, legacy } as unknown as EconomicsInput
    return { ok: true as const, observedAt, input, cash: economicCash(bank.accounts, bank.txs, month, today), accrual: economicAccrual(input) }
  } catch {
    return { ok: false as const, message: 'Una fonte banca, accordi, righe economiche o compensi non è disponibile. Totali n/d; nessuna modifica ai dati.' }
  }
}
