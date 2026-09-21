import { NextResponse } from 'next/server'
import { getCaller, canDeleteFile } from '@/lib/storage/guard'
import { deleteObject, S3_BUCKET } from '@/lib/storage/s3'
import { isStorageUuid, validStorageObject } from '@/lib/storage/access'
import type { StorageFile } from '@/lib/storage/shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// DELETE /api/files/:id — rimuove l'oggetto da MinIO + il metadato.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const caller = await getCaller()
  if (!caller) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  if (!isStorageUuid(params.id)) return NextResponse.json({ error: 'File non trovato' }, { status: 404 })

  const { data, error } = await caller.session.from('files').select('*').eq('id', params.id).single()
  if (error || !data) return NextResponse.json({ error: 'File non trovato' }, { status: 404 })

  const file = data as StorageFile
  if (!canDeleteFile(caller, file)) return NextResponse.json({ error: 'Permesso negato' }, { status: 403 })
  if (!validStorageObject(file, S3_BUCKET)) return NextResponse.json({ error: 'File non disponibile' }, { status: 409 })

  // Prima l'oggetto, poi il metadato. Se l'oggetto non c'è più, procediamo lo stesso.
  try { await deleteObject(file.object_key) } catch {
    return NextResponse.json({ error: 'Non è stato possibile eliminare il file dallo storage' }, { status: 502 })
  }

  const { error: delErr } = await caller.admin.from('files').delete().eq('id', params.id)
  if (delErr) return NextResponse.json({ error: 'Non è stato possibile eliminare il metadato del file' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
