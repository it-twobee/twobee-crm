'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Archive, ArchiveRestore, ChevronDown, ChevronRight, Eye, ExternalLink, FileText, Folder,
  FolderOpen, FolderUp, Loader2, Search, Trash2, Upload, Users, X,
} from 'lucide-react'
import { MaterialPreview, hasPreview } from '@/components/shared/MaterialPreview'
import { MaterialThumb } from '@/components/shared/MaterialThumb'
import { formatDate } from '@/lib/utils'
import { isDriveUrl, driveKind, DRIVE_KIND_LABEL } from '@/lib/drive'
import { DriveEmbed } from '@/components/shared/DriveEmbed'
import {
  buildMaterialTree, countTree, folderPathOf, humanBytes, materialDownloadHref, rejectMaterial,
} from '@/lib/portal/materials'
import type { MaterialFolder } from '@/lib/portal/materials'
import type { Profile } from '@/lib/types/database'
import { VoceSezione } from '@/components/workspace/VoceSezione'
import type { Sezione } from '@/lib/task-mood'

/* §398 — L'archivio comune è l'**area file di un cliente** vista da noi: quello
   che ha caricato lui e quello che abbiamo caricato noi, nello stesso posto e
   con il confine dichiarato. Il cliente non vede mai il gruppo «Nostri»: non
   perché la pagina lo nasconda, ma perché la sua policy non gliene passa le
   righe. I link Drive restano quello che erano, collegamenti esterni. */

interface DocItem {
  id: string; name: string; file_url: string; file_type: string | null
  created_at: string; client_id: string | null
  uploader: Pick<Profile, 'id' | 'full_name' | 'avatar_url'> | null
  client: { id: string; company_name: string } | null
}
export interface DocMaterial {
  id: string; client_id: string; project_id: string | null; name: string; mime: string | null
  size: number; kind: string; path: string | null; source: 'cliente' | 'team'
  uploaded_by: string; uploaded_by_name: string; created_at: string; archived_at: string | null
}

const button = 'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-border-interactive bg-surface px-2.5 py-1.5 text-2xs text-text-primary hover:bg-surface-hover disabled:opacity-50'

