import { NextResponse } from 'next/server'
import { getCaller } from '@/lib/storage/guard'
import { isStorageFolder } from '@/lib/storage/shared'

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

  let query = caller.admin.from('file_folders').select('*').order('name', { ascending: true })
  if (folder) query = query.eq('folder', folder)
  if (entityType) query = query.eq('entity_type', entityType)
  if (entityId) query = query.eq('entity_id', entityId)
  if (parentId) query = query.eq('parent_id', parentId)
  else query = query.is('parent_id', null)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ folders: data ?? [] })
}

// POST /api/files/folders — crea una cartella { name, folder, entityType?, entityId?, parentId? }
export async function POST(req: Request) {
  const caller = await getCaller()
  if (!caller) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Body non valido' }, { status: 400 }) }

  const name = String(body.name ?? '').trim()
  const folder = String(body.folder ?? 'misc')
  const entityType = (body.entityType as string) || null
  const entityId = (body.entityId as string) || null
  const parentId = (body.parentId as string) || null

  if (!name) return NextResponse.json({ error: 'Nome cartella mancante' }, { status: 400 })
  if (name.length > 120) return NextResponse.json({ error: 'Nome troppo lungo' }, { status: 400 })
  if (!isStorageFolder(folder)) return NextResponse.json({ error: `Cartella non valida: ${folder}` }, { status: 400 })

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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ folder: data })
}
