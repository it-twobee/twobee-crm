import { NextResponse } from 'next/server'
import { requireSocialContent } from '@/lib/social-guard'
import { storeSocialMedia } from '@/lib/social-media'
import { isStorageConfigured } from '@/lib/storage/s3'
import { isStorageUuid } from '@/lib/storage/access'
import { rejectSocialMedia } from '@/lib/social'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* §467 — POST /api/social/media?contenuto=<id>
   Il corpo è il file grezzo, come per i materiali: un video da 300 MB non
   passa da un FormData in memoria. Nome e chiave di idempotenza viaggiano
   negli header, così un secondo invio dello stesso file non ne fa due. */
export async function POST(req: Request) {
  const url = new URL(req.url)
  const gate = await requireSocialContent(url.searchParams.get('contenuto') ?? '', true)
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })
  if (!isStorageConfigured()) return NextResponse.json({ error: 'Storage non configurato' }, { status: 503 })

  const idempotencyKey = req.headers.get('x-idempotency-key') ?? ''
  const name = decodeURIComponent((req.headers.get('x-file-name') ?? '').trim())
  const mime = (req.headers.get('content-type') ?? '').split(';')[0].trim() || null
  const declared = Number(req.headers.get('content-length') ?? '')
  if (!isStorageUuid(idempotencyKey)) return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })

  // Prima di aprire lo storage: un tipo sbagliato non deve costare un upload.
  const early = rejectSocialMedia({ name, mime, size: Number.isFinite(declared) && declared > 0 ? declared : 1 })
  if (early) return NextResponse.json({ error: early }, { status: 400 })
  if (!req.body) return NextResponse.json({ error: 'File mancante' }, { status: 400 })

  const result = await storeSocialMedia({
    contentId: gate.content.id, projectId: gate.content.project_id, actorId: gate.caller.userId,
    name, mime, body: req.body, idempotencyKey, db: gate.caller.admin,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ media: { id: result.id }, ripetuto: result.repeated })
}
