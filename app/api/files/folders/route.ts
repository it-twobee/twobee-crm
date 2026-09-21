import { NextResponse } from 'next/server'
import { getCaller, canReadFolder, canWriteStorage, canAccessStorageContext, validStorageParent } from '@/lib/storage/guard'
import { isStorageFolder } from '@/lib/storage/shared'
import type { StorageFolderRow } from '@/lib/storage/shared'
import { isStorageUuid, parseStorageContext } from '@/lib/storage/access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/files/folders?folder=&entityType=&entityId=&parentId= — cartelle figlie
export async function GET(req: Request) {
  const caller = await getCaller()
  if (!caller) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const url = new URL(req.url)
  const folder = url.searchParams.get('folder')
  const entityType = url.searchParams.get('entityType')
  const entityId = url.searchParams.get('entityId')
  const parentId = url.searchParams.get('parentId')

  if ((folder && !isStorageFolder(folder)) || (entityId && !isStorageUuid(entityId)) || (parentId && !isStorageUuid(parentId))
    || (!!entityType !== !!entityId)) return NextResponse.json({ error: 'Filtri non validi' }, { status: 400 })

  let query = caller.session.from('file_folders').select('*').order('name', { ascending: true })
  if (folder) query = query.eq('folder', folder)
  if (entityType) query = query.eq('entity_type', entityType)
  if (entityId) query = query.eq('entity_id', entityId)
  if (parentId) query = query.eq('parent_id', parentId)
  else query = query.is('parent_id', null)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: 'Non è stato possibile leggere le cartelle' }, { status: 500 })
  return NextResponse.json({ folders: ((data ?? []) as StorageFolderRow[]).filter(folder => canReadFolder(caller, folder)) })
}

// POST /api/files/folders — crea una cartella { name, folder, entityType?, entityId?, parentId? }
export async function POST(req: Request) {
  const caller = await getCaller()
  if (!caller) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  if (!canWriteStorage(caller)) return NextResponse.json({ error: 'Accesso in sola lettura' }, { status: 403 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Body non valido' }, { status: 400 }) }

  if (!body || Array.isArray(body)) return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const context = parseStorageContext(body.folder ?? 'misc', body.entityType, body.entityId)
  const parentId = body.parentId || null

  if (!name) return NextResponse.json({ error: 'Nome cartella mancante' }, { status: 400 })
  if (name.length > 120) return NextResponse.json({ error: 'Nome troppo lungo' }, { status: 400 })
  if (!context || (parentId !== null && !isStorageUuid(parentId))) return NextResponse.json({ error: 'Contesto non valido' }, { status: 400 })
  if (!await canAccessStorageContext(caller, context, true) || !await validStorageParent(caller, context, parentId, true)) {
    return NextResponse.json({ error: 'Contesto o cartella non autorizzati' }, { status: 403 })
  }
  const { folder, entity_type: entityType, entity_id: entityId } = context

  const { data, error } = await caller.admin
    .from('file_folders')
    .insert({
      name,
      parent_id: parentId,
      folder,
      entity_type: entityType,
      entity_id: entityId,
      created_by: caller.userId,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Non è stato possibile creare la cartella' }, { status: 500 })
  return NextResponse.json({ folder: data })
}
