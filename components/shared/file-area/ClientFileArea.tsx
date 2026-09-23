'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  Archive, ArchiveRestore, FileArchive, FolderInput, FolderOpen, FolderPlus, FolderUp, LayoutGrid, List, Loader2, Pencil,
  Trash2, Upload, X,
} from 'lucide-react'
import { getClientFiles } from '@/app/actions/client-files'
import { quotaLeft } from '@/lib/portal/materials'
import type { ClientFilesData } from '@/app/actions/client-files'
import { hasPreview, MaterialPreview } from '@/components/shared/MaterialPreview'
import { SearchInput, Segmented } from '@/components/shared/formkit'
import {
  DEFAULT_DIR, SPACE_LABEL, allFolders, folderMoveTarget, folderNameError, isInside, joinPath, lastSegment,
  listFolder, parentPath, renameFile, searchMaterials, sortFiles, sortFolders, splitName,
} from '@/lib/portal/explorer'
import type { ClientMaterial, SearchResult, SortDir, SortKey, Space } from '@/lib/portal/explorer'
import {
  Breadcrumb, ConfirmDialog, FileCard, FileRow, FolderCard, FolderRow, UploadPanel, buttonCls, locationOf,
} from './items'
import type { DropProps, MenuItem } from './items'
import { MoveDialog, NameDialog } from './dialogs'
import { pickedFromDrop, pickedFromInput, useUploads } from './uploads'

/* §416 — L'area file di un cliente, vista da noi: un esploratore, non più un
   elenco. È **una sola** e sta in due posti — la scheda del cliente e la
   sezione Documenti — perché la stessa domanda non può avere due risposte a
   seconda della pagina da cui ci si arriva (§403).

   I dati li carica da sé, dalla stessa azione in tutti e due i posti, e li
   rilegge dopo ogni scrittura: tenerli in chi la monta voleva dire che nella
   scheda cliente un file caricato non compariva finché non si cambiava tab.

   Due spazi: «Nostri», che il cliente non vede, e «Dal cliente», che è quello
   che ha caricato lui dal suo portale. Si carica solo nel nostro: la rotta
   scrive sempre `source='team'`, e mettere un file nello spazio del cliente
   vorrebbe dire farglielo vedere — che è una pubblicazione, non un
   caricamento. */

type Layout = 'elenco' | 'griglia'
type View = 'cartelle' | 'recenti'
type Prefs = { space: Space; layout: Layout; sort: SortKey; dir: SortDir }
const PREFS_KEY = 'twobee-area-file'
const DEFAULT_PREFS: Prefs = { space: 'team', layout: 'elenco', sort: 'data', dir: 'desc' }

const SORT_OPTIONS: { value: `${SortKey}:${SortDir}`; label: string }[] = [
  { value: 'data:desc', label: 'Più recenti' },
  { value: 'data:asc', label: 'Meno recenti' },
  { value: 'nome:asc', label: 'Nome, A→Z' },
  { value: 'nome:desc', label: 'Nome, Z→A' },
  { value: 'dimensione:desc', label: 'Più pesanti' },
  { value: 'dimensione:asc', label: 'Più leggeri' },
]

function readPrefs(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<Prefs>
    return {
      space: raw.space === 'cliente' ? 'cliente' : 'team',
      layout: raw.layout === 'griglia' ? 'griglia' : 'elenco',
      sort: raw.sort && raw.sort in DEFAULT_DIR ? raw.sort : 'data',
      dir: raw.dir === 'asc' ? 'asc' : raw.dir === 'desc' ? 'desc' : DEFAULT_DIR[raw.sort ?? 'data'],
    }
  } catch { return DEFAULT_PREFS }
}

const URL_SPACE: Record<Space, string> = { team: 'nostri', cliente: 'cliente' }

/* §413 — Cosa si trascina dentro l'area: file, o una cartella. Tipi propri,
   così un trascinamento dal computer (`Files`) non si confonde con uno
   spostamento, e un link trascinato da un'altra pagina non sposta niente. */
const DRAG_FILES = 'application/x-twobee-files'
const DRAG_FOLDER = 'application/x-twobee-folder'

type Dialog =
  | { kind: 'nuova' }
  | { kind: 'rinomina-file'; m: ClientMaterial }
  | { kind: 'rinomina-cartella'; path: string }
  | { kind: 'sposta-file'; ids: string[] }
  | { kind: 'sposta-cartella'; path: string }

