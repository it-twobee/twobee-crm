import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireLabAdmin } from '@/lib/lab-guard'

const columns = 'id,filename,storage_key,uploaded_at'
const pdfCandidates = () => createAdminClient().from('economics_documents')
  .select(columns)
  .in('kind', ['altro', 'fattura'])
  .ilike('filename', '%.pdf')
  .like('storage_key', 'economics/%')
  .gt('size_bytes', 0)
  .lte('size_bytes', 25 * 1024 * 1024)

export async function readArchivedInvoicePdf(id: string) {
  await requireLabAdmin()
  const { data, error } = await pdfCandidates().eq('id', id).maybeSingle()
  if (error) throw Error('Archivio documentale non disponibile.')
  return data
}

export async function listArchivedInvoicePdfs(query: string, page: number) {
  await requireLabAdmin()
  const size = 24
  const search = query.replace(/[%_*\\]/g, '').trim()
  const request = pdfCandidates().order('uploaded_at', { ascending: false }).order('id')
  if (search) request.ilike('filename', `%${search}%`)
  const { data, error } = await request.range(page * size, (page + 1) * size)
  if (error || !data) return null
  const rows = data.slice(0, size)
  const { data: invoices, error: registryError } = rows.length
    ? await createAdminClient().from('invoices').select('id,pdf_path').in('pdf_path', rows.map(row => row.storage_key))
    : { data: [], error: null }
  if (registryError) return null
  const byPath = new Map(invoices?.map(row => [row.pdf_path, row.id]))
  return {
    more: data.length > size,
    rows: rows.map(row => ({ id: row.id, filename: row.filename, uploadedAt: row.uploaded_at, invoiceId: byPath.get(row.storage_key) ?? null })),
  }
}
