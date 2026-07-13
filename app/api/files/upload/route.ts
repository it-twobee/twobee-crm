import { NextResponse } from 'next/server'
import { getCaller } from '@/lib/storage/guard'
import { putObject, deleteObject, buildObjectKey, S3_BUCKET } from '@/lib/storage/s3'
import { isStorageFolder } from '@/lib/storage/shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BYTES = 50 * 1024 * 1024 // 50 MB

// POST /api/files/upload — multipart: file + folder [+ entityType, entityId]
export async function POST(req: Request) {
  const caller = await getCaller()
  if (!caller) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Body non valido (atteso multipart/form-data)' }, { status: 400 })
  }

  const file = form.get('file')
  const folder = (form.get('folder') as string | null) ?? 'misc'
  const entityType = (form.get('entityType') as string | null) || null
  const entityId = (form.get('entityId') as string | null) || null
  const folderId = (form.get('folderId') as string | null) || null

  if (!(file instanceof File)) return NextResponse.json({ error: 'File mancante' }, { status: 400 })
  if (!isStorageFolder(folder)) return NextResponse.json({ error: `Cartella non valida: ${folder}` }, { status: 400 })
  if (file.size === 0) return NextResponse.json({ error: 'File vuoto' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File troppo grande (max 50MB)' }, { status: 413 })

  const key = buildObjectKey(folder, file.name, entityId)
  const buffer = Buffer.from(await file.arrayBuffer())

  try {
    await putObject(key, buffer, file.type || 'application/octet-stream')
  } catch (e) {
    return NextResponse.json({ error: 'Storage non disponibile: ' + (e as Error).message }, { status: 502 })
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
    return NextResponse.json({ error: 'Errore salvataggio metadati: ' + error.message }, { status: 500 })
  }

  return NextResponse.json({ file: data })
}
