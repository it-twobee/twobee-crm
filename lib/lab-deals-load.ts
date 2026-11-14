import 'server-only'
import { requireLabAdmin } from '@/lib/lab-guard'
import { readLabRows } from '@/lib/lab-read'
import type { Coverage, RevenueStream, Installment } from '@/lib/revenue'
import type { SubItem } from '@/lib/subcontracts'
import type { DealLine } from '@/lib/lab-deals'

type Client = { id: string; company_name: string; display_name: string | null }
type Project = { id: string; name: string; client_id: string | null; deleted_at: string | null }

export async function loadLabDeals(today: string): Promise<
  | { ok: true; streams: RevenueStream[]; installments: Installment[]; coverage: Coverage;
      costs: SubItem[]; clients: Client[]; projects: Project[]; revenue: DealLine[]; costLines: DealLine[];
      months: Map<string, string>; observedAt: string }
  | { ok: false; message: string }
> {
  await requireLabAdmin()
  const observedAt = new Date().toISOString()
  try {
    const [streams, installments, links, costs, clients, projects, revenue, costLines, months] = await Promise.all([
      readLabRows('revenue_streams', '*', today),
      readLabRows('revenue_installments', '*', today),
      readLabRows('revenue_stream_projects', 'stream_id,project_id', today),
      readLabRows('cost_items', '*', today),
      readLabRows('clients', 'id,company_name,display_name', today),
      readLabRows('projects', 'id,name,client_id,deleted_at', today),
      readLabRows('pl_revenue_lines', 'id,month_id,stream_id,installment_id,invoice_id', today),
      readLabRows('pl_cost_lines', 'id,month_id,cost_item_id,installment_id,invoice_id', today),
      readLabRows('pl_months', 'id,month', today),
    ])
    if (streams.some(s => typeof s.label !== 'string') || installments.some(i => typeof i.due_month !== 'string')) {
      throw new Error('Accordo o calendario incompleto')
    }
    const coverage: Coverage = new Map()
    for (const link of links) {
      const id = String(link.stream_id)
      coverage.set(id, [...(coverage.get(id) ?? []), String(link.project_id)])
    }
    return {
      ok: true, observedAt, coverage,
      streams: streams as unknown as RevenueStream[], installments: installments as unknown as Installment[],
      costs: costs as unknown as SubItem[], clients: clients as unknown as Client[], projects: projects as unknown as Project[],
      revenue: revenue as unknown as DealLine[], costLines: costLines as unknown as DealLine[],
      months: new Map(months.map(m => [String(m.id), String(m.month)])),
    }
  } catch {
    return { ok: false, message: 'Accordi o collegamenti non disponibili: importi e riscontri n/d. Ricarica per riprovare.' }
  }
}
