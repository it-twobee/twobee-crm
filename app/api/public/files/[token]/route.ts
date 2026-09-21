import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getObject, S3_BUCKET } from '@/lib/storage/s3'
import { canShareFile, fileResponseHeaders, validStorageObject } from '@/lib/storage/access'
import type { StorageFile, FileShare } from '@/lib/storage/shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/public/files/:token — download PUBBLICO via link di condivisione.
// NESSUNA auth: il middleware lascia passare /api/*, la sicurezza è il token
// non indovinabile + eventuale scadenza/revoca. Usa il service role per leggere.
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(params.token)) return NextResponse.json({ error: 'Link non valido o revocato' }, { status: 404 })
  const admin = createAdminClient()

  const { data: shareRow, error: shareError } = await admin.from('file_shares').select('*').eq('token', params.token).single()
  const share = shareRow as FileShare | null
  if (shareError || !share || share.revoked || !share.created_by) {
    return NextResponse.json({ error: 'Link non valido o revocato' }, { status: 404 })
  }
  if (share.expires_at && new Date(share.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: 'Link scaduto' }, { status: 410 })
  }

  const { data: fileRow, error: fileError } = await admin.from('files').select('*').eq('id', share.file_id).single()
  const file = fileRow as StorageFile | null
  if (fileError || !file || !validStorageObject(file, S3_BUCKET)) return NextResponse.json({ error: 'File non trovato' }, { status: 404 })

  const { data: creator, error: creatorError } = await admin.from('profiles').select('id,role,app_role,is_active').eq('id', share.created_by).maybeSingle()
  if (creatorError || !creator || !canShareFile({ userId: creator.id, role: creator.role, appRole: creator.app_role, active: creator.is_active !== false }, file)) {
    return NextResponse.json({ error: 'Link non valido o revocato' }, { status: 404 })
  }
  if (file.entity_type === 'feedback') {
    const source = await admin.from('feedback').select('id').eq('id', file.entity_id).maybeSingle()
    if (source.error || !source.data) return NextResponse.json({ error: 'Link non valido o revocato' }, { status: 404 })
  }

  let obj
  try {
    obj = await getObject(file.object_key)
  } catch {
    return NextResponse.json({ error: 'Storage non disponibile' }, { status: 502 })
  }

  const headers = fileResponseHeaders(file.name, file.mime || obj.contentType, obj.contentLength)
  return new Response(obj.body, { headers })
}
