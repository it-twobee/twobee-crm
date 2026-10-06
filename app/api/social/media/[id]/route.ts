import { NextResponse } from 'next/server'
import { requireSocialMedia } from '@/lib/social-guard'
import { removeSocialObjects } from '@/lib/social-media'
import { serveStoredFile } from '@/lib/portal/serve'
import { S3_BUCKET } from '@/lib/storage/s3'
import { validStorageObject } from '@/lib/storage/access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* §467 — GET /api/social/media/:id
   La riga si legge con la sessione (decide la RLS del contenuto), la chiave
   dell'oggetto col service role, e i byte escono con il Range: un reel si
   guarda scorrendo, non scaricandolo tutto. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const gate = await requireSocialMedia(params.id, false)
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const stored = await gate.caller.admin.from('social_content_media').select('storage_key, file_id').eq('id', params.id).maybeSingle()
  if (stored.error) return NextResponse.json({ error: 'File non disponibile' }, { status: 503 })
  if (!stored.data?.file_id) return NextResponse.json({ error: 'File non trovato' }, { status: 404 })
  const file = await gate.caller.admin.from('files').select('folder, bucket, object_key').eq('id', stored.data.file_id).maybeSingle()
  if (file.error) return NextResponse.json({ error: 'File non disponibile' }, { status: 503 })
  // La riga del media e quella del file devono raccontare lo stesso oggetto.
  if (!file.data || file.data.object_key !== stored.data.storage_key || !validStorageObject(file.data, S3_BUCKET)) {
    return NextResponse.json({ error: 'File non coerente' }, { status: 409 })
  }
  return serveStoredFile(stored.data.storage_key, { name: gate.row.name, mime: gate.row.mime, size: Number(gate.row.size) }, req.headers.get('range'))
}

/* DELETE /api/social/media/:id — prima la riga, poi i byte: se lo storage non
   risponde, il file sparisce dal contenuto e l'oggetto rimasto si dichiara. */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const gate = await requireSocialMedia(params.id, true)
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const removed = await gate.caller.admin.from('social_content_media').delete().eq('id', params.id)
    .select('id, storage_key, file_id').maybeSingle()
  if (removed.error) return NextResponse.json({ error: 'Non è stato possibile eliminare il file. Riprova.' }, { status: 500 })
  if (!removed.data) return NextResponse.json({ error: 'File non trovato' }, { status: 404 })
  const orfani = await removeSocialObjects(gate.caller.admin, [removed.data])
  return NextResponse.json({ ok: true, orfani })
}
