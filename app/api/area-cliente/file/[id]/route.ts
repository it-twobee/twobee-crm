import { NextResponse } from 'next/server'
import { getCaller, canWriteStorage } from '@/lib/storage/guard'
import { deleteObject } from '@/lib/storage/s3'
import { isStorageUuid } from '@/lib/storage/access'
import { isAdminRole, isSuperAdminRaw } from '@/lib/permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* §398 — PATCH /api/area-cliente/file/:id — `{ azione: 'archivia' | 'ripristina' | 'elimina' }`
   Archiviare è **nostro e vale per noi**: toglie il file dai nostri elenchi e
   non da quelli del cliente. Far sparire a qualcuno una cosa sua senza dirglielo
   è il modo peggiore di fargli perdere un logo.
   Eliminare davvero un file del cliente lo possono solo admin, founder e super
   admin: i byte spariscono e non tornano. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const caller = await getCaller()
  if (!caller) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  if (!canWriteStorage(caller)) return NextResponse.json({ error: 'Accesso in sola lettura' }, { status: 403 })
  if (!isStorageUuid(params.id)) return NextResponse.json({ error: 'File non trovato' }, { status: 404 })

  const body = await req.json().catch(() => ({})) as { azione?: string }
  if (!['archivia', 'ripristina', 'elimina'].includes(body?.azione ?? '')) {
    return NextResponse.json({ error: 'Azione non valida' }, { status: 400 })
  }

  const material = await caller.session.from('portal_materials')
    .select('id, source, uploaded_by, archived_at').eq('id', params.id).is('deleted_at', null).maybeSingle()
  if (material.error) return NextResponse.json({ error: 'File non disponibile' }, { status: 503 })
  if (!material.data) return NextResponse.json({ error: 'File non trovato' }, { status: 404 })

  if (body.azione === 'elimina') {
    const admin = isAdminRole(caller.appRole) || isSuperAdminRaw(caller.email, caller.appRole)
    // I nostri file li toglie chi li ha caricati; quelli del cliente solo un admin.
    const own = material.data.source === 'team' && material.data.uploaded_by === caller.userId
    if (!admin && !own) {
      return NextResponse.json({
        error: material.data.source === 'cliente'
          ? 'Un file del cliente lo elimina solo un amministratore. Puoi archiviarlo.'
          : 'Puoi eliminare soltanto i file che hai caricato tu.',
      }, { status: 403 })
    }
    const removed = await caller.admin.from('portal_materials')
      .update({ deleted_at: new Date().toISOString(), deleted_by: caller.userId })
      .eq('id', params.id).is('deleted_at', null).select('storage_key, file_id').maybeSingle()
    if (removed.error || !removed.data) return NextResponse.json({ error: 'Non è stato possibile eliminare il file. Riprova.' }, { status: 500 })
    try { await deleteObject(removed.data.storage_key) } catch { /* oggetto già assente */ }
    if (removed.data.file_id) await caller.admin.from('files').delete().eq('id', removed.data.file_id)
    return NextResponse.json({ ok: true })
  }

  const archiving = body.azione === 'archivia'
  const updated = await caller.admin.from('portal_materials').update(
    archiving
      ? { archived_at: new Date().toISOString(), archived_by: caller.userId }
      : { archived_at: null, archived_by: null },
  ).eq('id', params.id).is('deleted_at', null).select('id').maybeSingle()
  if (updated.error || !updated.data) return NextResponse.json({ error: 'Non è stato possibile aggiornare il file. Riprova.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
