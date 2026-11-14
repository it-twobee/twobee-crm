import { requireLabAdmin } from '@/lib/lab-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { getObject, sanitizeFilename } from '@/lib/storage/s3'
import { privateResourceKey } from '@/lib/lab-resources'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const privateHeaders = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' }

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try { await requireLabAdmin() } catch { return Response.json({ error: 'Permesso negato' }, { status: 403, headers: privateHeaders }) }
  const kind = new URL(request.url).searchParams.get('tipo')
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(params.id) || !['cedolino', 'personale', 'economico'].includes(kind ?? '')) {
    return Response.json({ error: 'Documento non valido' }, { status: 400, headers: privateHeaders })
  }
  const sb = createAdminClient()
  const table = kind === 'cedolino' ? 'payslips' : kind === 'personale' ? 'personal_documents' : 'economics_documents'
  const columns = kind === 'economico' ? 'storage_key,filename' : 'file_path,file_name'
  const { data, error } = await sb.from(table).select(columns).eq('id', params.id).maybeSingle()
  const row = data as unknown as Record<string, unknown> | null
  const key = row?.[kind === 'economico' ? 'storage_key' : 'file_path']
  if (error || !row || !privateResourceKey(kind!, key)) return Response.json({ error: 'Documento non disponibile' }, { status: 404, headers: privateHeaders })
  try {
    const object = await getObject(key)
    return new Response(object.body, { headers: {
      ...privateHeaders, 'Content-Type': 'application/octet-stream', 'Content-Security-Policy': 'sandbox',
      'Content-Disposition': `attachment; filename="${sanitizeFilename(String(row[kind === 'economico' ? 'filename' : 'file_name'] ?? 'documento'))}"`,
    } })
  } catch {
    return Response.json({ error: 'Archivio temporaneamente non disponibile' }, { status: 502, headers: privateHeaders })
  }
}
