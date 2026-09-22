import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { deleteObject } from '@/lib/storage/s3'
import { isStorageUuid } from '@/lib/storage/access'
import { serveStoredFile } from '@/lib/portal/serve'
import { requirePortalWriter, isWriterError } from '@/lib/portal/writer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* §397 — GET /api/portale/materiali/:id
   Come per le consegne, l'autorizzazione **è** la RLS: la riga torna solo a chi
   ha una membership viva su quell'azienda, e nei limiti dei suoi progetti. Lo
   staff passa dalla sua policy. `storage_key` non è concessa a nessuno dei due:
   il service role arriva dopo, solo per leggerla. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await createClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  if (!isStorageUuid(params.id)) return NextResponse.json({ error: 'File non trovato' }, { status: 404 })

  const material = await session.from('portal_materials')
    .select('id, name, mime, size').eq('id', params.id).is('deleted_at', null).maybeSingle()
  // Un errore di lettura non è un «non esiste».
  if (material.error) return NextResponse.json({ error: 'File non disponibile' }, { status: 503 })
  if (!material.data) return NextResponse.json({ error: 'File non trovato' }, { status: 404 })

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: 'Download non configurato' }, { status: 503 })
  const stored = await createAdminClient().from('portal_materials')
    .select('storage_key').eq('id', params.id).maybeSingle()
  if (stored.error || !stored.data?.storage_key) return NextResponse.json({ error: 'File non trovato' }, { status: 404 })

  return serveStoredFile(stored.data.storage_key, {
    name: material.data.name, mime: material.data.mime, size: Number(material.data.size),
  }, req.headers.get('range'))
}

/* Lo spazio è suo: un caricamento sbagliato si toglie. Lo tolgono chi l'ha
   caricato e noi; resta scritto chi e quando, e i byte spariscono davvero. */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const url = new URL(req.url)
  const writer = await requirePortalWriter(url.searchParams.get('client') ?? '')
  if (isWriterError(writer)) return NextResponse.json({ error: writer.error }, { status: writer.status })
  if (!isStorageUuid(params.id)) return NextResponse.json({ error: 'File non trovato' }, { status: 404 })

  const material = await writer.session.from('portal_materials')
    .select('id, uploaded_by').eq('id', params.id).eq('client_id', writer.clientId).is('deleted_at', null).maybeSingle()
  if (material.error) return NextResponse.json({ error: 'File non disponibile' }, { status: 503 })
  if (!material.data) return NextResponse.json({ error: 'File non trovato' }, { status: 404 })
  if (material.data.uploaded_by !== writer.userId) {
    return NextResponse.json({ error: 'Puoi rimuovere soltanto i file che hai caricato tu.' }, { status: 403 })
  }

  const removed = await writer.db.from('portal_materials')
    .update({ deleted_at: new Date().toISOString(), deleted_by: writer.userId })
    .eq('id', params.id).is('deleted_at', null).select('storage_key, file_id').maybeSingle()
  if (removed.error || !removed.data) return NextResponse.json({ error: 'Non è stato possibile rimuovere il file. Riprova.' }, { status: 500 })

  // Prima il binario, poi il metadato dello storage: la riga del portale resta
  // come traccia, ma il file non si scarica più da nessuna porta.
  try { await deleteObject(removed.data.storage_key) } catch { /* oggetto già assente */ }
  await createAdminClient().from('files').delete().eq('id', removed.data.file_id)
  return NextResponse.json({ ok: true })
}
