import { NextResponse } from 'next/server'
import { getCaller, canReadFile } from '@/lib/storage/guard'
import { getObject, S3_BUCKET } from '@/lib/storage/s3'
import { fileResponseHeaders, isStorageUuid, validStorageObject } from '@/lib/storage/access'
import type { StorageFile } from '@/lib/storage/shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/files/:id/download — streama i byte da MinIO (proxy backend).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const caller = await getCaller()
  if (!caller) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  if (!isStorageUuid(params.id)) return NextResponse.json({ error: 'File non trovato' }, { status: 404 })

  const { data, error } = await caller.session.from('files').select('*').eq('id', params.id).single()
  if (error || !data) return NextResponse.json({ error: 'File non trovato' }, { status: 404 })

  const file = data as StorageFile
  if (!canReadFile(caller, file)) return NextResponse.json({ error: 'Permesso negato' }, { status: 403 })
  if (!validStorageObject(file, S3_BUCKET)) return NextResponse.json({ error: 'File non disponibile' }, { status: 404 })

  let obj
  try {
    obj = await getObject(file.object_key)
  } catch {
    return NextResponse.json({ error: 'Storage non disponibile' }, { status: 502 })
  }

  const headers = fileResponseHeaders(file.name, file.mime || obj.contentType, obj.contentLength)

  return new Response(obj.body, { headers })
}
