import { NextResponse } from 'next/server'
import { requireSocialMedia } from '@/lib/social-guard'
import { getObject, putObject } from '@/lib/storage/s3'
import { THUMB_SOURCE_MAX_BYTES, makeThumbnail, readAll, thumbHeaders } from '@/lib/storage/thumb'
import { hasThumbnail, previewKind } from '@/lib/portal/materials'
import { socialThumbKey } from '@/lib/social'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* §467 — GET /api/social/media/:id/miniatura
   Come per i materiali (§401): si genera una volta, resta accanto
   all'originale. Un video non ce l'ha — sulla macchina non c'è ffmpeg — e
   resta l'icona. L'autorizzazione è quella del file. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const gate = await requireSocialMedia(params.id, false)
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { row } = gate
  if (!hasThumbnail(row.mime, row.name)) return NextResponse.json({ error: 'Senza miniatura' }, { status: 404 })
  if (Number(row.size) > THUMB_SOURCE_MAX_BYTES) return NextResponse.json({ error: 'Originale troppo grande per una miniatura' }, { status: 404 })

  const key = socialThumbKey(row.id)
  try {
    const cached = await getObject(key)
    return new Response(cached.body, { headers: thumbHeaders(cached.contentLength ?? 0) })
  } catch { /* prima visita: si genera adesso */ }

  const stored = await gate.caller.admin.from('social_content_media').select('storage_key').eq('id', row.id).maybeSingle()
  if (stored.error || !stored.data?.storage_key) return NextResponse.json({ error: 'Non trovato' }, { status: 404 })

  let thumb: Buffer
  try {
    const source = await readAll((await getObject(stored.data.storage_key)).body)
    thumb = await makeThumbnail(source, previewKind(row.mime, row.name) === 'pdf')
  } catch {
    return NextResponse.json({ error: 'Miniatura non disponibile' }, { status: 404 })
  }
  try { await putObject(key, thumb, 'image/webp') } catch { /* si rigenererà */ }
  return new Response(new Uint8Array(thumb), { headers: thumbHeaders(thumb.length) })
}
