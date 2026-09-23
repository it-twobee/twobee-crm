import { NextResponse } from 'next/server'
import { requireMaterialAccess } from '@/lib/storage/guard'
import { isStorageConfigured } from '@/lib/storage/s3'
import { isStorageUuid } from '@/lib/storage/access'
import { normalizePath, rejectMaterial } from '@/lib/portal/materials'
import { storeMaterial } from '@/lib/portal/upload'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* §398 — POST /api/area-cliente/file?client=…[&progetto=…][&percorso=…]
   Il verso nostro dell'area cliente: stesso spazio, stesse regole, e una riga
   `source='team'` che il cliente non legge — la sua policy gli passa solo i
   file che ha caricato lui. Il corpo è il file grezzo, come per lui. */
export async function POST(req: Request) {
  const url = new URL(req.url)
  const clientId = url.searchParams.get('client') ?? ''
  // Il contesto passa dalla RLS della sorgente: un'azienda nascosta al
  // workspace resta nascosta anche qui (§213).
  const gate = await requireMaterialAccess(clientId, true)
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { caller } = gate
  if (!isStorageConfigured()) return NextResponse.json({ error: 'Storage non configurato' }, { status: 503 })

  const projectId = url.searchParams.get('progetto')
  const idempotencyKey = req.headers.get('x-idempotency-key') ?? ''
  const name = decodeURIComponent((req.headers.get('x-file-name') ?? '').trim())
  const mime = (req.headers.get('content-type') ?? '').split(';')[0].trim() || null
  const declared = Number(req.headers.get('content-length') ?? '')

  if (!isStorageUuid(idempotencyKey)) return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
  if (projectId && !isStorageUuid(projectId)) return NextResponse.json({ error: 'Progetto non valido' }, { status: 400 })
  let path: string | null
  try { path = normalizePath(url.searchParams.get('percorso')) }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Percorso non valido' }, { status: 400 }) }

  const early = rejectMaterial({ name, mime, size: Number.isFinite(declared) && declared > 0 ? declared : 1 })
  if (early) return NextResponse.json({ error: early }, { status: 400 })
  if (!req.body) return NextResponse.json({ error: 'File mancante' }, { status: 400 })

  const profile = await caller.session.from('profiles').select('full_name').eq('id', caller.userId).maybeSingle()
  const result = await storeMaterial({
    clientId, actorId: caller.userId, actorName: profile.data?.full_name?.trim() || 'Team TwoBee',
    source: 'team', name, mime, body: req.body, idempotencyKey, path, projectId, activityId: null,
    admin: caller.admin, actor: caller.admin,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ material: { id: result.id }, ripetuto: result.repeated, spazioRestante: result.leftBytes })
}
