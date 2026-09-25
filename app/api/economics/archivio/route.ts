import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireEconomicsAdmin } from '@/lib/economics-guard'
import { isStorageConfigured, putObject, sanitizeFilename } from '@/lib/storage/s3'

export const dynamic = 'force-dynamic'

const TETTO = 25 * 1024 * 1024
const TIPI = ['estratto', 'fattura', 'cedolino', 'f24', 'altro'] as const
const uuid = (v: FormDataEntryValue | null) => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v) ? v : null

/**
 * §450 — l'originale di un documento economico, su MinIO.
 *
 * Una route e non un'azione perché un'azione del server regge un megabyte, e
 * uno zip dello SdI o un estratto in PDF ne pesano di più. Il gate è lo stesso
 * delle azioni (`requireEconomicsAdmin`), e la tabella è deny-all: il browser
 * non sceglie la chiave, né il nome, né chi l'ha caricato.
 *
 * L'impronta si calcola qui, dai byte arrivati: quella che dice il browser
 * serve solo a chiedere prima «l'ho già?» (`documentiNoti`).
 */
export async function POST(req: NextRequest) {
  let uid: string
  try { uid = await requireEconomicsAdmin() } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }
  if (!isStorageConfigured()) return NextResponse.json({ archiviato: false, motivo: 'Archivio non configurato sul server' })

  let fd: FormData
  try { fd = await req.formData() } catch { return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 }) }
  const file = fd.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Manca il file' }, { status: 400 })
  if (file.size > TETTO) return NextResponse.json({ error: 'File oltre 25 MB' }, { status: 413 })
  const kind = TIPI.find(t => t === fd.get('kind')) ?? 'altro'
  const period = typeof fd.get('period') === 'string' && /^\d{4}-\d{2}-01$/.test(String(fd.get('period'))) ? String(fd.get('period')) : null
  const esito = typeof fd.get('esito') === 'string' ? String(fd.get('esito')).slice(0, 300) : null

  const byte = Buffer.from(await file.arrayBuffer())
  const sha256 = createHash('sha256').update(byte).digest('hex')
  const admin = createAdminClient()
  const { data: gia } = await admin.from('economics_documents').select('id').eq('sha256', sha256).maybeSingle()
  if (gia) return NextResponse.json({ archiviato: true, gia: true, id: (gia as { id: string }).id })

  const anno = (period ?? new Date().toISOString()).slice(0, 4)
  const key = `economics/${kind}/${anno}/${sha256.slice(0, 16)}-${sanitizeFilename(file.name)}`
  try { await putObject(key, byte, file.type || 'application/octet-stream') } catch {
    return NextResponse.json({ archiviato: false, motivo: 'Archivio non raggiungibile' })
  }
  const { data, error } = await admin.from('economics_documents').insert({
    kind, filename: file.name.slice(0, 250), sha256, size_bytes: file.size, mime: file.type || null,
    storage_key: key, period, esito,
    account_id: uuid(fd.get('account_id')), person_id: uuid(fd.get('person_id')), f24_id: uuid(fd.get('f24_id')),
    uploaded_by: uid,
  }).select('id').single()
  if (error) {
    if (error.code === '23505') return NextResponse.json({ archiviato: true, gia: true })
    return NextResponse.json({ archiviato: false, motivo: error.code === '42P01' ? 'Manca la migration dell’archivio' : error.message })
  }
  return NextResponse.json({ archiviato: true, gia: false, id: (data as { id: string }).id })
}
