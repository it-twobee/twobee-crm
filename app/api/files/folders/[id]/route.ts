import { NextResponse } from 'next/server'
import { getCaller, canManageFolder, canDeleteFile } from '@/lib/storage/guard'
import { deleteObject, S3_BUCKET } from '@/lib/storage/s3'
import type { StorageFile, StorageFolderRow } from '@/lib/storage/shared'
import { isStorageUuid, sameStorageContext, validStorageObject } from '@/lib/storage/access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function allRows<T>(load: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[] | null> {
  const rows: T[] = []
  // PostgREST tronca le risposte: un figlio saltato verrebbe comunque eliminato dal CASCADE.
  for (let offset = 0; offset < 10000; offset += 500) {
    const page = await load(offset, offset + 499)
    if (page.error || !page.data) return null
    rows.push(...page.data)
    if (page.data.length < 500) return rows
  }
  return null
}

// DELETE /api/files/folders/:id — elimina cartella + sottocartelle + file (ricorsivo).
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const caller = await getCaller()
  if (!caller) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  if (!isStorageUuid(params.id)) return NextResponse.json({ error: 'Cartella non trovata' }, { status: 404 })

  const { data: folder, error } = await caller.session
    .from('file_folders').select('*').eq('id', params.id).single()
  if (error || !folder) return NextResponse.json({ error: 'Cartella non trovata' }, { status: 404 })

  const f = folder as StorageFolderRow
  if (!canManageFolder(caller, f)) return NextResponse.json({ error: 'Permesso negato' }, { status: 403 })

  // Anche i figli non visibili vanno controllati: il CASCADE non passa dalla RLS.
  const rows = await allRows<StorageFolderRow>((from, to) => caller.admin.from('file_folders').select('*').order('id').range(from, to))
  if (!rows) return NextResponse.json({ error: 'Non è stato possibile verificare tutti gli elementi della cartella' }, { status: 500 })

  const childrenOf = new Map<string, string[]>()
  for (const r of rows) {
    if (!r.parent_id) continue
    const arr = childrenOf.get(r.parent_id) ?? []
    arr.push(r.id)
    childrenOf.set(r.parent_id, arr)
  }
  const subtree: string[] = []
  const visited = new Set<string>()
  const stack = [f.id]
  while (stack.length) {
    const cur = stack.pop()!
    if (visited.has(cur)) return NextResponse.json({ error: 'Alberatura cartelle non valida' }, { status: 409 })
    visited.add(cur)
    const child = rows.find(row => row.id === cur)
    if (!child || !sameStorageContext(f, child) || !canManageFolder(caller, child)) {
      return NextResponse.json({ error: 'La cartella contiene elementi che non puoi eliminare' }, { status: 403 })
    }
    subtree.push(cur)
    for (const c of childrenOf.get(cur) ?? []) stack.push(c)
  }

  // File contenuti nel sottoalbero → cancella oggetti su MinIO + righe.
  const entries = await allRows<StorageFile>((from, to) => caller.admin.from('files').select('*').in('folder_id', subtree).order('id').range(from, to))
  if (!entries) return NextResponse.json({ error: 'Non è stato possibile verificare tutti i file' }, { status: 500 })
  if (entries.some(file => !sameStorageContext(f, file) || !canDeleteFile(caller, file) || !validStorageObject(file, S3_BUCKET))) {
    return NextResponse.json({ error: 'La cartella contiene file che non puoi eliminare' }, { status: 403 })
  }
  for (const file of entries) {
    try { await deleteObject(file.object_key) } catch {
      return NextResponse.json({ error: 'Eliminazione non completata. Riprova.' }, { status: 502 })
    }
  }
  if (entries.length) {
    const removed = await caller.admin.from('files').delete().in('id', entries.map(file => file.id))
    if (removed.error) return NextResponse.json({ error: 'Eliminazione dei metadati non completata' }, { status: 500 })
  }

  // Cancella la cartella radice del sottoalbero: il CASCADE su parent_id porta via le figlie.
  const { error: delErr } = await caller.admin.from('file_folders').delete().eq('id', f.id)
  if (delErr) return NextResponse.json({ error: 'Eliminazione della cartella non completata' }, { status: 500 })

  return NextResponse.json({ ok: true, deletedFolders: subtree.length, deletedFiles: entries.length })
}
