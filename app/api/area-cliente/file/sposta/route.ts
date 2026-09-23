import { NextResponse } from 'next/server'
import { requireMaterialAccess } from '@/lib/storage/guard'
import { isStorageUuid } from '@/lib/storage/access'
import { normalizePath } from '@/lib/portal/materials'
import { organizeFailure } from '@/lib/portal/organize'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX = 500

/* §413 — POST /api/area-cliente/file/sposta — `{ client, ids, destinazione }`
   Sposta uno o più file in una cartella (`''` = la radice), dentro lo stesso
   spazio. Tutti o nessuno: lo fa una funzione del database. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as { client?: string; ids?: unknown; destinazione?: unknown }
  const gate = await requireMaterialAccess(body.client ?? '', true)
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const ids = Array.isArray(body.ids) ? Array.from(new Set(body.ids)) : []
  if (!ids.length || ids.length > MAX || !ids.every(isStorageUuid)) {
    return NextResponse.json({ error: `Scegli da 1 a ${MAX} file.` }, { status: 400 })
  }
  let path: string | null
  try { path = normalizePath(body.destinazione ?? '') } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Destinazione non valida' }, { status: 400 })
  }

  // I file devono essere dell'azienda che la guard ha controllato, e leggibili
  // per chi chiede: la RLS risponde prima del service role.
  const own = await gate.caller.session.from('portal_materials').select('id')
    .eq('client_id', body.client).is('deleted_at', null).in('id', ids)
  if (own.error) return NextResponse.json({ error: 'File non disponibili' }, { status: 503 })
  if ((own.data ?? []).length !== ids.length) return NextResponse.json({ error: 'Qualche file non c’è più: ricarica la pagina.' }, { status: 404 })

  const moved = await gate.caller.admin.rpc('portal_material_move', { p_ids: ids, p_path: path ?? '' })
  if (moved.error) {
    const failure = organizeFailure(moved.error)
    return NextResponse.json({ error: failure.error }, { status: failure.status })
  }
  return NextResponse.json({ ok: true, spostati: moved.data })
}
