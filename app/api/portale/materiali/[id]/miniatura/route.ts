import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getObject, putObject } from '@/lib/storage/s3'
import { isStorageUuid } from '@/lib/storage/access'
import { renderableKind, thumbObjectKey } from '@/lib/portal/materials'

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
   icone di prima. Una miniatura assente non è un guasto. */
const THUMB_EDGE = 320
/** Oltre questa soglia l'originale non si carica in memoria per farne un francobollo. */
const SOURCE_MAX_BYTES = 40 * 1024 * 1024

async function readAll(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  for (;;) {
    const { done, value } = await reader.read()
    if (value) chunks.push(value)
    if (done) break
  }
  return Buffer.concat(chunks)
}

function thumbHeaders(length: number) {
  return new Headers({
    'Content-Type': 'image/webp',
    'Content-Length': String(length),
    // Cinque minuti: abbastanza per scorrere un elenco senza rigenerare niente,
    // abbastanza poco perché una revoca dell'accesso si senta subito. `private`
    // tiene la copia nel browser di chi guarda, fuori da ogni cache condivisa.
    'Cache-Control': 'private, max-age=300',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  })
}

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
  if (renderableKind(material.data.mime, material.data.name) !== 'image') {
    return NextResponse.json({ error: 'Senza miniatura' }, { status: 404 })
  }
  if (Number(material.data.size) > SOURCE_MAX_BYTES) {
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
    const sharp = (await import('sharp')).default
    const source = await readAll((await getObject(stored.data.storage_key)).body)
    thumb = await sharp(source, { failOn: 'none' })
      // `rotate()` senza argomenti applica l'orientamento EXIF: senza, le foto
      // scattate col telefono arrivano coricate.
      .rotate()
      .resize(THUMB_EDGE, THUMB_EDGE, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 70 })
      .toBuffer()
  } catch {
    return NextResponse.json({ error: 'Miniatura non disponibile' }, { status: 404 })
  }

  // Se il salvataggio fallisce si serve lo stesso: la prossima visita riproverà.
  try { await putObject(key, thumb, 'image/webp') } catch { /* si rigenererà */ }
  return new Response(new Uint8Array(thumb), { headers: thumbHeaders(thumb.length) })
}
