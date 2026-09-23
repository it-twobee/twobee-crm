'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Archive, ArchiveRestore, ChevronDown, ChevronRight, Eye, FileText, Folder,
  FolderUp, Loader2, Trash2, Upload,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'
import {
  buildMaterialTree, countTree, folderPathOf, humanBytes, materialDownloadHref, rejectMaterial,
} from '@/lib/portal/materials'
import type { MaterialFolder } from '@/lib/portal/materials'
import { MaterialPreview, hasPreview } from '@/components/shared/MaterialPreview'
import { MaterialThumb } from '@/components/shared/MaterialThumb'

/* §403 — L'area file di un cliente, vista da noi. È **una sola**, e sta in due
   posti: la scheda del cliente e la sezione Documenti. Lo stesso componente,
   perché la stessa domanda non può avere due risposte a seconda della pagina da
   cui ci si arriva.

   Lo spazio nostro c'è da subito, per ogni cliente: non dipende dal portale.
   Quello del cliente si accende quando gli si manda un invito — e finché non
   succede la pagina lo dice, invece di mostrare un riquadro vuoto senza motivo. */
export type ClientMaterial = {
  id: string; client_id: string; project_id: string | null; name: string; mime: string | null
  size: number; kind: string; path: string | null; source: 'cliente' | 'team'
  uploaded_by: string; uploaded_by_name: string; created_at: string; archived_at: string | null
}

const button = 'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-border-interactive bg-surface px-2.5 py-1.5 text-2xs text-text-primary hover:bg-surface-hover disabled:opacity-50'

