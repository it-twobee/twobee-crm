import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getObject } from '@/lib/storage/s3'
import type { StorageFile, FileShare } from '@/lib/storage/shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/public/files/:token — download PUBBLICO via link di condivisione.
// NESSUNA auth: il middleware lascia passare /api/*, la sicurezza è il token
// non indovinabile + eventuale scadenza/revoca. Usa il service role per leggere.
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const admin = createAdminClient()

  const { data: shareRow } = await admin.from('file_shares').select('*').eq('token', params.token).single()
  const share = shareRow as FileShare | null
  if (!share || share.revoked) {
    return NextResponse.json({ error: 'Link non valido o revocato' }, { status: 404 })
  }
  if (share.expires_at && new Date(share.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: 'Link scaduto' }, { status: 410 })
  }

  const { data: fileRow } = await admin.from('files').select('*').eq('id', share.file_id).single()
  const file = fileRow as StorageFile | null
  if (!file) return NextResponse.json({ error: 'File non trovato' }, { status: 404 })

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
