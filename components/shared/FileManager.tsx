'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  UploadCloud, Loader2, Trash2, Download, FileIcon, Lock, Folder, FolderPlus,
  Share2, Eye, X, Copy, Check, ChevronRight, Home,
} from 'lucide-react'
import { toast } from 'sonner'
import { timeAgo } from '@/lib/utils'
import {
  humanSize, previewKind, SENSITIVE_FOLDERS,
  type StorageFile, type StorageFolder, type StorageFolderRow, type FileShare,
} from '@/lib/storage/shared'

interface Props {
  folder: StorageFolder
  entityType?: string
  entityId?: string
  title?: string
  accept?: string
}

interface Crumb { id: string; name: string }

export function FileManager({ folder, entityType, entityId, title, accept }: Props) {
  const [path, setPath] = useState<Crumb[]>([])
  const [folders, setFolders] = useState<StorageFolderRow[]>([])
  const [files, setFiles] = useState<StorageFile[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [preview, setPreview] = useState<StorageFile | null>(null)
  const [shareFor, setShareFor] = useState<StorageFile | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const currentFolderId = path.length ? path[path.length - 1].id : null
  const sensitive = SENSITIVE_FOLDERS.includes(folder)

  const ctxParams = useCallback((extra: Record<string, string | null>) => {
    const q = new URLSearchParams({ folder })
    if (entityType) q.set('entityType', entityType)
    if (entityId) q.set('entityId', entityId)
    for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v)
    return q.toString()
  }, [folder, entityType, entityId])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [fr, dr] = await Promise.all([
        fetch(`/api/files?${ctxParams({ folderId: currentFolderId })}`),
        fetch(`/api/files/folders?${ctxParams({ parentId: currentFolderId })}`),
      ])
      const fj = await fr.json(); const dj = await dr.json()
      if (!fr.ok) throw new Error(fj.error || 'Errore file')
      if (!dr.ok) throw new Error(dj.error || 'Errore cartelle')
      setFiles(fj.files ?? [])
      setFolders(dj.folders ?? [])
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [ctxParams, currentFolderId])

  useEffect(() => { load() }, [load])

  const uploadFiles = async (list: FileList | File[]) => {
    const arr = Array.from(list)
    if (!arr.length) return
    setUploading(true)
    let ok = 0
    const results = await Promise.allSettled(arr.map(async (file) => {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('folder', folder)
      if (entityType) fd.append('entityType', entityType)
      if (entityId) fd.append('entityId', entityId)
      if (currentFolderId) fd.append('folderId', currentFolderId)
      const res = await fetch('/api/files/upload', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `Upload fallito: ${file.name}`)
      return json.file as StorageFile
    }))
    const uploaded: StorageFile[] = []
    for (const r of results) {
      if (r.status === 'fulfilled') { uploaded.push(r.value); ok++ }
      else toast.error((r.reason as Error).message)
    }
    if (uploaded.length) setFiles(prev => [...uploaded, ...prev])
    if (ok) toast.success(ok === 1 ? 'File caricato' : `${ok} file caricati`)
    setUploading(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    if (e.dataTransfer.files?.length) uploadFiles(e.dataTransfer.files)
  }

  const createFolder = async () => {
    const name = prompt('Nome della nuova cartella')?.trim()
    if (!name) return
    try {
      const res = await fetch('/api/files/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, folder, entityType, entityId, parentId: currentFolderId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Errore')
      setFolders(prev => [...prev, json.folder as StorageFolderRow].sort((a, b) => a.name.localeCompare(b.name)))
      toast.success('Cartella creata')
    } catch (e) { toast.error((e as Error).message) }
  }

  const deleteFolder = async (f: StorageFolderRow) => {
    if (!confirm(`Eliminare la cartella "${f.name}" con tutto il suo contenuto? Operazione definitiva.`)) return
    try {
      const res = await fetch(`/api/files/folders/${f.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Errore')
      setFolders(prev => prev.filter(x => x.id !== f.id))
      toast.success('Cartella eliminata')
    } catch (e) { toast.error((e as Error).message) }
  }

  const deleteFile = async (f: StorageFile) => {
    if (!confirm(`Eliminare "${f.name}"? Operazione definitiva.`)) return
    try {
      const res = await fetch(`/api/files/${f.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Errore')
      setFiles(prev => prev.filter(x => x.id !== f.id))
      toast.success('Eliminato')
    } catch (e) { toast.error((e as Error).message) }
  }

  return (
    <div className="space-y-3">
      {/* Header + azioni */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 text-text-secondary">
          <UploadCloud className="w-4 h-4 text-gold-text" />
          <span className="text-sm font-semibold text-text-primary">{title ?? 'Allegati interni'}</span>
          <span className="text-xs text-text-secondary">storage VPS · non visibile al cliente</span>
          {sensitive && (
            <span className="flex items-center gap-1 text-2xs text-amber-400" title="Cartella sensibile: solo tu e gli admin">
              <Lock className="w-3 h-3" /> sensibile
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={createFolder} className="flex items-center gap-1.5 text-xs font-bold text-text-secondary hover:text-gold-text">
            <FolderPlus className="w-3.5 h-3.5" /> Nuova cartella
          </button>
          <button onClick={() => inputRef.current?.click()} disabled={uploading}
            className="flex items-center gap-1.5 text-xs font-bold text-gold-text hover:text-gold-text disabled:opacity-50">
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
            Carica file
          </button>
          <input ref={inputRef} type="file" multiple accept={accept}
            onChange={e => e.target.files && uploadFiles(e.target.files)} className="hidden" />
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-xs text-text-secondary flex-wrap">
        <button onClick={() => setPath([])} className="flex items-center gap-1 hover:text-gold-text">
          <Home className="w-3.5 h-3.5" /> Radice
        </button>
        {path.map((c, i) => (
          <span key={c.id} className="flex items-center gap-1">
            <ChevronRight className="w-3 h-3 opacity-50" />
            <button onClick={() => setPath(path.slice(0, i + 1))}
              className={i === path.length - 1 ? 'text-text-primary font-semibold' : 'hover:text-gold-text'}>
              {c.name}
            </button>
          </span>
        ))}
      </div>

      {/* Dropzone / contenuto */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`rounded-card border transition-colors ${dragOver ? 'border-gold bg-gold/5' : 'border-border'} p-3`}
      >
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-text-secondary py-6 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Caricamento…
          </div>
        ) : folders.length === 0 && files.length === 0 ? (
          <div className="text-center py-8 text-text-secondary">
            <FileIcon className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Trascina qui i file o usa “Carica file”. Puoi creare cartelle.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Cartelle */}
            {folders.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {folders.map(fold => (
                  <div key={fold.id}
                    className="group flex items-center gap-2 bg-surface border border-border rounded-lg px-3 py-2 hover:border-gold/30">
                    <button onClick={() => setPath([...path, { id: fold.id, name: fold.name }])}
                      className="flex items-center gap-2 min-w-0 flex-1 text-left">
                      <Folder className="w-4 h-4 text-gold-text shrink-0" />
                      <span className="text-sm text-text-primary truncate" title={fold.name}>{fold.name}</span>
                    </button>
                    <button onClick={() => deleteFolder(fold)} aria-label="Elimina cartella"
                      className="opacity-0 group-hover:opacity-100 text-text-tertiary hover:text-error transition-opacity">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* File */}
            {files.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {files.map(f => (
                  <div key={f.id} className="bg-surface border border-border rounded-card overflow-hidden group hover:border-gold/30 transition-colors">
                    <button onClick={() => setPreview(f)} className="block w-full h-28 bg-background overflow-hidden">
                      {previewKind(f.mime, f.name) === 'image' ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/api/files/${f.id}/download`} alt={f.name} loading="lazy"
                          className="w-full h-full object-cover" />
                      ) : (
                        <span className="flex items-center justify-center h-full">
                          <FileIcon className="w-9 h-9 text-text-tertiary" />
                        </span>
                      )}
                    </button>
                    <div className="p-2.5">
                      <p className="text-xs font-semibold text-text-primary truncate" title={f.name}>{f.name}</p>
                      <p className="text-2xs text-text-secondary mb-2">{humanSize(f.size)} · {timeAgo(f.created_at)}</p>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => setPreview(f)} title="Anteprima"
                          className="p-1 text-text-secondary hover:text-gold-text border border-border rounded"><Eye className="w-3.5 h-3.5" /></button>
                        <a href={`/api/files/${f.id}/download`} target="_blank" rel="noopener noreferrer" title="Scarica"
                          className="p-1 text-text-secondary hover:text-gold-text border border-border rounded"><Download className="w-3.5 h-3.5" /></a>
                        <button onClick={() => setShareFor(f)} title="Condividi"
                          className="p-1 text-text-secondary hover:text-gold-text border border-border rounded"><Share2 className="w-3.5 h-3.5" /></button>
                        <button onClick={() => deleteFile(f)} title="Elimina"
                          className="p-1 text-text-secondary hover:text-error border border-border rounded ml-auto"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {preview && <PreviewModal file={preview} onClose={() => setPreview(null)} />}
      {shareFor && <ShareModal file={shareFor} sensitive={sensitive} onClose={() => setShareFor(null)} />}
    </div>
  )
}

// ── Anteprima ──────────────────────────────────────────────────────────────
function PreviewModal({ file, onClose }: { file: StorageFile; onClose: () => void }) {
  const kind = previewKind(file.mime, file.name)
  const src = `/api/files/${file.id}/download`
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-4xl">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-bold text-text-primary truncate">{file.name}</p>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary"><X className="w-5 h-5" /></button>
        </div>
        <div className="bg-surface border border-border rounded-card overflow-hidden flex items-center justify-center" style={{ maxHeight: '75vh' }}>
          {kind === 'image' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt={file.name} className="max-h-[75vh] w-auto object-contain" />
          ) : kind === 'pdf' ? (
            <iframe src={src} title={file.name} className="w-full" style={{ height: '75vh' }} />
          ) : kind === 'video' ? (
            <video src={src} controls className="max-h-[75vh] w-full" />
          ) : kind === 'audio' ? (
            <audio src={src} controls className="w-full m-6" />
          ) : (
            <div className="text-center py-16 text-text-secondary">
              <FileIcon className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm mb-3">Anteprima non disponibile per questo tipo di file.</p>
              <a href={src} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-gold text-on-gold font-bold rounded-lg text-sm">
                <Download className="w-4 h-4" /> Scarica
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Condivisione esterna ─────────────────────────────────────────────────────
const EXPIRY_OPTS = [
  { v: '24h', label: '24 ore' },
  { v: '7d', label: '7 giorni' },
  { v: '30d', label: '30 giorni' },
  { v: 'never', label: 'Mai' },
]

function ShareModal({ file, sensitive, onClose }: { file: StorageFile; sensitive: boolean; onClose: () => void }) {
  const [share, setShare] = useState<(FileShare & { url: string }) | null>(null)
  const [expiresIn, setExpiresIn] = useState('7d')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/files/${file.id}/share`)
        const json = await res.json()
        if (res.ok && json.share) setShare(json.share)
      } finally { setLoading(false) }
    })()
  }, [file.id])

  const createOrRenew = async () => {
    setBusy(true)
    try {
      const res = await fetch(`/api/files/${file.id}/share`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresIn }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Errore')
      setShare(json.share)
      toast.success('Link di condivisione pronto')
    } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }

  const revoke = async () => {
    setBusy(true)
    try {
      const res = await fetch(`/api/files/${file.id}/share`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Errore')
      setShare(null)
      toast.success('Link revocato')
    } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }

  const copy = async () => {
    if (!share) return
    try { await navigator.clipboard.writeText(share.url); setCopied(true); setTimeout(() => setCopied(false), 1500) }
    catch { toast.error('Copia non riuscita') }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-lg bg-surface border border-border rounded-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-text-primary flex items-center gap-2"><Share2 className="w-4 h-4 text-gold-text" /> Condividi “{file.name}”</p>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary"><X className="w-5 h-5" /></button>
        </div>

        <p className="text-xs text-text-secondary">
          Chi ha il link può aprire il file <b>senza login</b>, anche fuori dal progetto. Il link è unico e non indovinabile; puoi revocarlo quando vuoi.
        </p>
        {sensitive && (
          <p className="text-xs text-amber-400 flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> File in cartella sensibile: condividilo solo se davvero necessario.</p>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-text-secondary py-4 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> …</div>
        ) : share ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <input readOnly value={share.url}
                className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-xs text-text-primary" />
              <button onClick={copy} className="flex items-center gap-1.5 px-3 py-2 bg-gold text-on-gold font-bold rounded-lg text-xs">
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copied ? 'Copiato' : 'Copia'}
              </button>
            </div>
            <p className="text-2xs text-text-secondary">
              {share.expires_at ? `Scade il ${new Date(share.expires_at).toLocaleString('it-IT')}` : 'Nessuna scadenza'}
            </p>
            <div className="flex items-center gap-2">
              <button onClick={revoke} disabled={busy}
                className="text-xs font-bold text-error hover:underline disabled:opacity-50">Revoca link</button>
              <span className="text-text-tertiary text-xs">·</span>
              <button onClick={createOrRenew} disabled={busy}
                className="text-xs font-bold text-text-secondary hover:text-gold-text disabled:opacity-50">Rigenera</button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <select value={expiresIn} onChange={e => setExpiresIn(e.target.value)}
              className="bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary">
              {EXPIRY_OPTS.map(o => <option key={o.v} value={o.v}>Scadenza: {o.label}</option>)}
            </select>
            <button onClick={createOrRenew} disabled={busy}
              className="flex items-center gap-2 px-4 py-2 bg-gold text-on-gold font-bold rounded-lg text-sm disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />} Crea link
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
