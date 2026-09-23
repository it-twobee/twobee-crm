'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronRight, Download, Eye, FileAudio, FileText, FileVideo, Folder, FolderUp, Image as ImageIcon, Loader2, Trash2, Upload } from 'lucide-react'
import { MaterialPreview, hasPreview } from '@/components/shared/MaterialPreview'
import { MaterialThumb } from '@/components/shared/MaterialThumb'
import {
  MATERIAL_MAX_BYTES, MATERIAL_QUOTA_BYTES, buildMaterialTree, countTree, folderPathOf,
  humanBytes, materialDownloadHref, quotaLeft, quotaWarning, rejectMaterial,
} from '@/lib/portal/materials'
import type { MaterialFolder } from '@/lib/portal/materials'
import { portalDate } from '@/lib/portal/model'
import type { PortalMaterial } from '@/lib/portal/model'

const button = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border-interactive bg-surface px-3 py-2 text-sm text-text-primary hover:bg-surface-hover disabled:opacity-50'
const ICONS: Record<string, typeof FileText> = { immagine: ImageIcon, video: FileVideo, audio: FileAudio, documento: FileText }

export type UploaderProject = { id: string; title: string }

export function MaterialUploader({ clientId, projects, materials, canWrite, usedBytes, viewerName, showQuota }: {
  clientId: string
  projects: UploaderProject[]
  materials: PortalMaterial[]
  canWrite: boolean
  usedBytes: number
  viewerName: string
  /** Falso con l'accesso limitato ad alcuni progetti: il totale non si vede. */
  showQuota: boolean
}) {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [preview, setPreview] = useState<PortalMaterial | null>(null)
  const [project, setProject] = useState('')
  const [busy, setBusy] = useState<{ name: string; percent: number } | null>(null)
  const [error, setError] = useState('')

  const left = quotaLeft(usedBytes)
  const warning = quotaWarning(usedBytes)
  const tree = useMemo(() => buildMaterialTree(materials), [materials])

  /* XHR e non fetch: su un video da mezzo giga la barra di avanzamento è la
     differenza fra «sta caricando» e «si è piantato». */
  function send(file: File) {
    return new Promise<void>((resolve, reject) => {
      const params = new URLSearchParams({ client: clientId })
      if (project) params.set('progetto', project)
      // Caricando una cartella il browser dà a ogni file il suo percorso: è
      // quello che ricostruisce l'albero, senza cartelle da creare a mano.
      const folder = folderPathOf((file as File & { webkitRelativePath?: string }).webkitRelativePath)
      if (folder) params.set('percorso', folder)
      const request = new XMLHttpRequest()
      request.open('POST', `/api/portale/materiali?${params}`)
      request.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
      request.setRequestHeader('x-file-name', encodeURIComponent(file.name).replace(/%20/g, ' '))
      request.setRequestHeader('x-idempotency-key', crypto.randomUUID())
      request.upload.onprogress = event => {
        if (event.lengthComputable) setBusy({ name: file.name, percent: Math.round((event.loaded / event.total) * 100) })
      }
      request.onload = () => {
        if (request.status >= 200 && request.status < 300) return resolve()
        let message = 'Caricamento non riuscito. Riprova.'
        try { message = JSON.parse(request.responseText)?.error ?? message } catch { /* risposta non JSON */ }
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
      if (rejected) { setError(rejected); continue }
      if (showQuota && file.size > left) { setError(`Nello spazio dell’azienda restano ${humanBytes(left)}.`); continue }
      setBusy({ name: file.name, percent: 0 })
      try { await send(file) } catch (e) { setError(e instanceof Error ? e.message : 'Caricamento non riuscito.'); break }
      finally { setBusy(null) }
    }
    router.refresh()
  }

  async function remove(material: PortalMaterial) {
    setError('')
    const response = await fetch(`/api/portale/materiali/${material.id}?client=${clientId}`, { method: 'DELETE' })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      setError(payload?.error ?? 'Non è stato possibile rimuovere il file.')
      return
    }
    router.refresh()
  }

  return <div className="space-y-8">
    {canWrite ? <section aria-labelledby="carica" className="rounded-xl border border-border bg-surface p-5">
      <h2 id="carica" className="font-heading text-xl font-semibold">Carica un file</h2>
      <p className="mt-1 text-sm text-text-secondary">
        Immagini, video, audio e documenti, fino a {humanBytes(MATERIAL_MAX_BYTES)} l’uno. Puoi caricare anche una cartella intera: la ritrovi qui com’era.
        I file restano privati fra te e il team: nessun link pubblico.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {projects.length > 0 && <label className="text-sm">
          <span className="mr-2 text-text-secondary">Riguarda</span>
          <select value={project} onChange={e => setProject(e.target.value)} disabled={!!busy}
            className="min-h-11 rounded-lg border border-border-interactive bg-background px-3 py-2 text-sm">
            <option value="">Nessun progetto</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </label>}
        <input ref={input} type="file" multiple className="sr-only" aria-label="Scegli i file da caricare"
          onChange={e => { if (e.target.files?.length) upload(e.target.files); e.target.value = '' }} />
        {/* Caricare una cartella intera: il browser consegna ogni file con il
            suo percorso relativo, e l'albero si ricostruisce da quello. */}
        <input ref={folderInput} type="file" multiple className="sr-only" aria-label="Scegli una cartella da caricare"
          {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
          onChange={e => { if (e.target.files?.length) upload(e.target.files); e.target.value = '' }} />
        <button type="button" className={button} disabled={!!busy} onClick={() => input.current?.click()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}
          {busy ? 'Caricamento in corso…' : 'Scegli i file'}
        </button>
        <button type="button" className={button} disabled={!!busy} onClick={() => folderInput.current?.click()}>
          <FolderUp className="h-4 w-4" aria-hidden="true" />Carica una cartella
        </button>
      </div>
      {busy && <div className="mt-4">
        <p className="text-sm">{busy.name} · {busy.percent}%</p>
        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-surface-hover">
          <div className="h-full rounded-full bg-gold transition-[width]" style={{ width: `${busy.percent}%` }} />
        </div>
      </div>}
      {error && <p role="alert" className="mt-4 text-sm text-error">{error}</p>}
      {showQuota && <p className="mt-4 text-2xs text-text-secondary">
        Spazio usato: {humanBytes(usedBytes)} su {humanBytes(MATERIAL_QUOTA_BYTES)}.{warning ? ` ${warning}` : ''}
      </p>}
    </section> : <p className="rounded-lg bg-surface px-4 py-3 text-sm text-text-secondary">
      Il tuo accesso è in sola lettura: puoi scaricare i file, ma non caricarne. Chiedi al tuo referente di abilitarti.
    </p>}

    {!materials.length ? <div className="rounded-xl border border-dashed border-border-strong px-5 py-7">
      <h3 className="text-base font-medium">Non c’è ancora niente qui.</h3>
      <p className="mt-2 max-w-2xl text-sm text-text-secondary">
        Questo è lo spazio della tua azienda: quello che carichi resta disponibile a te, ai tuoi colleghi con accesso al portale e al team TwoBee.
      </p>
    </div> : <section aria-label="I tuoi file">
      <FolderView node={tree} depth={0} open={open} toggle={path => setOpen(p => {
        const next = new Set(p); next.has(path) ? next.delete(path) : next.add(path); return next
      })} projects={projects} canWrite={canWrite} viewerName={viewerName} onRemove={remove} onPreview={setPreview} />
    </section>}
    {preview && <MaterialPreview file={preview} onClose={() => setPreview(null)} />}
  </div>
}

function FolderView({ node, depth, open, toggle, projects, canWrite, viewerName, onRemove, onPreview }: {
  node: MaterialFolder<PortalMaterial>
  depth: number
  open: Set<string>
  toggle: (path: string) => void
  projects: UploaderProject[]
  canWrite: boolean
  viewerName: string
  onRemove: (material: PortalMaterial) => void
  onPreview: (material: PortalMaterial) => void
}) {
  return <ul className={depth ? 'ml-1 border-l border-border pl-2 sm:ml-4 sm:pl-3' : 'divide-y divide-border border-y border-border'}>
    {node.folders.map(child => {
      const expanded = open.has(child.path)
      const Chevron = expanded ? ChevronDown : ChevronRight
      return <li key={child.path} className="py-1">
        <button type="button" onClick={() => toggle(child.path)} aria-expanded={expanded}
          className="flex min-h-11 w-full items-center gap-2 text-left text-sm font-medium hover:text-gold-text">
          <Chevron className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
          <Folder className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
          <span className="break-words">{child.name}</span>
          <span className="text-2xs font-normal text-text-secondary">{countTree(child)}</span>
        </button>
        {expanded && <FolderView node={child} depth={depth + 1} open={open} toggle={toggle}
          projects={projects} canWrite={canWrite} viewerName={viewerName} onRemove={onRemove} onPreview={onPreview} />}
      </li>
    })}
    {node.files.map(m => {
      const Icon = ICONS[m.kind] ?? FileText
      const mine = m.uploaded_by_name === viewerName
      const project = m.project_id ? projects.find(p => p.id === m.project_id)?.title : null
      return <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
        <span className="flex min-w-0 flex-1 items-center gap-3">
          {hasPreview(m.mime, m.name, Number(m.size))
            ? <button type="button" onClick={() => onPreview(m)} aria-label={`Apri l’anteprima di ${m.name}`} className="rounded-md">
                <MaterialThumb file={m} size={44} fallback={<Icon className="h-5 w-5 text-text-secondary" aria-hidden="true" />} />
              </button>
            : <MaterialThumb file={m} size={44} fallback={<Icon className="h-5 w-5 text-text-secondary" aria-hidden="true" />} />}
          <span className="min-w-0">
            <span className="block break-words text-sm font-medium">{m.name}</span>
            <span className="block text-2xs text-text-secondary">
              {humanBytes(Number(m.size))} · {m.uploaded_by_name} · {portalDate(m.created_at)}{project ? ` · ${project}` : ''}
            </span>
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-2">
          {hasPreview(m.mime, m.name, Number(m.size)) && <button type="button" className={button} onClick={() => onPreview(m)}>
            <Eye className="h-4 w-4" aria-hidden="true" />Anteprima<span className="sr-only"> {m.name}</span></button>}
          <a href={materialDownloadHref(m.id)} className={button}><Download className="h-4 w-4" aria-hidden="true" />Scarica<span className="sr-only"> {m.name}</span></a>
          {canWrite && mine && <button type="button" className={button} onClick={() => onRemove(m)}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />Rimuovi<span className="sr-only"> {m.name}</span>
          </button>}
        </span>
      </li>
    })}
  </ul>
}
