import 'server-only'
import { requireLabAdmin } from '@/lib/lab-guard'
import { createAdminClient } from '@/lib/supabase/admin'

type LabTable = 'bank_accounts' | 'bank_transactions' | 'invoices' | 'payment_allocations'
  | 'clients' | 'projects' | 'revenue_streams' | 'revenue_installments' | 'revenue_stream_projects'
  | 'cost_items' | 'pl_revenue_lines' | 'pl_cost_lines' | 'pl_months'

export async function readLabRows(table: LabTable, columns: string, today: string): Promise<Record<string, unknown>[]> {
  await requireLabAdmin()
  const sb = createAdminClient()
  const rows: Record<string, unknown>[] = []
  let expected: number | null = null
  for (let offset = 0; ; offset += 500) {
    let query = sb.from(table).select(columns, { count: 'exact' })
    query = table === 'revenue_stream_projects'
      ? query.order('stream_id').order('project_id') : query.order('id')
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
  const identities = rows.map(r => table === 'revenue_stream_projects' ? `${r.stream_id}:${r.project_id}` : String(r.id))
  if (rows.length !== expected || new Set(identities).size !== rows.length) {
    throw new Error('Lettura incompleta')
  }
  return rows
}