export function ClientFileArea({ clientId, portalTabHref, syncUrl = false }: {
  clientId: string
  portalTabHref?: string
  /** Solo dove l'area è una per pagina: la cartella corrente sta nell'indirizzo e sopravvive a un ricarico. */
  syncUrl?: boolean
}) {
  const params = useSearchParams()
  const [data, setData] = useState<ClientFilesData | null>(null)
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS)
  const [path, setPath] = useState('')
  const [view, setView] = useState<View>('cartelle')
  const [query, setQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [preview, setPreview] = useState<ClientMaterial | null>(null)
  const [toDelete, setToDelete] = useState<ClientMaterial[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)
  const zipFrame = useRef<HTMLIFrameElement>(null)

  const reload = useCallback(async () => {
    try {
      const result = await getClientFiles(clientId)
      if (result.error) setLoadError(result.error)
      else { setData(result.data ?? null); setLoadError('') }
    } catch { setLoadError('Non è stato possibile caricare i file.') }
    finally { setLoading(false) }
  }, [clientId])

  useEffect(() => { setLoading(true); void reload() }, [reload])

  // Preferenze di chi guarda, e poi l'indirizzo, che vince: un link a una cartella porta lì.
  useEffect(() => {
    const stored = readPrefs()
    const fromUrl = syncUrl ? params?.get('spazio') : null
    setPrefs(fromUrl ? { ...stored, space: fromUrl === 'cliente' ? 'cliente' : 'team' } : stored)
    if (syncUrl) setPath(params?.get('cartella') ?? '')
    // Solo all'apertura: dopo, l'indirizzo lo scrive l'area.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const savePrefs = (change: Partial<Prefs>) => setPrefs(current => {
    const next = { ...current, ...change }
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)) } catch { /* senza storage si resta ai default */ }
    return next
  })

  useEffect(() => {
    if (!syncUrl) return
    // `replaceState`, non il router: cambiare cartella non deve rileggere la pagina dal server,
    // né lasciare una voce nella cronologia per ogni cartella aperta.
    const url = new URL(window.location.href)
    url.searchParams.set('spazio', URL_SPACE[prefs.space])
    if (path) url.searchParams.set('cartella', path); else url.searchParams.delete('cartella')
    window.history.replaceState(window.history.state, '', url)
  }, [syncUrl, prefs.space, path])

  const uploads = useUploads({ clientId, onFinished: reload })

  const materials = useMemo(() => data?.materials ?? [], [data])
  const visible = useMemo(() => showArchived ? materials : materials.filter(m => !m.archived_at), [materials, showArchived])
  const counts = useMemo(() => ({
    team: visible.filter(m => m.source === 'team').length,
    cliente: visible.filter(m => m.source === 'cliente').length,
  }), [visible])
  const space = prefs.space
  const inSpace = useMemo(() => visible.filter(m => m.source === space), [visible, space])
  const explicit = useMemo(() => (data?.folders ?? []).filter(f => f.source === space).map(f => f.path), [data, space])
  const listing = useMemo(() => {
    const here = listFolder(inSpace, path, explicit)
    return { folders: sortFolders(here.folders, prefs.sort, prefs.dir), files: sortFiles(here.files, prefs.sort, prefs.dir) }
  }, [inSpace, path, explicit, prefs.sort, prefs.dir])
  const recent = useMemo(() => sortFiles(inSpace, 'data', 'desc'), [inSpace])
  const searching = query.trim().length > 0
  const results = useMemo(() => searching
    ? searchMaterials(visible, query, (data?.folders ?? []).map(f => ({ space: f.source, path: f.path })))
    : null, [searching, visible, query, data])
  // Tutte le cartelle dello spazio, archiviati compresi: servono a «Sposta in…».
  const spaceFolders = useMemo(() => allFolders(materials.filter(m => m.source === space), explicit), [materials, space, explicit])

  // Una selezione vale per quello che si sta guardando: cambiata la vista, si riparte.
  useEffect(() => { setSelected(new Set()) }, [path, space, view, query, showArchived])

  if (loading) return <p className="flex items-center gap-2 py-6 text-sm text-text-secondary">
    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Carico i file…
  </p>
  // Una rilettura fallita dopo una modifica non cancella quello che si vedeva: si dice sotto.
  if (!data) return loadError ? <p role="alert" className="py-6 text-sm text-error">{loadError}</p> : null
  if (data.schemaMissing) return <p className="py-6 text-sm text-text-secondary">
    L’area file non è ancora attiva: richiede le migration 250 e 251 del portale.
  </p>

  const canWrite = data.canWrite
  // Lo spazio si conta su tutto quello che c'è, archiviati compresi, come fa il server;
  // con un elenco parziale non lo si sa, e allora decide il server file per file.
  const spaceLeft = data.truncated ? undefined : quotaLeft(materials.reduce((sum, m) => sum + (Number(m.size) || 0), 0))
  const canUploadHere = canWrite && space === 'team'
  const canRemove = (m: ClientMaterial) =>
    m.source === 'cliente' ? data.canDeleteClientFiles : (data.canDeleteClientFiles || m.uploaded_by === data.viewerId)

  const goSpace = (next: Space) => { savePrefs({ space: next }); setPath('') }
  const openFolder = (next: string, inSpaceOf?: Space) => {
    if (inSpaceOf && inSpaceOf !== space) savePrefs({ space: inSpaceOf })
    setPath(next); setView('cartelle'); setQuery('')
  }

  /** Una richiesta, e poi si rilegge. Ritorna l'errore da mostrare, o `null`. */
  async function send(url: string, method: 'POST' | 'PATCH', body: unknown, reloadAfter = true): Promise<string | null> {
    try {
      const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        return payload?.error ?? 'Operazione non riuscita.'
      }
      if (reloadAfter) await reload()
      return null
    } catch { return 'Connessione interrotta. Riprova.' }
  }

  async function act(list: ClientMaterial[], azione: 'archivia' | 'ripristina' | 'elimina') {
    setError(''); setPending(true)
    const failures: string[] = []
    for (const m of list) {
      const failure = await send(`/api/area-cliente/file/${m.id}`, 'PATCH', { azione }, false)
      if (failure) failures.push(list.length > 1 ? `${m.name}: ${failure}` : failure)
    }
    await reload()
    setPending(false)
    setSelected(new Set())
    if (failures.length) setError(failures.join(' · '))
    return !failures.length
  }

  const moveFiles = async (ids: string[], destination: string) => {
    setError('')
    const failure = await send('/api/area-cliente/file/sposta', 'POST', { client: clientId, ids, destinazione: destination })
    if (!failure) setSelected(new Set())
    return failure
  }
  const folderAction = (percorso: string, azione: string, extra: Record<string, string> = {}) =>
    send('/api/area-cliente/cartelle', 'PATCH', { client: clientId, spazio: space, percorso, azione, ...extra })
  const moveFolder = async (from: string, toParent: string) => {
    const target = folderMoveTarget(from, toParent)
    if ('error' in target) return target.error
    const failure = await folderAction(from, 'sposta', { destinazione: toParent })
    // Chi stava guardando dentro la cartella spostata la segue.
    if (!failure && isInside(path, from)) setPath(target.path + path.slice(from.length))
    return failure
  }

  const canOrganize = data.canOrganize

  /* §421 — Lo zip si scarica in un iframe nascosto: se va, il browser salva il
     file e la pagina resta dov'è; se la rotta risponde con un errore, l'iframe
     lo carica e lo si legge qui, invece di portare chi guarda su una pagina JSON. */
  const downloadZip = (target: { path: string } | { ids: string[] }) => {
    const frame = zipFrame.current
    if (!frame) return
    setError('')
    frame.onload = () => {
      const doc = frame.contentDocument
      // Uno scarico riuscito non cambia documento: resta about:blank. Se c'è la
      // pagina della rotta, è una risposta d'errore — con la sua frase, o senza.
      if (!doc || !doc.URL.includes('/api/area-cliente/zip')) return
      let message = 'Non è stato possibile preparare lo zip. Riprova.'
      try { message = JSON.parse(doc.body?.innerText ?? '')?.error ?? message } catch { /* non JSON */ }
      setError(message)
    }
    if ('path' in target) {
      const params = new URLSearchParams({ client: clientId, spazio: space })
      if (target.path) params.set('percorso', target.path)
      frame.src = `/api/area-cliente/zip?${params}`
      return
    }
    const doc = frame.contentDocument
    if (!doc) return
    const form = doc.createElement('form')
    form.method = 'POST'; form.action = '/api/area-cliente/zip'
    const add = (name: string, value: string) => {
      const input = doc.createElement('input'); input.type = 'hidden'; input.name = name; input.value = value; form.appendChild(input)
    }
    add('client', clientId)
    target.ids.forEach(id => add('id', id))
    doc.body.appendChild(form)
    form.submit()
  }
  const menuFor = (m: ClientMaterial, outside: boolean): MenuItem[] => [
    ...(outside ? [{
      label: 'Apri la cartella', icon: <FolderOpen className="h-3.5 w-3.5" />,
      onSelect: () => openFolder(m.path ?? '', m.source),
    }] : []),
    ...(canOrganize ? [
      { label: 'Rinomina', icon: <Pencil className="h-3.5 w-3.5" />, onSelect: () => setDialog({ kind: 'rinomina-file', m }) },
      ...(!outside ? [{ label: 'Sposta in…', icon: <FolderInput className="h-3.5 w-3.5" />, onSelect: () => setDialog({ kind: 'sposta-file', ids: [m.id] }) }] : []),
    ] : []),
    ...(canWrite ? [m.archived_at
      ? { label: 'Rimetti in vista', icon: <ArchiveRestore className="h-3.5 w-3.5" />, onSelect: () => { void act([m], 'ripristina') } }
      : { label: 'Archivia', icon: <Archive className="h-3.5 w-3.5" />, onSelect: () => { void act([m], 'archivia') } }] : []),
    ...(canWrite && canRemove(m) ? [{
      label: 'Elimina', icon: <Trash2 className="h-3.5 w-3.5" />, danger: true, onSelect: () => setToDelete([m]),
    }] : []),
  ]

  const folderMenu = (folderPath: string, count: number): MenuItem[] => [
    ...(count ? [{ label: 'Scarica .zip', icon: <FileArchive className="h-3.5 w-3.5" />, onSelect: () => downloadZip({ path: folderPath }) }] : []),
    ...(!canOrganize ? [] : [
    { label: 'Rinomina', icon: <Pencil className="h-3.5 w-3.5" />, onSelect: () => setDialog({ kind: 'rinomina-cartella', path: folderPath }) },
    { label: 'Sposta in…', icon: <FolderInput className="h-3.5 w-3.5" />, onSelect: () => setDialog({ kind: 'sposta-cartella', path: folderPath }) },
    ...(count ? [{
      label: 'Archivia la cartella', icon: <Archive className="h-3.5 w-3.5" />,
      onSelect: () => { setPending(true); void folderAction(folderPath, 'archivia').then(f => { setPending(false); if (f) setError(f) }) },
    }] : []),
    ...(showArchived ? [{
      label: 'Rimetti in vista il contenuto', icon: <ArchiveRestore className="h-3.5 w-3.5" />,
      onSelect: () => { void folderAction(folderPath, 'ripristina').then(f => { if (f) setError(f) }) },
    }] : []),
    ...(!count ? [{
      label: 'Elimina la cartella', icon: <Trash2 className="h-3.5 w-3.5" />, danger: true,
      onSelect: () => { void folderAction(folderPath, 'elimina').then(f => { if (f) setError(f) }) },
    }] : []),
    ]),
  ]

  const previewOf = (m: ClientMaterial) => hasPreview(m.mime, m.name, Number(m.size)) ? () => setPreview(m) : undefined
  // Si scorre fra i file che si stanno guardando, nell'ordine in cui si vedono.
  const previewable = (results ? results.files : view === 'recenti' ? recent : listing.files)
    .filter(m => hasPreview(m.mime, m.name, Number(m.size)))

  /* ── Trascinare: dal computer si carica, dentro l'area si sposta ─────── */
  const dragKind = (e: React.DragEvent) => {
    const types = Array.from(e.dataTransfer.types)
    if (types.includes(DRAG_FILES)) return 'files'
    if (types.includes(DRAG_FOLDER)) return 'folder'
    if (types.includes('Files')) return 'upload'
    return null
  }
  const dropProps = (target: string): DropProps => ({
    over: dropTarget === target,
    onDragOver: e => {
      const kind = dragKind(e)
      if (!kind) return
      e.preventDefault(); e.stopPropagation()
      e.dataTransfer.dropEffect = kind === 'upload' ? (canUploadHere ? 'copy' : 'none') : 'move'
      if (dropTarget !== target) setDropTarget(target)
    },
    onDragLeave: e => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
      setDropTarget(current => current === target ? null : current)
    },
    onDrop: e => {
      const kind = dragKind(e)
      if (!kind) return
      e.preventDefault(); e.stopPropagation()
      setDropTarget(null)
      if (kind === 'files') {
        let ids: string[] = []
        try { ids = JSON.parse(e.dataTransfer.getData(DRAG_FILES)) } catch { /* trascinamento estraneo */ }
        // Lasciati dove sono già: non c'è niente da spostare.
        const moving = inSpace.filter(m => ids.includes(m.id) && (m.path ?? '') !== target).map(m => m.id)
        if (moving.length) void moveFiles(moving, target).then(f => { if (f) setError(f) })
        return
      }
      if (kind === 'folder') {
        const from = e.dataTransfer.getData(DRAG_FOLDER)
        if (!from || from === target || parentPath(from) === target) return
        void moveFolder(from, target).then(f => { if (f) setError(f) })
        return
      }
      if (!canUploadHere) {
        setError(space === 'cliente'
          ? 'Qui carica il cliente, dal suo portale. Quello che carichi tu va in «Nostri».'
          : 'Il tuo accesso è in sola lettura.')
        return
      }
      setError('')
      // Le voci si leggono adesso, dentro l'evento: dopo il browser le svuota.
      void pickedFromDrop(e.dataTransfer).then(picked => uploads.start(picked, target, spaceLeft))
    },
  })
  const HERE = path
  const area = dropProps(HERE)
  const showDropHint = dropTarget === HERE

  const grid = prefs.layout === 'griglia'
  const listCls = grid ? 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5' : 'space-y-0.5'
  // Si sposta solo guardando una cartella: nella ricerca e nei recenti i file vengono da posti diversi.
  const organizing = canOrganize && view === 'cartelle' && !searching

  const fileDrag = (m: ClientMaterial) => organizing ? {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      const ids = selected.has(m.id) ? Array.from(selected) : [m.id]
      e.dataTransfer.setData(DRAG_FILES, JSON.stringify(ids))
      e.dataTransfer.effectAllowed = 'move'
    },
  } : undefined
  const folderDrag = (folderPath: string) => organizing ? {
    draggable: true,
    onDragStart: (e: React.DragEvent) => { e.dataTransfer.setData(DRAG_FOLDER, folderPath); e.dataTransfer.effectAllowed = 'move' },
  } : undefined
  const selectionOf = (m: ClientMaterial) => organizing || (canWrite && view === 'cartelle' && !searching) ? {
    checked: selected.has(m.id),
    onChange: (checked: boolean) => setSelected(current => {
      const next = new Set(current); if (checked) next.add(m.id); else next.delete(m.id); return next
    }),
  } : undefined

  const renderFile = (m: ClientMaterial, outside: boolean) => grid
    ? <FileCard key={m.id} m={m} menu={menuFor(m, outside)} onPreview={previewOf(m)} where={outside ? locationOf(m) : undefined}
        drag={outside ? undefined : fileDrag(m)} selection={outside ? undefined : selectionOf(m)} />
    : <FileRow key={m.id} m={m} menu={menuFor(m, outside)} onPreview={previewOf(m)} where={outside ? locationOf(m) : undefined}
        drag={outside ? undefined : fileDrag(m)} selection={outside ? undefined : selectionOf(m)} />
  const chosen = inSpace.filter(m => selected.has(m.id))

  const emptySpace = space === 'cliente'
    ? (data.portalActive === false
        ? <>Lo spazio del cliente si accende quando gli mandi un invito{portalTabHref
            ? <> dalla scheda <Link href={portalTabHref} className="text-gold-text underline underline-offset-4">Portale cliente</Link></>
            : null}. Il tuo, in «Nostri», funziona già.</>
        : 'Il cliente non ha ancora caricato niente dal suo portale.')
    : canWrite
      ? 'Niente qui. Carica quello che serve al lavoro, o trascinalo in questo riquadro: resta fra noi.'
      : 'Niente qui.'

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-3">
      <div className="w-full sm:w-80">
        <Segmented<Space> value={space} onChange={goSpace} ariaLabel="Spazio dell’area file" options={[
          { value: 'team', label: `${SPACE_LABEL.team} · ${counts.team}` },
          { value: 'cliente', label: `${SPACE_LABEL.cliente} · ${counts.cliente}` },
        ]} />
      </div>
      <div className="w-full sm:ml-auto sm:w-72">
        <SearchInput value={query} onChange={setQuery} placeholder="Cerca file e cartelle" />
      </div>
    </div>
    <p className="text-2xs text-text-tertiary">
      {space === 'team'
        ? 'Il cliente non li vede.'
        : 'Li ha caricati il cliente dal suo portale, e li vede anche lui. Qui non si carica: quello che carichi tu va in «Nostri».'}
    </p>

    {!searching && <div className="flex flex-wrap items-center gap-2">
      <div className="min-w-0 flex-1">
        {view === 'cartelle'
          ? <Breadcrumb space={space} path={path} onGo={setPath} dropFor={organizing ? dropProps : undefined} />
          : <p className="text-sm text-text-secondary">Tutti i file di «{SPACE_LABEL[space]}», dall’ultimo arrivato.</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-44">
          <Segmented<View> value={view} onChange={setView} ariaLabel="Vista" options={[
            { value: 'cartelle', label: 'Cartelle' }, { value: 'recenti', label: 'Recenti' },
          ]} />
        </div>
        {view === 'cartelle' && <label className="sr-only" htmlFor={`ordine-${clientId}`}>Ordina</label>}
        {view === 'cartelle' && <select id={`ordine-${clientId}`} value={`${prefs.sort}:${prefs.dir}`}
          onChange={e => { const [sort, dir] = e.target.value.split(':') as [SortKey, SortDir]; savePrefs({ sort, dir }) }}
          className="min-h-10 rounded-lg border border-border-interactive bg-surface px-2 text-2xs text-text-primary">
          {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>}
        <span className="inline-flex rounded-lg border border-border-interactive" role="group" aria-label="Disposizione">
          <button type="button" aria-pressed={!grid} aria-label="Elenco" onClick={() => savePrefs({ layout: 'elenco' })}
            className={`inline-flex min-h-10 min-w-10 items-center justify-center rounded-l-lg ${!grid ? 'bg-surface-active text-text-primary' : 'text-text-secondary hover:bg-surface-hover'}`}>
            <List className="h-4 w-4" aria-hidden="true" />
          </button>
          <button type="button" aria-pressed={grid} aria-label="Griglia" onClick={() => savePrefs({ layout: 'griglia' })}
            className={`inline-flex min-h-10 min-w-10 items-center justify-center rounded-r-lg ${grid ? 'bg-surface-active text-text-primary' : 'text-text-secondary hover:bg-surface-hover'}`}>
            <LayoutGrid className="h-4 w-4" aria-hidden="true" />
          </button>
        </span>
        <label className="inline-flex min-h-10 items-center gap-2 text-2xs text-text-secondary">
          <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />
          Mostra archiviati
        </label>
        {view === 'cartelle' && inSpace.some(m => !m.archived_at && isInside(m.path, path)) && <button type="button" className={buttonCls}
          onClick={() => downloadZip({ path })}>
          <FileArchive className="h-3.5 w-3.5" aria-hidden="true" />{path ? 'Scarica la cartella' : 'Scarica tutto'}
        </button>}
      </div>
    </div>}

    {!!chosen.length && <div role="region" aria-label="Selezione"
      className="sticky top-14 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-gold bg-surface p-2 shadow-soft">
      <span className="px-1 text-2xs font-semibold text-text-primary">{chosen.length === 1 ? '1 file selezionato' : `${chosen.length} file selezionati`}</span>
      {canOrganize && <button type="button" className={buttonCls} onClick={() => setDialog({ kind: 'sposta-file', ids: chosen.map(m => m.id) })}>
        <FolderInput className="h-3.5 w-3.5" aria-hidden="true" />Sposta in…
      </button>}
      {chosen.some(m => !m.archived_at) && <button type="button" className={buttonCls}
        onClick={() => downloadZip({ ids: chosen.filter(m => !m.archived_at).map(m => m.id) })}>
        <FileArchive className="h-3.5 w-3.5" aria-hidden="true" />Scarica .zip
      </button>}
      <button type="button" className={buttonCls} disabled={pending} onClick={() => { void act(chosen.filter(m => !m.archived_at), 'archivia') }}>
        <Archive className="h-3.5 w-3.5" aria-hidden="true" />Archivia
      </button>
      {chosen.every(canRemove) && <button type="button" className={buttonCls} onClick={() => setToDelete(chosen)}>
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />Elimina
      </button>}
      <button type="button" className={`${buttonCls} ml-auto`} onClick={() => setSelected(new Set())}>
        <X className="h-3.5 w-3.5" aria-hidden="true" />Deseleziona
      </button>
    </div>}

    {canOrganize && !canUploadHere && !searching && view === 'cartelle' && <div className="flex flex-wrap items-center gap-2">
      <button type="button" className={buttonCls} onClick={() => setDialog({ kind: 'nuova' })}>
        <FolderPlus className="h-3.5 w-3.5" aria-hidden="true" />Nuova cartella
      </button>
      <span className="text-2xs text-text-tertiary">Per mettere in ordine i file del cliente: trascinali sulle cartelle.</span>
    </div>}

    {canUploadHere && !searching && <div className="flex flex-wrap items-center gap-2">
      <input ref={fileInput} type="file" multiple className="sr-only" aria-label="Scegli i file da caricare"
        onChange={e => { if (e.target.files?.length) void uploads.start(pickedFromInput(e.target.files), path, spaceLeft); e.target.value = '' }} />
      <input ref={folderInput} type="file" multiple className="sr-only" aria-label="Scegli una cartella da caricare"
        {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
        onChange={e => { if (e.target.files?.length) void uploads.start(pickedFromInput(e.target.files), path, spaceLeft); e.target.value = '' }} />
      <button type="button" className={buttonCls} disabled={uploads.active} onClick={() => fileInput.current?.click()}>
        <Upload className="h-3.5 w-3.5" aria-hidden="true" />Carica file
      </button>
      <button type="button" className={buttonCls} disabled={uploads.active} onClick={() => folderInput.current?.click()}>
        <FolderUp className="h-3.5 w-3.5" aria-hidden="true" />Carica cartella
      </button>
      {canOrganize && view === 'cartelle' && <button type="button" className={buttonCls} onClick={() => setDialog({ kind: 'nuova' })}>
        <FolderPlus className="h-3.5 w-3.5" aria-hidden="true" />Nuova cartella
      </button>}
      <span className="text-2xs text-text-tertiary">
        {path ? <>Finiscono in «{path.split('/').pop()}». </> : null}Puoi anche trascinarli qui sotto.
      </span>
    </div>}

    <UploadPanel jobs={uploads.jobs} active={uploads.active} opening={uploads.opening} totals={uploads.totals}
      onCancel={uploads.cancel} onDismiss={uploads.dismiss} />
    {(error || loadError) && <p role="alert" className="text-sm text-error">{error || loadError}</p>}
    {data.truncated && <p className="text-2xs text-warning">L’area ha più di 20.000 file: qui ne vedi una parte. Scrivici per dividerla.</p>}

    <section aria-label={searching ? 'Risultati della ricerca' : `Contenuto di ${path || SPACE_LABEL[space]}`}
      onDragOver={area.onDragOver} onDragLeave={area.onDragLeave} onDrop={area.onDrop}
      className={`relative min-h-40 rounded-xl border p-2 transition-colors ${showDropHint
        ? (canUploadHere ? 'border-gold bg-gold-dim' : 'border-error bg-error-dim')
        : 'border-transparent'}`}>
      {showDropHint && <p className="pointer-events-none mb-2 text-center text-2xs font-semibold text-text-primary">
        {canUploadHere
          ? `Rilascia per caricare in «${path ? path.split('/').pop() : SPACE_LABEL.team}»`
          : 'Qui carica il cliente: rilascia i file in «Nostri».'}
      </p>}

      {results ? <SearchResults results={results} query={query} renderFile={m => renderFile(m, true)}
        listCls={listCls} grid={grid} onOpenFolder={openFolder} />
        : view === 'recenti'
          ? (recent.length
              ? <ul className={listCls}>{recent.map(m => renderFile(m, true))}</ul>
              : <p className="px-2 py-6 text-2xs text-text-tertiary">{emptySpace}</p>)
          : <>
              {!listing.folders.length && !listing.files.length && <p className="max-w-2xl px-2 py-6 text-2xs text-text-tertiary">
                {path ? 'Questa cartella è vuota.' : emptySpace}
              </p>}
              {path && <p className="px-2 pb-1">
                <button type="button" onClick={() => setPath(parentPath(path))}
                  className="text-2xs text-text-secondary underline underline-offset-4 hover:text-text-primary">
                  Torna a «{parentPath(path).split('/').pop() || SPACE_LABEL[space]}»
                </button>
              </p>}
              {!!listing.folders.length && <ul className={`${listCls} ${listing.files.length ? 'mb-3' : ''}`}>
                {listing.folders.map(folder => grid
                  ? <FolderCard key={folder.path} folder={folder} onOpen={() => setPath(folder.path)} drop={dropProps(folder.path)}
                      menu={folderMenu(folder.path, folder.count)} drag={folderDrag(folder.path)} />
                  : <FolderRow key={folder.path} folder={folder} onOpen={() => setPath(folder.path)} drop={dropProps(folder.path)}
                      menu={folderMenu(folder.path, folder.count)} drag={folderDrag(folder.path)} />)}
              </ul>}
              {!!listing.files.length && <ul className={listCls}>{listing.files.map(m => renderFile(m, false))}</ul>}
            </>}
    </section>

    <iframe ref={zipFrame} title="Scarico degli zip" aria-hidden="true" tabIndex={-1} className="hidden" src="about:blank" />
    {preview && <MaterialPreview file={preview} files={previewable} onNavigate={setPreview} onClose={() => setPreview(null)} />}
    {toDelete && <ConfirmDialog title={toDelete.length === 1 ? 'Eliminare il file?' : `Eliminare ${toDelete.length} file?`}
      confirmLabel="Elimina" pending={pending}
      body={<>{toDelete.length === 1 ? `«${toDelete[0].name}» sparisce` : `${toDelete.length} file spariscono`} per tutti{toDelete.some(m => m.source === 'cliente') ? ', anche per il cliente che li ha caricati' : ''}. Non torna indietro: se vuoi solo toglierli di mezzo, archiviali.</>}
      onClose={() => setToDelete(null)}
      onConfirm={() => { void act(toDelete, 'elimina').then(ok => { if (ok) setToDelete(null) }) }} />}

    {dialog?.kind === 'nuova' && <NameDialog title="Nuova cartella" label={`Dentro «${lastSegment(path) || SPACE_LABEL[space]}»`}
      initial="" confirmLabel="Crea" validate={value => {
        const failure = folderNameError(value)
        if (failure) return failure
        return listing.folders.some(f => f.name.toLowerCase() === value.trim().toLowerCase()) ? 'Qui c’è già una cartella con questo nome.' : null
      }}
      onSubmit={async value => {
        let percorso: string | null
        try { percorso = joinPath(path, value) } catch (e) { return e instanceof Error ? e.message : 'Percorso non valido.' }
        return send('/api/area-cliente/cartelle', 'POST', { client: clientId, spazio: space, percorso })
      }}
      onClose={() => setDialog(null)} />}
    {dialog?.kind === 'rinomina-file' && <NameDialog title="Rinomina il file" label="Nome"
      initial={splitName(dialog.m.name).base} suffix={splitName(dialog.m.name).ext} confirmLabel="Rinomina"
      validate={value => { const next = renameFile(dialog.m.name, value); return 'error' in next ? next.error : null }}
      onSubmit={value => send(`/api/area-cliente/file/${dialog.m.id}`, 'PATCH', { azione: 'rinomina', nome: value })}
      onClose={() => setDialog(null)} />}
    {dialog?.kind === 'rinomina-cartella' && <NameDialog title="Rinomina la cartella" label="Nome"
      initial={lastSegment(dialog.path)} confirmLabel="Rinomina" validate={folderNameError}
      onSubmit={async value => {
        const failure = await folderAction(dialog.path, 'rinomina', { nome: value })
        if (!failure && isInside(path, dialog.path)) setPath(`${[parentPath(dialog.path), value].filter(Boolean).join('/')}${path.slice(dialog.path.length)}`)
        return failure
      }}
      onClose={() => setDialog(null)} />}
    {dialog?.kind === 'sposta-file' && <MoveDialog
      title={dialog.ids.length === 1 ? 'Sposta il file' : `Sposta ${dialog.ids.length} file`}
      rootLabel={SPACE_LABEL[space]} folders={spaceFolders}
      disabledReason={target => inSpace.filter(m => dialog.ids.includes(m.id)).every(m => (m.path ?? '') === target) ? 'È già qui' : null}
      onSubmit={target => moveFiles(dialog.ids, target)}
      onClose={() => setDialog(null)} />}
    {dialog?.kind === 'sposta-cartella' && <MoveDialog title={`Sposta «${lastSegment(dialog.path)}»`}
      rootLabel={SPACE_LABEL[space]} folders={spaceFolders}
      disabledReason={target => isInside(target, dialog.path) ? (target === dialog.path ? 'È questa' : 'Ci sta dentro')
        : parentPath(dialog.path) === target ? 'È già qui' : null}
      onSubmit={target => moveFolder(dialog.path, target)}
      onClose={() => setDialog(null)} />}
  </div>
}

function SearchResults({ results, query, renderFile, listCls, grid, onOpenFolder }: {
  results: SearchResult<ClientMaterial>
  query: string
  renderFile: (m: ClientMaterial) => React.ReactNode
  listCls: string
  grid: boolean
  onOpenFolder: (path: string, space: Space) => void
}) {
  if (!results.folders.length && !results.files.length) {
    return <p className="px-2 py-6 text-2xs text-text-tertiary">Nessun file e nessuna cartella con «{query.trim()}», in tutti e due gli spazi.</p>
  }
  return <div className="space-y-4">
    {!!results.folders.length && <div>
      <h3 className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-text-secondary">Cartelle · {results.folders.length}</h3>
      <ul className="space-y-0.5">
        {results.folders.map(hit => <FolderRow key={`${hit.space}:${hit.path}`} folder={hit}
          where={locationOf({ source: hit.space, path: parentPath(hit.path) || null })}
          onOpen={() => onOpenFolder(hit.path, hit.space)} />)}
      </ul>
    </div>}
    {!!results.files.length && <div>
      <h3 className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-text-secondary">File · {results.files.length}</h3>
      <ul className={grid ? listCls : 'space-y-0.5'}>{results.files.map(renderFile)}</ul>
    </div>}
  </div>
}
