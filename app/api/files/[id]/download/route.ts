import { NextResponse } from 'next/server'
import { getCaller, canReadFile } from '@/lib/storage/guard'
import { getObject } from '@/lib/storage/s3'
import type { StorageFile } from '@/lib/storage/shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/files/:id/download — streama i byte da MinIO (proxy backend).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const caller = await getCaller()
  if (!caller) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { data, error } = await caller.admin.from('files').select('*').eq('id', params.id).single()
  if (error || !data) return NextResponse.json({ error: 'File non trovato' }, { status: 404 })

  const file = data as StorageFile
  if (!canReadFile(caller, file)) return NextResponse.json({ error: 'Permesso negato' }, { status: 403 })

  let obj
  try {
    obj = await getObject(file.object_key)
  } catch (e) {
    return NextResponse.json({ error: 'Storage non disponibile: ' + (e as Error).message }, { status: 502 })
  }

  const headers = new Headers({
    'Content-Type': file.mime || obj.contentType || 'application/octet-stream',
    'Content-Disposition': `inline; filename="${encodeURIComponent(file.name)}"`,
    'Cache-Control': 'private, no-store',
  })
  if (obj.contentLength) headers.set('Content-Length', String(obj.contentLength))

  return new Response(obj.body, { headers })
}