export function DocumentiClient({ documents, materials, clients, canWrite, canDeleteClientFiles, viewerId, voce }: {
  /** §351 — la riga sotto il titolo, **solo** nel portale operativo. */
  voce?: Sezione
  documents: DocItem[]
  materials: DocMaterial[]
  clients: { id: string; company_name: string }[]
  canWrite: boolean
  /** Un file del cliente lo elimina solo un amministratore: agli altri resta archiviare. */
  canDeleteClientFiles: boolean
  viewerId: string
}) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [filterClient, setFilterClient] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [openClients, setOpenClients] = useState<Set<string>>(new Set())
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set())
  const [preview, setPreview] = useState<DocItem | null>(null)
  const [previewFile, setPreviewFile] = useState<DocMaterial | null>(null)
  const [busy, setBusy] = useState<{ name: string; percent: number } | null>(null)
  const [error, setError] = useState('')

  const matches = (text: string) => text.toLowerCase().includes(search.trim().toLowerCase())
  const visibleMaterials = useMemo(() => materials.filter(m =>
    (showArchived || !m.archived_at)
    && (!filterClient || m.client_id === filterClient)
    && (!search.trim() || matches(m.name) || matches(m.path ?? ''))
  ), [materials, filterClient, search, showArchived])
  const visibleDocs = useMemo(() => documents.filter(d =>
    (!filterClient || d.client_id === filterClient)
    && (!search.trim() || matches(d.name))
  ), [documents, filterClient, search])

  const rows = useMemo(() => {
    const ids = new Set([...visibleMaterials.map(m => m.client_id), ...visibleDocs.map(d => d.client_id ?? 'senza')])
    if (filterClient) ids.add(filterClient)
    return Array.from(ids).map(id => ({
      id,
      label: clients.find(c => c.id === id)?.company_name
        ?? visibleDocs.find(d => d.client_id === id)?.client?.company_name ?? 'Senza cliente',
      cliente: visibleMaterials.filter(m => m.client_id === id && m.source === 'cliente'),
      nostri: visibleMaterials.filter(m => m.client_id === id && m.source === 'team'),
      drive: visibleDocs.filter(d => (d.client_id ?? 'senza') === id),
    })).sort((a, b) => a.label.localeCompare(b.label, 'it'))
  }, [visibleMaterials, visibleDocs, clients, filterClient])

  const searching = search.trim().length > 0
  const isOpen = (id: string) => searching || !!filterClient || openClients.has(id)
  const toggle = (set: Set<string>, id: string, apply: (s: Set<string>) => void) => {
    const next = new Set(set); next.has(id) ? next.delete(id) : next.add(id); apply(next)
  }

  function send(clientId: string, file: File) {
    return new Promise<void>((resolve, reject) => {
      const params = new URLSearchParams({ client: clientId })
      const folder = folderPathOf((file as File & { webkitRelativePath?: string }).webkitRelativePath)
      if (folder) params.set('percorso', folder)
      const request = new XMLHttpRequest()
      request.open('POST', `/api/area-cliente/file?${params}`)
      request.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
      request.setRequestHeader('x-file-name', encodeURIComponent(file.name).replace(/%20/g, ' '))
      request.setRequestHeader('x-idempotency-key', crypto.randomUUID())
      request.upload.onprogress = e => {
        if (e.lengthComputable) setBusy({ name: file.name, percent: Math.round((e.loaded / e.total) * 100) })
      }
      request.onload = () => {
        if (request.status >= 200 && request.status < 300) return resolve()
        let message = 'Caricamento non riuscito. Riprova.'
        try { message = JSON.parse(request.responseText)?.error ?? message } catch { /* non JSON */ }
        reject(new Error(message))
      }
      request.onerror = () => reject(new Error('Connessione interrotta durante il caricamento.'))
      request.send(file)
    })
  }

  async function upload(clientId: string, files: FileList) {
    setError('')
    for (const file of Array.from(files)) {
      const rejected = rejectMaterial({ name: file.name, mime: file.type || null, size: file.size })
      if (rejected) { setError(rejected); continue }
      setBusy({ name: file.name, percent: 0 })
      try { await send(clientId, file) } catch (e) { setError(e instanceof Error ? e.message : 'Caricamento non riuscito.'); break }
      finally { setBusy(null) }
    }
    router.refresh()
  }

  async function act(material: DocMaterial, azione: 'archivia' | 'ripristina' | 'elimina') {
    setError('')
    if (azione === 'elimina' && !confirm(`Elimino «${material.name}»? I file non tornano indietro.`)) return
    const response = await fetch(`/api/area-cliente/file/${material.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ azione }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      setError(payload?.error ?? 'Operazione non riuscita.')
      return
    }
    router.refresh()
  }

  const canRemove = (m: DocMaterial) =>
    m.source === 'cliente' ? canDeleteClientFiles : (canDeleteClientFiles || m.uploaded_by === viewerId)

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 sm:px-6 py-4 border-b border-border shrink-0">
        <div className="mb-3">
          <h1 className="text-2xl sm:text-3xl font-black text-text-primary font-heading">Documenti</h1>
          {voce && <VoceSezione sezione={voce} />}
          <p className="text-xs text-text-secondary mt-0.5">
            {visibleMaterials.length} file · {visibleDocs.length} link Drive · {clients.length} clienti
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" aria-hidden="true" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Cerca per nome, cartella o cliente…"
              className="w-full bg-background border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-gold" />
          </div>
          <select value={filterClient ?? ''} onChange={e => setFilterClient(e.target.value || null)}
            aria-label="Filtra per cliente"
            className="bg-background border border-border rounded-lg px-3 py-2 text-xs text-text-primary">
            <option value="">Tutti i clienti</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
            <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} className="accent-gold" />
            Mostra archiviati
          </label>
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-error">{error}</p>}
        {busy && <p className="mt-3 text-sm text-text-secondary">{busy.name} · {busy.percent}%</p>}
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-2">
        {!rows.length ? (
          <div className="text-center py-16">
            <FolderOpen className="w-12 h-12 text-text-secondary mx-auto mb-4" aria-hidden="true" />
            <p className="text-text-secondary">Nessun file.</p>
            <p className="text-xs text-text-tertiary mt-1">
              Scegli un cliente qui sopra per caricare qualcosa nella sua area.
            </p>
          </div>
        ) : rows.map(row => (
          <div key={row.id} className="border border-border rounded-xl overflow-hidden bg-surface">
            <button onClick={() => toggle(openClients, row.id, setOpenClients)} aria-expanded={isOpen(row.id)}
              className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-surface-hover transition-colors text-left">
              {isOpen(row.id)
                ? <ChevronDown className="w-4 h-4 text-text-tertiary shrink-0" aria-hidden="true" />
                : <ChevronRight className="w-4 h-4 text-text-tertiary shrink-0" aria-hidden="true" />}
              <Users className="w-4 h-4 text-gold-text shrink-0" aria-hidden="true" />
              <span className="text-sm font-bold text-text-primary flex-1 truncate">{row.label}</span>
              <span className="text-2xs text-text-tertiary shrink-0">{row.cliente.length + row.nostri.length + row.drive.length}</span>
            </button>

            {isOpen(row.id) && <div className="border-t border-border px-4 py-3 space-y-5">
              {canWrite && row.id !== 'senza' && <UploadBar clientId={row.id} busy={!!busy} onFiles={upload} />}

              <Group title="Caricati dal cliente" hint="Quello che ci ha mandato dal suo portale."
                items={row.cliente} openFolders={openFolders}
                toggle={path => toggle(openFolders, path, setOpenFolders)}
                onAct={act} canRemove={canRemove} canWrite={canWrite} onPreview={setPreviewFile} />

              <Group title="Nostri" hint="Il cliente non li vede: la sua policy non gliene passa le righe."
                items={row.nostri} openFolders={openFolders}
                toggle={path => toggle(openFolders, path, setOpenFolders)}
                onAct={act} canRemove={canRemove} canWrite={canWrite} onPreview={setPreviewFile} />

              {row.drive.length > 0 && <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Link Drive</h3>
                <div className="mt-2 space-y-1">
                  {row.drive.map(doc => <DriveRow key={doc.id} doc={doc} onPreview={() => setPreview(doc)} />)}
                </div>
              </section>}
            </div>}
          </div>
        ))}
      </div>

      {previewFile && <MaterialPreview file={previewFile} onClose={() => setPreviewFile(null)} />}

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4"
          onClick={e => { if (e.target === e.currentTarget) setPreview(null) }}>
          <div className="w-full max-w-4xl">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-bold text-text-primary truncate">
                {preview.client?.company_name}<span className="text-text-tertiary"> / </span>{preview.name}
              </p>
              <button onClick={() => setPreview(null)} aria-label="Chiudi anteprima"
                className="text-text-secondary hover:text-text-primary"><X className="w-5 h-5" aria-hidden="true" /></button>
            </div>
            <DriveEmbed url={preview.file_url} title={preview.name} height={600} />
          </div>
        </div>
      )}
    </div>
  )
}

function UploadBar({ clientId, busy, onFiles }: {
  clientId: string; busy: boolean; onFiles: (clientId: string, files: FileList) => void
}) {
  const file = useRef<HTMLInputElement>(null)
  const folder = useRef<HTMLInputElement>(null)
  return <div className="flex flex-wrap items-center gap-2">
    <input ref={file} type="file" multiple className="sr-only" aria-label="Scegli i file da caricare"
      onChange={e => { if (e.target.files?.length) onFiles(clientId, e.target.files); e.target.value = '' }} />
    <input ref={folder} type="file" multiple className="sr-only" aria-label="Scegli una cartella da caricare"
      {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
      onChange={e => { if (e.target.files?.length) onFiles(clientId, e.target.files); e.target.value = '' }} />
    <button type="button" className={button} disabled={busy} onClick={() => file.current?.click()}>
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Upload className="w-3.5 h-3.5" aria-hidden="true" />}
      Carica file
    </button>
    <button type="button" className={button} disabled={busy} onClick={() => folder.current?.click()}>
      <FolderUp className="w-3.5 h-3.5" aria-hidden="true" />Carica cartella
    </button>
    <span className="text-2xs text-text-secondary">Quello che carichi qui il cliente non lo vede.</span>
  </div>
}

function Group({ title, hint, items, openFolders, toggle, onAct, canRemove, canWrite, onPreview }: {
  title: string; hint: string; items: DocMaterial[]
  openFolders: Set<string>; toggle: (path: string) => void
  onAct: (m: DocMaterial, azione: 'archivia' | 'ripristina' | 'elimina') => void
  canRemove: (m: DocMaterial) => boolean
  canWrite: boolean
  onPreview: (m: DocMaterial) => void
}) {
  const tree = useMemo(() => buildMaterialTree(items), [items])
  return <section>
    <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{title} <span className="font-normal normal-case text-text-tertiary">· {items.length}</span></h3>
    <p className="mt-0.5 text-2xs text-text-tertiary">{hint}</p>
    {!items.length ? <p className="mt-2 text-2xs text-text-tertiary">Niente qui.</p>
      : <div className="mt-2"><MaterialTree node={tree} depth={0} openFolders={openFolders} toggle={toggle} onAct={onAct} canRemove={canRemove} canWrite={canWrite} onPreview={onPreview} /></div>}
  </section>
}

function MaterialTree({ node, depth, openFolders, toggle, onAct, canRemove, canWrite, onPreview }: {
  node: MaterialFolder<DocMaterial>; depth: number
  openFolders: Set<string>; toggle: (path: string) => void
  onAct: (m: DocMaterial, azione: 'archivia' | 'ripristina' | 'elimina') => void
  canRemove: (m: DocMaterial) => boolean
  canWrite: boolean
  onPreview: (m: DocMaterial) => void
}) {
  return <ul className={depth ? 'ml-3 border-l border-border pl-3' : ''}>
    {node.folders.map(child => {
      const open = openFolders.has(child.path)
      const Chevron = open ? ChevronDown : ChevronRight
      return <li key={child.path}>
        <button type="button" onClick={() => toggle(child.path)} aria-expanded={open}
          className="flex min-h-10 w-full items-center gap-2 text-left text-sm hover:text-gold-text">
          <Chevron className="w-3.5 h-3.5 shrink-0 text-text-tertiary" aria-hidden="true" />
          <Folder className="w-3.5 h-3.5 shrink-0 text-gold-text" aria-hidden="true" />
          <span className="truncate">{child.name}</span>
          <span className="text-2xs text-text-tertiary">{countTree(child)}</span>
        </button>
        {open && <MaterialTree node={child} depth={depth + 1} openFolders={openFolders} toggle={toggle} onAct={onAct} canRemove={canRemove} canWrite={canWrite} onPreview={onPreview} />}
      </li>
    })}
    {node.files.map(m => (
      <li key={m.id} className="group flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-hover">
        {hasPreview(m.mime, m.name)
          ? <button type="button" onClick={() => onPreview(m)} aria-label={`Apri l’anteprima di ${m.name}`} className="rounded-md focus-visible:outline-none">
              <MaterialThumb file={m} size={40} fallback={<FileText className="w-3.5 h-3.5 text-text-tertiary" aria-hidden="true" />} />
            </button>
          : <MaterialThumb file={m} size={40} fallback={<FileText className="w-3.5 h-3.5 text-text-tertiary" aria-hidden="true" />} />}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-text-primary">{m.name}{m.archived_at ? ' · archiviato' : ''}</span>
          <span className="block text-2xs text-text-tertiary">{humanBytes(Number(m.size))} · {m.uploaded_by_name} · {formatDate(m.created_at)}</span>
        </span>
        {hasPreview(m.mime, m.name) && <button type="button" className={button} onClick={() => onPreview(m)}>
          <Eye className="w-3.5 h-3.5" aria-hidden="true" />Anteprima<span className="sr-only"> {m.name}</span></button>}
        <a href={materialDownloadHref(m.id)} className={button}>Scarica<span className="sr-only"> {m.name}</span></a>
        {canWrite && (m.archived_at
          ? <button type="button" className={button} onClick={() => onAct(m, 'ripristina')}>
              <ArchiveRestore className="w-3.5 h-3.5" aria-hidden="true" />Rimetti<span className="sr-only"> {m.name}</span></button>
          : <button type="button" className={button} onClick={() => onAct(m, 'archivia')}>
              <Archive className="w-3.5 h-3.5" aria-hidden="true" />Archivia<span className="sr-only"> {m.name}</span></button>)}
        {canWrite && canRemove(m) && <button type="button" className={button} onClick={() => onAct(m, 'elimina')}>
          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />Elimina<span className="sr-only"> {m.name}</span></button>}
      </li>
    ))}
  </ul>
}

function DriveRow({ doc, onPreview }: { doc: DocItem; onPreview: () => void }) {
  const drive = isDriveUrl(doc.file_url)
  const kind = drive ? driveKind(doc.file_url) : null
  return (
    <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-surface-hover transition-colors group">
      {drive && kind === 'folder'
        ? <Folder className="w-4 h-4 text-gold-text shrink-0" aria-hidden="true" />
        : <FileText className="w-4 h-4 text-info shrink-0" aria-hidden="true" />}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-text-primary truncate">{doc.name}</p>
        <p className="text-2xs text-text-tertiary">
          {drive && kind ? DRIVE_KIND_LABEL[kind] : 'File storico (non Drive)'} · {formatDate(doc.created_at)}
        </p>
      </div>
      {drive && <button onClick={onPreview} className="flex items-center gap-1 text-2xs text-text-secondary hover:text-gold-text shrink-0">
        <Eye className="w-3.5 h-3.5" aria-hidden="true" /> Anteprima
      </button>}
      <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-1 text-2xs text-text-secondary hover:text-gold-text shrink-0">
        <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />{drive ? 'Apri in Drive' : 'Apri'}
      </a>
    </div>
  )
}
