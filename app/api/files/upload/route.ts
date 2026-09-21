import { NextResponse } from 'next/server'
import { getCaller, canWriteStorage, canAccessStorageContext, validStorageParent } from '@/lib/storage/guard'
import { putObject, deleteObject, buildObjectKey, S3_BUCKET } from '@/lib/storage/s3'
import { isStorageUuid, parseStorageContext } from '@/lib/storage/access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BYTES = 50 * 1024 * 1024 // 50 MB

// POST /api/files/upload — multipart: file + folder [+ entityType, entityId]
export async function POST(req: Request) {
  const caller = await getCaller()
  if (!caller) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  if (!canWriteStorage(caller)) return NextResponse.json({ error: 'Accesso in sola lettura' }, { status: 403 })

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Body non valido (atteso multipart/form-data)' }, { status: 400 })
  }

  const file = form.get('file')
  const context = parseStorageContext(form.get('folder') ?? 'misc', form.get('entityType'), form.get('entityId'))
  const folderId = form.get('folderId') || null

  if (!(file instanceof File)) return NextResponse.json({ error: 'File mancante' }, { status: 400 })
  if (!context || (folderId !== null && !isStorageUuid(folderId))) return NextResponse.json({ error: 'Contesto del file non valido' }, { status: 400 })
  if (file.size === 0) return NextResponse.json({ error: 'File vuoto' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File troppo grande (max 50MB)' }, { status: 413 })

  if (!await canAccessStorageContext(caller, context, true) || !await validStorageParent(caller, context, folderId, true)) {
    return NextResponse.json({ error: 'Contesto o cartella non autorizzati' }, { status: 403 })
  }
  const { folder, entity_type: entityType, entity_id: entityId } = context

  const key = buildObjectKey(folder, file.name, entityId)
  const buffer = Buffer.from(await file.arrayBuffer())

  try {
    await putObject(key, buffer, file.type || 'application/octet-stream')
  } catch {
    return NextResponse.json({ error: 'Storage non disponibile' }, { status: 502 })
  }

  const { data, error } = await caller.admin
    .from('files')
    .insert({
      bucket: S3_BUCKET,
      object_key: key,
      folder,
      folder_id: folderId,
      entity_type: entityType,
      entity_id: entityId,
      name: file.name,
      mime: file.type || null,
      size: file.size,
      uploaded_by: caller.userId,
    })
    .select()
    .single()

  if (error) {
    // Rollback: niente oggetti orfani su MinIO se il metadato non si salva.
    try { await deleteObject(key) } catch {}
    return NextResponse.json({ error: 'Errore nel salvataggio del file. Riprova.' }, { status: 500 })
  }

  return NextResponse.json({ file: data })
}
