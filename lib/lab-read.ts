import 'server-only'
import { requireLabAdmin } from '@/lib/lab-guard'
import { createAdminClient } from '@/lib/supabase/admin'

type LabTable = 'bank_accounts' | 'bank_transactions' | 'invoices' | 'payment_allocations'
  | 'clients' | 'projects' | 'revenue_streams' | 'revenue_installments' | 'revenue_stream_projects'
  | 'cost_items' | 'pl_revenue_lines' | 'pl_cost_lines' | 'pl_months'
  | 'hr_people' | 'hr_payslips' | 'hr_invoices' | 'hr_payroll_params' | 'hr_f24'
  | 'payslips' | 'bank_tx_payslips' | 'personal_documents' | 'economics_documents'
  | 'f24_documents' | 'f24_lines' | 'vat_settlements'

export async function readLabRows(table: LabTable, columns: string, today: string): Promise<Record<string, unknown>[]> {
  await requireLabAdmin()
  const sb = createAdminClient()
  const rows: Record<string, unknown>[] = []
  let expected: number | null = null
  const keys = table === 'revenue_stream_projects' ? ['stream_id', 'project_id']
    : table === 'bank_tx_payslips' ? ['tx_id', 'payslip_id'] : table === 'hr_payroll_params' ? ['year'] : ['id']
  for (let offset = 0; ; offset += 500) {
    let query = sb.from(table).select(columns, { count: 'exact' })
    for (const key of keys) query = query.order(key)
    if (table === 'bank_transactions') query = query.lte('booked_on', today)
    if (table === 'invoices') query = query.lte('issued_on', today)
    const { data, error, count } = await query.range(offset, offset + 499)
    if (error || data == null || count == null) throw new Error('Lettura non disponibile')
    if (expected != null && count !== expected) throw new Error('Archivio cambiato durante la lettura')
    expected = count
    rows.push(...data as unknown as Record<string, unknown>[])
    if (rows.length >= count) break
    if (!data.length || offset >= 100000) throw new Error('Lettura incompleta')
  }
  const identities = rows.map(r => JSON.stringify(keys.map(key => r[key])))
  if (rows.length !== expected || new Set(identities).size !== rows.length) {
    throw new Error('Lettura incompleta')
  }
  return rows
}
