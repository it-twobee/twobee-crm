'use client'

import { useState, useRef } from 'react'
import { Upload, FileText, FileImage, File, Download, Trash2, Loader2, FolderOpen, Plus, X, Eye, Link2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { timeAgo } from '@/lib/utils'
import { isDriveUrl, driveKind } from '@/lib/drive'
import { DriveEmbed } from '@/components/shared/DriveEmbed'
import type { Document, Client } from '@/lib/types/database'

interface Props {
  client: Client
  documents: Document[]
}

const FILE_TYPES = ['tutti', 'contratto', 'report', 'creatività', 'altro']

const fileIcon = (type: string | null, name: string) => {
  const ext = name.split('.').pop()?.toLowerCase()
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext ?? '')) return <FileImage className="w-8 h-8 text-blue-400" />
  if (['pdf'].includes(ext ?? '')) return <FileText className="w-8 h-8 text-error" />
  return <File className="w-8 h-8 text-text-secondary" />
}

const typeLabel: Record<string, string> = {
  contratto: 'Contratto',
  report: 'Report',
  'creatività': 'Creatività',
  altro: 'Altro',
}

export function DocumentsTab({ client, documents: initialDocs }: Props) {
  const [docs, setDocs] = useState(initialDocs)
  const [filter, setFilter] = useState('tutti')
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [fileType, setFileType] = useState('altro')
  const inputRef = useRef<HTMLInputElement>(null)

  const [showDrive, setShowDrive] = useState(false)
  const [driveUrl, setDriveUrl]   = useState('')
  const [driveName, setDriveName] = useState('')
  const [driveCat, setDriveCat]   = useState('altro')
  const [savingDrive, setSavingDrive] = useState(false)
  const [preview, setPreview]     = useState<Document | null>(null)

  const driveFolders = docs.filter((d) => driveKind(d.file_url) === 'folder')

  const addDriveLink = async () => {
    if (!isDriveUrl(driveUrl)) { toast.error('Inserisci un link Google Drive valido'); return }
    setSavingDrive(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data: doc, error } = await supabase.from('documents').insert({
      client_id: client.id,
      name: driveName.trim() || 'File Google Drive',
      file_url: driveUrl.trim(),
      file_type: driveCat,
      uploaded_by: user?.id ?? null,
    }).select().single()
    setSavingDrive(false)
    if (error) { toast.error('Errore salvataggio'); return }
    setDocs((prev) => [doc as Document, ...prev])
    setDriveUrl(''); setDriveName(''); setShowDrive(false)
    toast.success('Link Google Drive aggiunto')
  }

  const filtered = filter === 'tutti' ? docs : docs.filter((d) => d.file_type === filter)

  const uploadFile = async (file: File) => {
    if (!file) return
    setUploading(true)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { toast.error('Non autenticato'); setUploading(false); return }

    const ext = file.name.split('.').pop()
    const path = `${client.id}/${Date.now()}-${file.name}`

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(path, file, { upsert: false })

    if (uploadError) {
      toast.error('Errore upload: ' + uploadError.message)
      setUploading(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(path)

    const { data: doc, error: dbError } = await supabase.from('documents').insert({
      client_id: client.id,
      name: file.name,
      file_url: publicUrl,
      file_type: fileType,
      uploaded_by: user.id,
    }).select().single()

    setUploading(false)

    if (dbError) { toast.error('Errore salvataggio'); return }
    toast.success(`"${file.name}" caricato!`)
    setDocs((prev) => [doc as Document, ...prev])
  }

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return
    Array.from(files).forEach(uploadFile)
  }

  const deleteDoc = async (doc: Document) => {
    if (!confirm(`Eliminare "${doc.name}"?`)) return
    const supabase = createClient()

    const path = doc.file_url.split('/documents/')[1]
    if (path) await supabase.storage.from('documents').remove([path])
    await supabase.from('documents').delete().eq('id', doc.id)

    setDocs((prev) => prev.filter((d) => d.id !== doc.id))
    toast.success('File eliminato')
  }

  return (
    <div className="space-y-5">
      {/* Upload area */}
      <div
        className={`border-2 border-dashed rounded-card p-8 text-center transition-colors ${
          dragOver ? 'border-gold bg-gold/5' : 'border-border hover:border-gold/40'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
      >
        <Upload className="w-8 h-8 text-text-secondary mx-auto mb-3" />
        <p className="text-sm text-text-primary font-semibold mb-1">Trascina i file qui</p>
        <p className="text-xs text-text-secondary mb-4">oppure</p>

        <div className="flex items-center justify-center gap-3 flex-wrap">
          <select
            value={fileType}
            onChange={(e) => setFileType(e.target.value)}
            className="bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold"
          >
            <option value="contratto">Contratto</option>
            <option value="report">Report</option>
            <option value="creatività">Creatività</option>
            <option value="altro">Altro</option>
          </select>
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2 bg-gold text-black font-bold rounded-lg hover:bg-yellow-400 transition-colors disabled:opacity-50 text-sm"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? 'Caricamento...' : 'Seleziona File'}
          </button>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {/* Google Drive */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-text-secondary">
            <FolderOpen className="w-4 h-4 text-gold" />
            <span className="text-sm font-semibold text-text-primary">Google Drive</span>
            <span className="text-xs text-text-secondary">storage principale · visibile al cliente nel portale</span>
          </div>
          <button onClick={() => setShowDrive((s) => !s)}
            className="flex items-center gap-1.5 text-xs font-bold text-gold hover:text-yellow-400">
            <Plus className="w-3.5 h-3.5" /> Aggiungi link Drive
          </button>
        </div>

        {showDrive && (
          <div className="bg-surface border border-border rounded-card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Link2 className="w-4 h-4 text-text-secondary shrink-0" />
              <input value={driveUrl} onChange={(e) => setDriveUrl(e.target.value)}
                placeholder="Incolla link a cartella o file Google Drive"
                className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:border-gold" />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <input value={driveName} onChange={(e) => setDriveName(e.target.value)}
                placeholder="Nome (es. Cartella materiali)"
                className="flex-1 min-w-[180px] bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:border-gold" />
              <select value={driveCat} onChange={(e) => setDriveCat(e.target.value)}
                className="bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold">
                <option value="contratto">Contratto</option>
                <option value="report">Report</option>
                <option value="creatività">Creatività</option>
                <option value="altro">Altro</option>
              </select>
              <button onClick={addDriveLink} disabled={savingDrive || !driveUrl.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-gold text-black font-bold rounded-lg hover:bg-yellow-400 transition-colors disabled:opacity-50 text-sm">
                {savingDrive ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Aggiungi
              </button>
            </div>
          </div>
        )}

        {driveFolders.map((d) => (
          <DriveEmbed key={d.id} url={d.file_url} title={d.name} height={420} />
        ))}
      </div>

      {/* Filtri */}
      <div className="flex gap-2">
        {FILE_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`text-sm px-3 py-1.5 rounded-lg transition-colors capitalize ${
              filter === t ? 'bg-gold text-black font-bold' : 'bg-surface border border-border text-text-secondary hover:text-text-primary'
            }`}
          >
            {t === 'tutti' ? `Tutti (${docs.length})` : `${t} (${docs.filter((d) => d.file_type === t).length})`}
          </button>
        ))}
      </div>

      {/* Grid documenti */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-text-secondary">
          <FolderOpen className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Nessun documento trovato</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.filter((d) => driveKind(d.file_url) !== 'folder').map((doc) => {
            const isDrive = isDriveUrl(doc.file_url)
            return (
            <div
              key={doc.id}
              className="bg-surface border border-border rounded-card p-4 hover:border-gold/30 transition-colors group"
            >
              <div className="flex items-center justify-center mb-3">
                {isDrive ? <FolderOpen className="w-8 h-8 text-gold" /> : fileIcon(doc.file_type, doc.name)}
              </div>
              <p className="text-xs font-semibold text-text-primary truncate mb-1" title={doc.name}>
                {doc.name}
              </p>
              <p className="text-xs text-text-secondary mb-3">
                {isDrive ? 'Google Drive' : (typeLabel[doc.file_type ?? 'altro'] ?? doc.file_type)} · {timeAgo(doc.created_at)}
              </p>
              <div className="flex gap-2">
                {isDrive ? (
                  <button
                    onClick={() => setPreview(doc)}
                    className="flex-1 flex items-center justify-center gap-1 text-xs text-text-secondary hover:text-gold transition-colors border border-border rounded py-1"
                  >
                    <Eye className="w-3 h-3" /> Anteprima
                  </button>
                ) : (
                  <a
                    href={doc.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-1 text-xs text-text-secondary hover:text-gold transition-colors border border-border rounded py-1"
                  >
                    <Download className="w-3 h-3" /> Apri
                  </a>
                )}
                <button
                  onClick={() => deleteDoc(doc)}
                  className="p-1 text-text-secondary hover:text-error transition-colors border border-border rounded"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
            )
          })}
        </div>
      )}

      {/* Modal anteprima Drive */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setPreview(null) }}>
          <div className="w-full max-w-4xl">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-bold text-text-primary truncate">{preview.name}</p>
              <button onClick={() => setPreview(null)} className="text-text-secondary hover:text-text-primary">
                <X className="w-5 h-5" />
              </button>
            </div>
            <DriveEmbed url={preview.file_url} title={preview.name} height={600} />
          </div>
        </div>
      )}
    </div>
  )
}
