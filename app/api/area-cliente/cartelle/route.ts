import { NextResponse } from 'next/server'
import { requireMaterialAccess } from '@/lib/storage/guard'
import { normalizePath } from '@/lib/portal/materials'
import { folderMoveTarget, folderNameError, folderRenameTarget, lastSegment } from '@/lib/portal/explorer'
import { isSpace, organizeFailure } from '@/lib/portal/organize'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Body = { client?: string; spazio?: string; percorso?: string; azione?: string; nome?: string; destinazione?: string }

function parse(raw: unknown): { path: string } | { error: string } {
  try {
    const path = normalizePath(raw)
    return path ? { path } : { error: 'Cartella non valida' }
  } catch (e) { return { error: e instanceof Error ? e.message : 'Cartella non valida' } }
}

/* §413 — POST /api/area-cliente/cartelle — `{ client, spazio, percorso }`
   Una cartella che esiste anche vuota. Si crea in tutti e due gli spazi: nel
   suo, il cliente la vede quando dentro c'è un file, come ogni sua cartella. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as Body
  const gate = await requireMaterialAccess(body.client ?? '', true)
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })
  if (!isSpace(body.spazio)) return NextResponse.json({ error: 'Spazio non valido' }, { status: 400 })
  const parsed = parse(body.percorso)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const nameError = folderNameError(lastSegment(parsed.path))
  if (nameError) return NextResponse.json({ error: nameError }, { status: 400 })

  const created = await gate.caller.admin.from('portal_material_folders').insert({
    client_id: body.client, source: body.spazio, path: parsed.path, created_by: gate.caller.userId,
  }).select('id').single()
  if (created.error) {
    const failure = organizeFailure(created.error)
    return NextResponse.json({ error: failure.error }, { status: failure.status })
  }
  return NextResponse.json({ ok: true, path: parsed.path })
}

/* §413 — PATCH /api/area-cliente/cartelle
   `{ client, spazio, percorso, azione: 'rinomina', nome }` · `'sposta', destinazione`
   · `'archivia' | 'ripristina'` · `'elimina'` (solo vuota).
   Tutte passano da una funzione del database: riscrivono un albero intero, e
   metà albero spostato è peggio di nessuno. */
export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({})) as Body
  const gate = await requireMaterialAccess(body.client ?? '', true)
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })
  if (!isSpace(body.spazio)) return NextResponse.json({ error: 'Spazio non valido' }, { status: 400 })
  const parsed = parse(body.percorso)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const from = parsed.path
  const db = gate.caller.admin
  const common = { p_client: body.client, p_source: body.spazio }

  let result: { data: unknown; error: { code?: string; message?: string } | null }
  if (body.azione === 'rinomina' || body.azione === 'sposta') {
    let target: { path: string } | { error: string }
    if (body.azione === 'rinomina') target = folderRenameTarget(from, body.nome ?? '')
    else {
      let parent: string | null
      try { parent = normalizePath(body.destinazione ?? '') } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : 'Destinazione non valida' }, { status: 400 })
      }
      target = folderMoveTarget(from, parent ?? '')
    }
    if ('error' in target) return NextResponse.json({ error: target.error }, { status: 400 })
    result = await db.rpc('portal_material_folder_move', { ...common, p_from: from, p_to: target.path })
    if (!result.error) return NextResponse.json({ ok: true, path: target.path, spostati: result.data })
  } else if (body.azione === 'archivia' || body.azione === 'ripristina') {
    result = await db.rpc('portal_material_folder_archive', { ...common, p_path: from, p_archive: body.azione === 'archivia' })
    if (!result.error) return NextResponse.json({ ok: true, file: result.data })
  } else if (body.azione === 'elimina') {
    result = await db.rpc('portal_material_folder_delete', { ...common, p_path: from })
    if (!result.error) return NextResponse.json({ ok: true })
  } else {
    return NextResponse.json({ error: 'Azione non valida' }, { status: 400 })
  }
  const failure = organizeFailure(result.error)
  return NextResponse.json({ error: failure.error }, { status: failure.status })
}
