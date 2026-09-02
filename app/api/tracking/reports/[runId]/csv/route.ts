import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireStaff } from '@/lib/tracking/guards'
import { loadReport } from '@/lib/tracking/reporting-store'
import { reportToCsv, csvFilename } from '@/lib/tracking/csv'
import { errorMessage, isTrackingError } from '@/lib/tracking/errors'

export const dynamic = 'force-dynamic'

/** CSV dei dati grezzi di un run: `;`, CRLF, BOM per Excel. Sessione staff. */
export async function GET(_req: Request, { params }: { params: { runId: string } }) {
  try {
    await requireStaff()
    const admin = createAdminClient()
    const { data: run } = await admin.from('tracking_report_runs').select('client_id').eq('id', params.runId).maybeSingle()
    if (!run) return NextResponse.json({ error: 'Report non trovato' }, { status: 404 })
    const clientId = run.client_id as string
    const [{ data: client }, report] = await Promise.all([
      admin.from('clients').select('company_name, display_name').eq('id', clientId).single(),
      loadReport(admin, clientId, params.runId),
    ])
    const name = client?.display_name?.trim() || client?.company_name || 'cliente'
    const body = reportToCsv(name, report)
    return new NextResponse(body, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${csvFilename(name, report.source, report.period.end)}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    const status = isTrackingError(e) ? e.status : 500
    if (status >= 500) console.error('[tracking] csv:', e)
    return NextResponse.json({ error: errorMessage(e) }, { status })
  }
}
