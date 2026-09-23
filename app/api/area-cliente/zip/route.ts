import { Readable } from 'node:stream'
import { NextResponse } from 'next/server'
import yazl from 'yazl'
import { requireMaterialAccess, isStorageAdmin } from '@/lib/storage/guard'
import type { Caller } from '@/lib/storage/guard'
import { getObject, isStorageConfigured } from '@/lib/storage/s3'
import { isStorageUuid } from '@/lib/storage/access'
import { normalizePath } from '@/lib/portal/materials'
import { SPACE_LABEL, isInside, lastSegment } from '@/lib/portal/explorer'
import { isMissingPortalSchema } from '@/lib/portal/model'
import { isSpace } from '@/lib/portal/organize'
import { attachmentHeader, zipEmptyFolders, zipEntryNames, zipFileName } from '@/lib/portal/zip'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* §421 — Scaricare una cartella, o una selezione, come zip.
   GET  /api/area-cliente/zip?client=…&spazio=team|cliente[&percorso=…]  → una cartella (o tutto lo spazio)
   POST /api/area-cliente/zip  (form: client, id, id, …)                 → i file selezionati

   Lo zip esce **mentre si scrive**: ogni oggetto MinIO si apre solo quando
   tocca a lui (`addReadStreamLazy`), niente si tiene in memoria, e oltre i 4 GB
   il formato passa a zip64 da solo. I file non si ricomprimono: quasi tutti lo
   sono già, e così la dimensione totale si sa prima di cominciare e il browser
   mostra quanto manca. Gli archiviati restano fuori, come dagli elenchi. Chi
   chiude la pagina chiude anche lo zip: niente lettura di MinIO a vuoto. */
const MAX_FILES = 5000
const PAGE = 1000

type Row = { id: string; name: string; path: string | null; size: number; created_at: string; source: 'cliente' | 'team' }
type Selection = { kind: 'cartella'; space: 'team' | 'cliente'; path: string } | { kind: 'scelti'; ids: string[] }

async function rowsFor(caller: Caller, clientId: string, selection: Selection) {
  const live = () => caller.session.from('portal_materials').select('id, name, path, size, created_at, source')
    .eq('client_id', clientId).is('deleted_at', null).is('archived_at', null)
  const rows: Row[] = []
  if (selection.kind === 'scelti') {
    // A blocchi: cinquemila id in un solo indirizzo non passano da nessun proxy.
    for (let i = 0; i < selection.ids.length; i += 200) {
      const chunk = await live().in('id', selection.ids.slice(i, i + 200))
      if (chunk.error) return null
      rows.push(...((chunk.data ?? []) as Row[]))
    }
    return rows
  }
  for (let from = 0; ; from += PAGE) {
    const page = await live().eq('source', selection.space).order('id').range(from, from + PAGE - 1)
    if (page.error) return null
    rows.push(...((page.data ?? []) as Row[]))
    if ((page.data ?? []).length < PAGE || rows.length > MAX_FILES) break
  }
  return rows.filter(row => isInside(row.path, selection.path))
}

