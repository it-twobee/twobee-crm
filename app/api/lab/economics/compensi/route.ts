import { requireLabAdmin } from '@/lib/lab-guard'
import { readEconomicsReport } from '@/lib/lab-economics-token'
import { economicsPdf } from '@/lib/lab-economics-pdf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' }

export async function POST(request: Request) {
  let userId: string
  try { userId = await requireLabAdmin() } catch { return Response.json({ error: 'Permesso negato' }, { status: 403, headers }) }
  if (Number(request.headers.get('content-length') ?? 0) > 1500000) return Response.json({ error: 'Richiesta troppo grande' }, { status: 413, headers })
  try {
    const form = await request.formData()
    const report = readEconomicsReport(String(form.get('payload') ?? ''), String(form.get('signature') ?? ''), userId, process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', Date.now())
    if (!report) return Response.json({ error: 'Fotografia scaduta o non valida: ricarica il Conto economico e scarica di nuovo.' }, { status: 409, headers })
    const bytes = economicsPdf(report)
    return new Response(new Uint8Array(bytes), { headers: { ...headers, 'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="compensi-lab-${report.month.slice(0, 7)}.pdf"` } })
  } catch { return Response.json({ error: 'Esportazione non disponibile' }, { status: 400, headers }) }
}
