import { NextResponse } from 'next/server'
import { getObject } from '@/lib/storage/s3'
import { erroreLavagna, requireLavagna } from '@/lib/lavagna-server'
import { isUuid } from '@/lib/lavagna'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* GET /api/lavagna/media/:id[?v=mini] — i byte di uno sticker o di una foto,
   solo allo staff. Il contenuto di un id non cambia mai (ritirare cancella la
   riga, non la riscrive), quindi il browser lo tiene per sempre: la lavagna
   si ridisegna ogni venti secondi e non deve riscaricare niente. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const porta = await requireLavagna(false)
  if (!porta.ok) return NextResponse.json({ error: porta.error }, { status: porta.status })
  if (!isUuid(params.id)) return NextResponse.json({ error: 'Non trovato' }, { status: 404 })

  const { data, error } = await porta.db.from('lavagna_media').select('chiave_oggetto, chiave_mini').eq('id', params.id).maybeSingle()
  if (error) return NextResponse.json({ error: erroreLavagna(error) }, { status: 503 })
  if (!data) return NextResponse.json({ error: 'Non trovato' }, { status: 404 })
  const riga = data as { chiave_oggetto: string; chiave_mini: string | null }
  const mini = new URL(req.url).searchParams.get('v') === 'mini'

  let oggetto
  try { oggetto = await getObject(mini && riga.chiave_mini ? riga.chiave_mini : riga.chiave_oggetto) } catch {
    return NextResponse.json({ error: 'Storage non disponibile' }, { status: 502 })
  }
  const headers = new Headers({
    'Content-Type': 'image/webp',
    'Content-Disposition': 'inline',
    'Cache-Control': 'private, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
  })
  if (oggetto.contentLength != null) headers.set('Content-Length', String(oggetto.contentLength))
  return new Response(oggetto.body, { headers })
}