async function build(req: Request, clientId: string, selection: Selection): Promise<Response> {
  const gate = await requireMaterialAccess(clientId, false)
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { caller } = gate
  if (!isStorageConfigured()) return NextResponse.json({ error: 'Storage non configurato' }, { status: 503 })

  const rows = await rowsFor(caller, clientId, selection)
  if (!rows) return NextResponse.json({ error: 'File non disponibili' }, { status: 503 })
  if (!rows.length) return NextResponse.json({ error: 'Niente da scaricare: la cartella è vuota, o i file sono archiviati.' }, { status: 404 })
  if (rows.length > MAX_FILES) return NextResponse.json({ error: `Più di ${MAX_FILES} file in un solo zip: scarica una cartella alla volta.` }, { status: 413 })

  const company = await caller.session.from(isStorageAdmin(caller) ? 'clients' : 'clients_workspace')
    .select('company_name').eq('id', clientId).maybeSingle()
  // Tutto lo spazio si chiama come lo spazio; una cartella, come la cartella, ed è la radice dello zip.
  const folderName = selection.kind === 'cartella' ? (lastSegment(selection.path) || SPACE_LABEL[selection.space]) : 'selezione'
  const base = selection.kind === 'cartella' ? selection.path : ''
  const prefix = selection.kind === 'cartella' ? lastSegment(selection.path) : ''
  const names = zipEntryNames(rows, base, prefix)

  let empty: string[] = []
  if (selection.kind === 'cartella') {
    const folders = await caller.session.from('portal_material_folders').select('path')
      .eq('client_id', clientId).eq('source', selection.space).limit(5000)
    if (!folders.error) empty = zipEmptyFolders((folders.data ?? []).map(f => f.path as string), rows, base, prefix)
    else if (!isMissingPortalSchema(folders.error)) return NextResponse.json({ error: 'Cartelle non disponibili' }, { status: 503 })
  }

  // Le chiavi dello storage il browser non le vede: si leggono adesso, dopo la guard.
  const keys = new Map<string, string>()
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = await caller.admin.from('portal_materials').select('id, storage_key').in('id', rows.slice(i, i + 200).map(r => r.id))
    if (chunk.error) return NextResponse.json({ error: 'File non disponibili' }, { status: 503 })
    for (const row of chunk.data ?? []) keys.set(row.id as string, row.storage_key as string)
  }

  const zip = new yazl.ZipFile()
  let current: Readable | null = null
  const ordered = [...rows].filter(r => names.has(r.id) && keys.has(r.id))
    .sort((a, b) => names.get(a.id)!.localeCompare(names.get(b.id)!, 'it'))
  for (const row of ordered) {
    zip.addReadStreamLazy(names.get(row.id)!, { size: Number(row.size), compress: false, mtime: new Date(row.created_at) }, done => {
      getObject(keys.get(row.id)!)
        .then(object => { current = Readable.fromWeb(object.body as import('node:stream/web').ReadableStream); done(null, current) })
        .catch(error => done(error, undefined as unknown as NodeJS.ReadableStream))
    })
  }
  for (const dir of empty) zip.addEmptyDirectory(dir)
  // yazl dice la dimensione finale appena la sa (subito, qui: file non compressi di taglia nota).
  // I tipi di @types/yazl dichiarano la callback senza argomenti; il valore c'è.
  const total = await Promise.race([
    new Promise<number>(resolve => zip.end({ forceZip64Format: false, comment: '' }, ((size: number) => resolve(size)) as unknown as () => void)),
    new Promise<number>(resolve => setTimeout(() => resolve(-1), 2000)),
  ])

  const output = zip.outputStream as Readable
  const stop = () => { current?.destroy(); output.destroy() }
  req.signal?.addEventListener('abort', stop)
  zip.on('error', error => { console.error('zip dell’area file', error instanceof Error ? error.message : error); stop() })

  const company_name = (company.data?.company_name as string | undefined) ?? ''
  const headers = new Headers({
    'Content-Type': 'application/zip',
    'Content-Disposition': attachmentHeader(zipFileName(company_name, folderName)),
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  })
  if (total > 0) headers.set('Content-Length', String(total))
  return new Response(Readable.toWeb(output) as ReadableStream, { headers })
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const space = url.searchParams.get('spazio')
  if (!isSpace(space)) return NextResponse.json({ error: 'Spazio non valido' }, { status: 400 })
  let path: string | null
  try { path = normalizePath(url.searchParams.get('percorso') ?? '') } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Cartella non valida' }, { status: 400 })
  }
  return build(req, url.searchParams.get('client') ?? '', { kind: 'cartella', space, path: path ?? '' })
}

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
  const ids = Array.from(new Set(form.getAll('id').map(String)))
  if (!ids.length || ids.length > MAX_FILES || !ids.every(isStorageUuid)) {
    return NextResponse.json({ error: 'Scegli almeno un file.' }, { status: 400 })
  }
  return build(req, String(form.get('client') ?? ''), { kind: 'scelti', ids })
}
