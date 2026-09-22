import 'server-only'
import { NextResponse } from 'next/server'
import { getObject } from '@/lib/storage/s3'
import { fileResponseHeaders } from '@/lib/storage/access'
import { parseRange } from './materials'

/* §397 — Servire un file al cliente. Un video senza Range si scarica tutto e
   non si può far scorrere: il player chiede un pezzo, e se gli rispondi 200 con
   l'inizio ricomincia da capo. Gli header restano quelli degli allegati
   interni: privato, niente sniffing, contenuti attivi come allegato. */
export async function serveStoredFile(
  key: string,
  file: { name: string; mime: string | null; size: number },
  rangeHeader: string | null,
): Promise<Response> {
  const range = parseRange(rangeHeader, file.size)
  if (range === 'invalid') {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${file.size}`, 'Accept-Ranges': 'bytes' } })
  }

  let object
  try {
    object = await getObject(key, range ? `bytes=${range.start}-${range.end}` : undefined)
  } catch {
    return NextResponse.json({ error: 'Storage non disponibile' }, { status: 502 })
  }

  const headers = fileResponseHeaders(file.name, file.mime || object.contentType, object.contentLength ?? undefined)
  headers.set('Accept-Ranges', 'bytes')
  if (!range) return new Response(object.body, { headers })
  headers.set('Content-Range', object.contentRange ?? `bytes ${range.start}-${range.end}/${file.size}`)
  return new Response(object.body, { status: 206, headers })
}