export function ClientFileArea({
  clientId, materials, canWrite, canDeleteClientFiles, viewerId, portalActive, portalTabHref, onError, onChanged,
}: {
  clientId: string
  materials: ClientMaterial[]
  canWrite: boolean
  canDeleteClientFiles: boolean
  viewerId: string
  /** `undefined` = non lo sappiamo da qui, e non lo si racconta. */
  portalActive?: boolean
  portalTabHref?: string
  onError?: (message: string) => void
  /** Chi tiene i dati in memoria li ricarica qui: `router.refresh()` rilegge solo i componenti server. */
  onChanged?: () => void
}) {
  const router = useRouter()
  const changed = () => { if (onChanged) onChanged(); else router.refresh() }
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set())
  const [preview, setPreview] = useState<ClientMaterial | null>(null)
  const [busy, setBusy] = useState<{ name: string; percent: number } | null>(null)
  const [error, setError] = useState('')

  const fail = (message: string) => { setError(message); onError?.(message) }
  const cliente = useMemo(() => materials.filter(m => m.source === 'cliente'), [materials])
  const nostri = useMemo(() => materials.filter(m => m.source === 'team'), [materials])

  function send(file: File) {
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

  async function upload(files: FileList) {
    setError('')
    for (const file of Array.from(files)) {
      const rejected = rejectMaterial({ name: file.name, mime: file.type || null, size: file.size })
      if (rejected) { fail(rejected); continue }
      setBusy({ name: file.name, percent: 0 })
      try { await send(file) } catch (e) { fail(e instanceof Error ? e.message : 'Caricamento non riuscito.'); break }
      finally { setBusy(null) }
    }
    changed()
  }

  async function act(material: ClientMaterial, azione: 'archivia' | 'ripristina' | 'elimina') {
    setError('')
    if (azione === 'elimina' && !confirm(`Elimino «${material.name}»? I file non tornano indietro.`)) return
    const response = await fetch(`/api/area-cliente/file/${material.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ azione }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      fail(payload?.error ?? 'Operazione non riuscita.')
      return
    }
    changed()
  }

  const canRemove = (m: ClientMaterial) =>
    m.source === 'cliente' ? canDeleteClientFiles : (canDeleteClientFiles || m.uploaded_by === viewerId)

  return <div className="space-y-5">
    {canWrite && <UploadBar busy={!!busy} onFiles={upload} />}
    {busy && <div>
      <p className="text-2xs text-text-secondary">{busy.name} · {busy.percent}%</p>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-hover">
        <div className="h-full rounded-full bg-gold transition-[width]" style={{ width: `${busy.percent}%` }} />
      </div>
    </div>}
    {error && <p role="alert" className="text-sm text-error">{error}</p>}

    <Group title="Caricati dal cliente"
      hint={portalActive === false
        ? 'Nessuno ancora: il cliente non ha un accesso al portale.'
        : 'Quello che ci ha mandato dal suo portale.'}
      items={cliente} openFolders={openFolders} onToggle={setOpenFolders}
      onAct={act} canRemove={canRemove} canWrite={canWrite} onPreview={setPreview}
      empty={portalActive === false
        ? <>Lo spazio del cliente si accende quando gli mandi un invito{portalTabHref
            ? <> dalla scheda <Link href={portalTabHref} className="text-gold-text underline underline-offset-4">Portale cliente</Link></>
            : null}. Il tuo, qui sotto, funziona già.</>
        : 'Niente qui.'} />

    <Group title="Nostri" hint="Il cliente non li vede."
      items={nostri} openFolders={openFolders} onToggle={setOpenFolders}
      onAct={act} canRemove={canRemove} canWrite={canWrite} onPreview={setPreview}
      empty="Niente qui. Carica quello che serve al lavoro: resta fra noi." />

    {preview && <MaterialPreview file={preview} onClose={() => setPreview(null)} />}
  </div>
}

function UploadBar({ busy, onFiles }: { busy: boolean; onFiles: (files: FileList) => void }) {
  const file = useRef<HTMLInputElement>(null)
  const folder = useRef<HTMLInputElement>(null)
  return <div className="flex flex-wrap items-center gap-2">
    <input ref={file} type="file" multiple className="sr-only" aria-label="Scegli i file da caricare"
      onChange={e => { if (e.target.files?.length) onFiles(e.target.files); e.target.value = '' }} />
    <input ref={folder} type="file" multiple className="sr-only" aria-label="Scegli una cartella da caricare"
      {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
      onChange={e => { if (e.target.files?.length) onFiles(e.target.files); e.target.value = '' }} />
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

function Group({ title, hint, items, openFolders, onToggle, onAct, canRemove, canWrite, onPreview, empty }: {
  title: string; hint: string; items: ClientMaterial[]
  openFolders: Set<string>; onToggle: (next: Set<string>) => void
  onAct: (m: ClientMaterial, azione: 'archivia' | 'ripristina' | 'elimina') => void
  canRemove: (m: ClientMaterial) => boolean
  canWrite: boolean
  onPreview: (m: ClientMaterial) => void
  empty: React.ReactNode
}) {
  const tree = useMemo(() => buildMaterialTree(items), [items])
  const toggle = (path: string) => {
    const next = new Set(openFolders); next.has(path) ? next.delete(path) : next.add(path); onToggle(next)
  }
  return <section>
    <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
      {title} <span className="font-normal normal-case text-text-tertiary">· {items.length}</span>
    </h3>
    <p className="mt-0.5 text-2xs text-text-tertiary">{hint}</p>
    {!items.length ? <p className="mt-2 max-w-2xl text-2xs text-text-tertiary">{empty}</p>
      : <div className="mt-2"><Tree node={tree} depth={0} openFolders={openFolders} toggle={toggle}
          onAct={onAct} canRemove={canRemove} canWrite={canWrite} onPreview={onPreview} /></div>}
  </section>
}

function Tree({ node, depth, openFolders, toggle, onAct, canRemove, canWrite, onPreview }: {
  node: MaterialFolder<ClientMaterial>; depth: number
  openFolders: Set<string>; toggle: (path: string) => void
  onAct: (m: ClientMaterial, azione: 'archivia' | 'ripristina' | 'elimina') => void
  canRemove: (m: ClientMaterial) => boolean
  canWrite: boolean
  onPreview: (m: ClientMaterial) => void
}) {
  const icon = <FileText className="w-3.5 h-3.5 text-text-tertiary" aria-hidden="true" />
  return <ul className={depth ? 'ml-1 border-l border-border pl-2 sm:ml-3 sm:pl-3' : ''}>
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
        {open && <Tree node={child} depth={depth + 1} openFolders={openFolders} toggle={toggle}
          onAct={onAct} canRemove={canRemove} canWrite={canWrite} onPreview={onPreview} />}
      </li>
    })}
    {node.files.map(m => (
      <li key={m.id} className="flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-hover">
        {hasPreview(m.mime, m.name)
          ? <button type="button" onClick={() => onPreview(m)} aria-label={`Apri l’anteprima di ${m.name}`} className="rounded-md">
              <MaterialThumb file={m} size={40} fallback={icon} />
            </button>
          : <MaterialThumb file={m} size={40} fallback={icon} />}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-text-primary">{m.name}{m.archived_at ? ' · archiviato' : ''}</span>
          <span className="block text-2xs text-text-tertiary">
            {humanBytes(Number(m.size))} · {m.uploaded_by_name} · {formatDate(m.created_at)}
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-2">
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
        </span>
      </li>
    ))}
  </ul>
}
