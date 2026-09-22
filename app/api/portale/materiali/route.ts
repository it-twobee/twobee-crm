import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildObjectKey, deleteObject, putObjectStream, StorageTooLarge, S3_BUCKET, isStorageConfigured } from '@/lib/storage/s3'
import { isStorageUuid } from '@/lib/storage/access'
import { requirePortalWriter, isWriterError } from '@/lib/portal/writer'
import {
  MATERIAL_MAX_BYTES, MATERIAL_QUOTA_BYTES, humanBytes, materialKind, quotaLeft, rejectMaterial,
} from '@/lib/portal/materials'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* §397 — POST /api/portale/materiali?client=…[&progetto=…][&attivita=…]
   Il corpo è il file, grezzo: `formData()` terrebbe un giga in memoria. Il nome
   arriva in `x-file-name`, il tipo in `Content-Type`.
   Non passa da `/api/files/upload`: quella è dello staff e la 246 la chiude ai
   clienti apposta. Qui la porta è la membership, e i byte non toccano il disco
   finché il limite regge. */
export async function POST(req: Request) {
  const url = new URL(req.url)
  const writer = await requirePortalWriter(url.searchParams.get('client') ?? '')
  if (isWriterError(writer)) return NextResponse.json({ error: writer.error }, { status: writer.status })
  if (!isStorageConfigured()) return NextResponse.json({ error: 'Storage non configurato' }, { status: 503 })

  const name = (req.headers.get('x-file-name') ?? '').trim()
  const mime = (req.headers.get('content-type') ?? '').split(';')[0].trim() || null
  const declared = Number(req.headers.get('content-length') ?? '')
  const idempotencyKey = req.headers.get('x-idempotency-key') ?? ''
  const projectId = url.searchParams.get('progetto')
  const activityId = url.searchParams.get('attivita')

  if (!isStorageUuid(idempotencyKey)) return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
  if (projectId && !isStorageUuid(projectId)) return NextResponse.json({ error: 'Progetto non valido' }, { status: 400 })
  if (activityId && !isStorageUuid(activityId)) return NextResponse.json({ error: 'Attività non valida' }, { status: 400 })
  if (projectId && writer.projectIds !== 'all' && !writer.projectIds.includes(projectId)) {
    return NextResponse.json({ error: 'Questo progetto non è fra quelli condivisi con te.' }, { status: 403 })
  }
  // Il tipo e il nome si guardano prima di aprire lo storage; la dimensione
  // vera si conosce solo alla fine, ma quella dichiarata evita un giro inutile.
  const early = rejectMaterial({ name, mime, size: Number.isFinite(declared) && declared > 0 ? declared : 1 })
  if (early) return NextResponse.json({ error: early }, { status: 400 })
  const kind = materialKind(mime)!
  if (!req.body) return NextResponse.json({ error: 'File mancante' }, { status: 400 })

  // Idempotenza: un reinvio non deve lasciare due copie dello stesso file.
  const admin = createAdminClient()
  const existing = await admin.from('portal_materials').select('id')
    .eq('uploaded_by', writer.userId).eq('idempotency_key', idempotencyKey).maybeSingle()
  if (existing.error) return NextResponse.json({ error: 'Non è stato possibile caricare il file. Riprova.' }, { status: 503 })
  if (existing.data) return NextResponse.json({ material: { id: existing.data.id }, ripetuto: true })

  const used = await admin.from('portal_materials').select('size').eq('client_id', writer.clientId).is('deleted_at', null)
  if (used.error) return NextResponse.json({ error: 'Non è stato possibile verificare lo spazio. Riprova.' }, { status: 503 })
  const usedBytes = (used.data ?? []).reduce((sum, row) => sum + Number(row.size ?? 0), 0)
  const left = quotaLeft(usedBytes)
  if (left <= 0) {
    return NextResponse.json({ error: `Lo spazio dell’azienda è pieno (${humanBytes(MATERIAL_QUOTA_BYTES)}). Elimina qualcosa oppure scrivici.` }, { status: 507 })
  }

  const key = buildObjectKey('materiali', name, writer.clientId)
  let size: number
  try {
    ({ size } = await putObjectStream(key, req.body, { contentType: mime ?? undefined, limitBytes: Math.min(MATERIAL_MAX_BYTES, left) }))
  } catch (error) {
    if (error instanceof StorageTooLarge) {
      return NextResponse.json({
        error: left < MATERIAL_MAX_BYTES
          ? `Nello spazio dell’azienda restano ${humanBytes(left)}.`
          : `Il file supera ${humanBytes(MATERIAL_MAX_BYTES)}. Per un girato lungo, mandaci il link.`,
      }, { status: 413 })
    }
    return NextResponse.json({ error: 'Storage non disponibile' }, { status: 502 })
  }

  const rollback = async () => { try { await deleteObject(key) } catch { /* oggetto già assente */ } }
  const late = rejectMaterial({ name, mime, size })
  if (late) { await rollback(); return NextResponse.json({ error: late }, { status: 400 }) }

  const file = await admin.from('files').insert({
    bucket: S3_BUCKET, object_key: key, folder: 'materiali', folder_id: null,
    entity_type: 'client', entity_id: writer.clientId,
    name, mime, size, uploaded_by: writer.userId,
  }).select('id').single()
  if (file.error || !file.data) {
    await rollback()
    return NextResponse.json({ error: 'Non è stato possibile salvare il file. Riprova.' }, { status: 500 })
  }

  const material = await writer.db.from('portal_materials').insert({
    client_id: writer.clientId, project_id: projectId, file_id: file.data.id, storage_key: key,
    name, mime, size, kind, uploaded_by: writer.userId, uploaded_by_name: writer.name,
    activity_id: activityId, idempotency_key: idempotencyKey,
  }).select('id, name, size, kind, created_at').single()
  if (material.error || !material.data) {
    // Niente metadato orfano: il file non è mai esistito, per nessuno.
    await admin.from('files').delete().eq('id', file.data.id)
    await rollback()
    const denied = material.error?.code === '42501'
    return NextResponse.json({
      error: denied ? 'Il tuo accesso non consente di caricare qui.' : 'Non è stato possibile registrare il file. Riprova.',
    }, { status: denied ? 403 : 500 })
  }

  return NextResponse.json({ material: material.data, spazioRestante: quotaLeft(usedBytes + size) })
}
