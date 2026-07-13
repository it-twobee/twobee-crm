import { NextResponse } from 'next/server'
import { getCaller, canReadFile } from '@/lib/storage/guard'
import type { StorageFile } from '@/lib/storage/shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/files?folder=&entityType=&entityId= — metadati (filtrati per permesso)
export async function GET(req: Request) {
  const caller = await getCaller()
  if (!caller) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const url = new URL(req.url)
  const folder = url.searchParams.get('folder')
  const entityType = url.searchParams.get('entityType')
  const entityId = url.searchParams.get('entityId')
  // folderId: assente = radice del contesto (folder_id IS NULL); un id = quella cartella.
  const folderId = url.searchParams.get('folderId')

  let query = caller.admin.from('files').select('*').order('created_at', { ascending: false })
  if (folder) query = query.eq('folder', folder)
  if (entityType) query = query.eq('entity_type', entityType)
  if (entityId) query = query.eq('entity_id', entityId)
  if (folderId) query = query.eq('folder_id', folderId)
  else query = query.is('folder_id', null)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const files = ((data ?? []) as StorageFile[]).filter(f => canReadFile(caller, f))
  return NextResponse.json({ files })
}
