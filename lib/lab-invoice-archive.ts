import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireLabAdmin } from '@/lib/lab-guard'
import type { ArchiveState } from '@/lib/archive-page-sizes'

const columns = 'id,filename,storage_key,uploaded_at'
const pdfCandidates = () => createAdminClient().from('economics_documents')
  .select(columns, { count: 'exact' })
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

const registered = async (keys: string[]) => {
  const byPath = new Map<string, string>()
  for (let i = 0; i < keys.length; i += 150) {
    const { data, error } = await createAdminClient().from('invoices').select('id,pdf_path').in('pdf_path', keys.slice(i, i + 150))
    if (error) return null
    for (const row of data ?? []) byPath.set(row.pdf_path, row.id)
  }
  return byPath
}

/** Con un filtro di stato l'associazione si legge dal registro, non dall'archivio: si carica l'elenco intero e si pagina qui, così totale e pagine restano veri. */
async function listByState(search: string, page: number, size: number, state: Exclude<ArchiveState, 'tutti'>) {
  const all: { id: string; filename: string; storage_key: string; uploaded_at: string | null }[] = []
  for (let from = 0; from < 10000; from += 1000) {
    const request = pdfCandidates().order('uploaded_at', { ascending: false }).order('id')
    if (search) request.ilike('filename', `%${search}%`)
    const { data, error } = await request.range(from, from + 999)
    if (error || !data) return null
    all.push(...data)
    if (data.length < 1000) break
  }
  const byPath = await registered(all.map(row => row.storage_key))
  if (!byPath) return null
  const wanted = all.filter(row => byPath.has(row.storage_key) === (state === 'associati'))
  return {
    more: wanted.length > (page + 1) * size,
    total: wanted.length,
    rows: wanted.slice(page * size, (page + 1) * size)
      .map(row => ({ id: row.id, filename: row.filename, uploadedAt: row.uploaded_at, invoiceId: byPath.get(row.storage_key) ?? null })),
  }
}

export async function listArchivedInvoicePdfs(query: string, page: number, size = 20, state: ArchiveState = 'tutti') {
  await requireLabAdmin()
  const search = query.replace(/[%*\\]/g, '').trim()
  if (state !== 'tutti') return listByState(search, page, size, state)
  const request = pdfCandidates().order('uploaded_at', { ascending: false }).order('id')
  if (search) request.ilike('filename', `%${search}%`)
  const { data, error, count } = await request.range(page * size, (page + 1) * size)
  if (error || !data) return null
  const rows = data.slice(0, size)
  const { data: invoices, error: registryError } = rows.length
    ? await createAdminClient().from('invoices').select('id,pdf_path').in('pdf_path', rows.map(row => row.storage_key))
    : { data: [], error: null }
  if (registryError) return null
  const byPath = new Map(invoices?.map(row => [row.pdf_path, row.id]))
  return {
    more: data.length > size,
    total: count,
    rows: rows.map(row => ({ id: row.id, filename: row.filename, uploadedAt: row.uploaded_at, invoiceId: byPath.get(row.storage_key) ?? null })),
  }
}
