import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getObject, putObject } from '@/lib/storage/s3'
import { THUMB_SOURCE_MAX_BYTES, makeThumbnail, readAll, thumbHeaders } from '@/lib/storage/thumb'
import { isStorageUuid } from '@/lib/storage/access'
import { hasThumbnail, previewKind, thumbObjectKey } from '@/lib/portal/materials'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* §401 — GET /api/portale/materiali/:id/miniatura
   Cercare fra venti immagini aprendole una per una non è cercare. La miniatura
   si genera **una volta sola** e resta accanto all'originale su MinIO: la
   seconda visita la trova già fatta.

   Non è il file rimpicciolito dal CSS: quello sarebbe un download intero per
   ogni riga, e con venti foto da 8 MB sarebbero 160 MB per scorrere un elenco.

   `sharp` è un di più: se il binario non c'è — succede, è un modulo nativo e in
   produzione si gira su musl — questa rotta risponde 404 e l'elenco torna alle
   icone di prima. Una miniatura assente non è un guasto.

   §415 — Anche un PDF ha la sua: la prima pagina, disegnata da pdf.js sul
   server (`pdf-parse`, che lo porta con sé insieme al canvas nativo). Vale la
   stessa regola di `sharp`: se il modulo non carica, niente miniatura, e resta
   l'icona. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await createClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  if (!isStorageUuid(params.id)) return NextResponse.json({ error: 'Non trovato' }, { status: 404 })

  // L'autorizzazione è la stessa del download: la RLS. Una miniatura è il file.
  const material = await session.from('portal_materials')
    .select('id, name, mime, size').eq('id', params.id).is('deleted_at', null).maybeSingle()
  if (material.error) return NextResponse.json({ error: 'Non disponibile' }, { status: 503 })
  if (!material.data) return NextResponse.json({ error: 'Non trovato' }, { status: 404 })
  if (!hasThumbnail(material.data.mime, material.data.name)) {
    return NextResponse.json({ error: 'Senza miniatura' }, { status: 404 })
  }
  if (Number(material.data.size) > THUMB_SOURCE_MAX_BYTES) {
    return NextResponse.json({ error: 'Originale troppo grande per una miniatura' }, { status: 404 })
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: 'Non configurato' }, { status: 503 })

  const key = thumbObjectKey(params.id)
  try {
    const cached = await getObject(key)
    return new Response(cached.body, { headers: thumbHeaders(cached.contentLength ?? 0) })
  } catch { /* prima visita: si genera adesso */ }

  const stored = await createAdminClient().from('portal_materials')
    .select('storage_key').eq('id', params.id).maybeSingle()
  if (stored.error || !stored.data?.storage_key) return NextResponse.json({ error: 'Non trovato' }, { status: 404 })

  let thumb: Buffer
  try {
    const source = await readAll((await getObject(stored.data.storage_key)).body)
    thumb = await makeThumbnail(source, previewKind(material.data.mime, material.data.name) === 'pdf')
  } catch {
    return NextResponse.json({ error: 'Miniatura non disponibile' }, { status: 404 })
  }

  // Se il salvataggio fallisce si serve lo stesso: la prossima visita riproverà.
  try { await putObject(key, thumb, 'image/webp') } catch { /* si rigenererà */ }
  return new Response(new Uint8Array(thumb), { headers: thumbHeaders(thumb.length) })
}
