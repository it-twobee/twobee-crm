import { NextResponse } from 'next/server'
import { getCaller } from '@/lib/storage/guard'
import { deleteObject } from '@/lib/storage/s3'
import type { StorageFile, StorageFolderRow } from '@/lib/storage/shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// DELETE /api/files/folders/:id — elimina cartella + sottocartelle + file (ricorsivo).
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const caller = await getCaller()
  if (!caller) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { data: folder, error } = await caller.admin
    .from('file_folders').select('*').eq('id', params.id).single()
  if (error || !folder) return NextResponse.json({ error: 'Cartella non trovata' }, { status: 404 })

  const f = folder as StorageFolderRow
  const owner = f.created_by === caller.userId
  if (caller.role !== 'admin' && !owner) return NextResponse.json({ error: 'Permesso negato' }, { status: 403 })

  // Sottoalbero: prendo tutte le cartelle del contesto e raccolgo i discendenti.
  let ctxQuery = caller.admin.from('file_folders').select('id, parent_id').eq('folder', f.folder)
  ctxQuery = f.entity_type ? ctxQuery.eq('entity_type', f.entity_type) : ctxQuery.is('entity_type', null)
  ctxQuery = f.entity_id ? ctxQuery.eq('entity_id', f.entity_id) : ctxQuery.is('entity_id', null)
  const { data: all } = await ctxQuery
  const rows = (all ?? []) as { id: string; parent_id: string | null }[]

  const childrenOf = new Map<string, string[]>()
  for (const r of rows) {
    if (!r.parent_id) continue
    const arr = childrenOf.get(r.parent_id) ?? []
    arr.push(r.id)
    childrenOf.set(r.parent_id, arr)
  }
  const subtree: string[] = []
  const stack = [f.id]
  while (stack.length) {
    const cur = stack.pop()!
    subtree.push(cur)
    for (const c of childrenOf.get(cur) ?? []) stack.push(c)
  }

  // File contenuti nel sottoalbero → cancella oggetti su MinIO + righe.
  const { data: files } = await caller.admin
    .from('files').select('id, object_key').in('folder_id', subtree)
  for (const file of (files ?? []) as Pick<StorageFile, 'id' | 'object_key'>[]) {
    try { await deleteObject(file.object_key) } catch {}
  }
  if (files && files.length) {
    await caller.admin.from('files').delete().in('folder_id', subtree)
  }

  // Cancella la cartella radice del sottoalbero: il CASCADE su parent_id porta via le figlie.
  const { error: delErr } = await caller.admin.from('file_folders').delete().eq('id', f.id)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, deletedFolders: subtree.length, deletedFiles: files?.length ?? 0 })
}
