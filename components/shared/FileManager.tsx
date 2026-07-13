'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { UploadCloud, Loader2, Trash2, Download, FileIcon, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { timeAgo } from '@/lib/utils'
import {
  humanSize,
  SENSITIVE_FOLDERS,
  type StorageFile,
  type StorageFolder,
} from '@/lib/storage/shared'

interface Props {
  /** Cartella logica di destinazione (prefisso su MinIO). */
  folder: StorageFolder
  /** Entità collegata (es. 'client') + id, per filtrare/raggruppare i file. */
  entityType?: string
  entityId?: string
  title?: string
  /** Filtro accept dell'input file (es. "image/*,application/pdf"). */
  accept?: string
}

// Uploader + lista file appoggiati allo storage interno (MinIO su VPS).
// Tutto passa dalle route /api/files/* : il browser non parla mai con MinIO.
export function FileManager({ folder, entityType, entityId, title, accept }: Props) {
  const [files, setFiles] = useState<StorageFile[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const sensitive = SENSITIVE_FOLDERS.includes(folder)

  const query = new URLSearchParams({ folder })
  if (entityType) query.set('entityType', entityType)
  if (entityId) query.set('entityId', entityId)
  const qs = query.toString()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/files?${qs}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Errore')
      setFiles(json.files ?? [])
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [qs])

  useEffect(() => { load() }, [load])

  const upload = async (file: File) => {
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('folder', folder)
    if (entityType) fd.append('entityType', entityType)
    if (entityId) fd.append('entityId', entityId)
    try {
      const res = await fetch('/api/files/upload', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Upload fallito')
      setFiles(prev => [json.file as StorageFile, ...prev])
      toast.success('File caricato')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) upload(f)
  }

  const remove = async (f: StorageFile) => {
    if (!confirm(`Eliminare "${f.name}"? L'operazione è definitiva.`)) return
    try {
      const res = await fetch(`/api/files/${f.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Eliminazione fallita')
      setFiles(prev => prev.filter(x => x.id !== f.id))
      toast.success('Eliminato')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
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
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 text-xs font-bold text-gold-text hover:text-gold-text disabled:opacity-50"
        >
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
          Carica file
        </button>
        <input ref={inputRef} type="file" accept={accept} onChange={onPick} className="hidden" />
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-text-secondary py-6 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Caricamento…
        </div>
      ) : files.length === 0 ? (
        <div className="text-center py-8 text-text-secondary border border-dashed border-border rounded-card">
          <FileIcon className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Nessun file. Carica il primo allegato.</p>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-card divide-y divide-border">
          {files.map(f => (
            <div key={f.id} className="flex items-center gap-3 px-4 py-2.5">
              <FileIcon className="w-4 h-4 text-text-tertiary shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-text-primary truncate" title={f.name}>{f.name}</p>
                <p className="text-2xs text-text-secondary">{humanSize(f.size)} · {timeAgo(f.created_at)}</p>
              </div>
              <a
                href={`/api/files/${f.id}/download`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1 text-text-secondary hover:text-gold-text transition-colors border border-border rounded"
                aria-label={`Scarica ${f.name}`}
              >
                <Download className="w-3.5 h-3.5" />
              </a>
              <button
                onClick={() => remove(f)}
                aria-label={`Elimina ${f.name}`}
                className="p-1 text-text-secondary hover:text-error transition-colors border border-border rounded"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
