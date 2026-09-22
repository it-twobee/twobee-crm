import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isStorageConfigured } from '@/lib/storage/s3'
import { isStorageUuid } from '@/lib/storage/access'
import { requirePortalWriter, isWriterError } from '@/lib/portal/writer'
import { normalizePath, rejectMaterial } from '@/lib/portal/materials'
import { storeMaterial } from '@/lib/portal/upload'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* §397 — POST /api/portale/materiali?client=…[&progetto=…][&attivita=…][&percorso=…]
   Il corpo è il file, grezzo: `formData()` terrebbe un giga in memoria. Il nome
   arriva in `x-file-name`, il tipo in `Content-Type`, la cartella in `percorso`
   (§398: il browser sa caricare una cartella intera).
   Non passa da `/api/files/upload`: quella è dello staff e la 246 la chiude ai
   clienti apposta. Qui la porta è la membership. */
export async function POST(req: Request) {
  const url = new URL(req.url)
  const writer = await requirePortalWriter(url.searchParams.get('client') ?? '')
  if (isWriterError(writer)) return NextResponse.json({ error: writer.error }, { status: writer.status })
  if (!isStorageConfigured()) return NextResponse.json({ error: 'Storage non configurato' }, { status: 503 })

  const name = decodeURIComponent((req.headers.get('x-file-name') ?? '').trim())
  const mime = (req.headers.get('content-type') ?? '').split(';')[0].trim() || null
  const declared = Number(req.headers.get('content-length') ?? '')
  const idempotencyKey = req.headers.get('x-idempotency-key') ?? ''
  const projectId = url.searchParams.get('progetto')
  const activityId = url.searchParams.get('attivita')

  if (!isStorageUuid(idempotencyKey)) return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
  if (projectId && !isStorageUuid(projectId)) return NextResponse.json({ error: 'Progetto non valido' }, { status: 400 })
  if (activityId && !isStorageUuid(activityId)) return NextResponse.json({ error: 'Attività non valida' }, { status: 400 })
  if (projectId && writer.projectIds !== 'all' && !writer.projectIds.includes(projectId)) {
    return NextResponse.json({ error: 'Questo progetto non è fra quelli condivisi con te.' }, { status: 403 })
  }
  let path: string | null
  try { path = normalizePath(url.searchParams.get('percorso')) }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Percorso non valido' }, { status: 400 }) }

  // Il tipo e il nome si guardano prima di aprire lo storage; la dimensione
  // vera si conosce solo alla fine, ma quella dichiarata evita un giro inutile.
  const early = rejectMaterial({ name, mime, size: Number.isFinite(declared) && declared > 0 ? declared : 1 })
  if (early) return NextResponse.json({ error: early }, { status: 400 })
  if (!req.body) return NextResponse.json({ error: 'File mancante' }, { status: 400 })

  const result = await storeMaterial({
    clientId: writer.clientId, actorId: writer.userId, actorName: writer.name, source: 'cliente',
    name, mime, body: req.body, idempotencyKey, path, projectId, activityId,
    admin: createAdminClient(), actor: writer.db,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ material: { id: result.id }, ripetuto: result.repeated, spazioRestante: result.leftBytes })
}
