'use client'

import { useState } from 'react'
import { FolderOpen, Trash2, Loader2, Plus, X, Eye, Link2, ExternalLink } from 'lucide-react'
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

// §23 / Fase 5 (D9, D10): la sezione Documenti gestisce ESCLUSIVAMENTE link Google
// Drive (cartella cliente + sottocartelle/file). Niente upload su storage: i file
// stanno su Drive, qui salviamo solo il riferimento. L'anteprima è l'embed folder
// view di Drive (nessuna Drive API). L'upload resta solo per HR/documenti personali.

const CATEGORIES = ['tutti', 'contratto', 'report', 'creatività', 'altro'] as const

const typeLabel: Record<string, string> = {
  contratto: 'Contratto',
  report: 'Report',
  'creatività': 'Creatività',
  altro: 'Altro',
}

export function DocumentsTab({ client, documents: initialDocs }: Props) {
  const [docs, setDocs] = useState(initialDocs)
  const [filter, setFilter] = useState<string>('tutti')

  const [showDrive, setShowDrive] = useState(false)
  const [driveUrl, setDriveUrl]   = useState('')
  const [driveName, setDriveName] = useState('')
  const [driveCat, setDriveCat]   = useState('altro')
  const [savingDrive, setSavingDrive] = useState(false)
  const [preview, setPreview]     = useState<Document | null>(null)

  // Solo riferimenti Drive: gli eventuali documenti legacy su storage restano
  // visibili in sola apertura finché non vengono ripuliti (D10), ma non se ne
  // aggiungono più di nuovi da qui.
  const driveDocs = docs.filter(d => isDriveUrl(d.file_url))
  const legacyDocs = docs.filter(d => !isDriveUrl(d.file_url))
  const driveFolders = driveDocs.filter(d => driveKind(d.file_url) === 'folder')

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
    setDocs(prev => [doc as Document, ...prev])
    setDriveUrl(''); setDriveName(''); setShowDrive(false)
    toast.success('Link Google Drive aggiunto')
  }

  const deleteDoc = async (doc: Document) => {
    if (!confirm(`Rimuovere "${doc.name}" dai documenti?`)) return
    const { error } = await createClient().from('documents').delete().eq('id', doc.id)
    if (error) { toast.error('Errore eliminazione'); return }
    setDocs(prev => prev.filter(d => d.id !== doc.id))
    toast.success('Rimosso')
  }

  const driveFiles = driveDocs.filter(d => driveKind(d.file_url) !== 'folder')
  const filteredFiles = filter === 'tutti' ? driveFiles : driveFiles.filter(d => d.file_type === filter)

  return (
    <div className="space-y-5">
      {/* Aggiungi link Drive */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-text-secondary">
            <FolderOpen className="w-4 h-4 text-gold-text" />
            <span className="text-sm font-semibold text-text-primary">Google Drive</span>
            <span className="text-xs text-text-secondary">unica fonte documenti · visibile al cliente nel portale</span>
          </div>
          <button onClick={() => setShowDrive(s => !s)}
            className="flex items-center gap-1.5 text-xs font-bold text-gold-text hover:text-gold-text">
            <Plus className="w-3.5 h-3.5" /> Aggiungi link Drive
          </button>
        </div>

        {showDrive && (
          <div className="bg-surface border border-border rounded-card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Link2 className="w-4 h-4 text-text-secondary shrink-0" />
              <input value={driveUrl} onChange={e => setDriveUrl(e.target.value)}
                placeholder="Incolla link a cartella o file Google Drive"
                className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:border-gold" />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <input value={driveName} onChange={e => setDriveName(e.target.value)}
                placeholder="Nome (es. Cartella materiali)"
                className="flex-1 min-w-[180px] bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:border-gold" />
              <select value={driveCat} onChange={e => setDriveCat(e.target.value)}
                className="bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold">
                <option value="contratto">Contratto</option>
                <option value="report">Report</option>
                <option value="creatività">Creatività</option>
                <option value="altro">Altro</option>
              </select>
              <button onClick={addDriveLink} disabled={savingDrive || !driveUrl.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-gold text-on-gold font-bold rounded-lg hover:bg-gold/90 transition-colors disabled:opacity-50 text-sm">
                {savingDrive ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Aggiungi
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Anteprima alberatura cartelle Drive (§11.1) */}
      {driveFolders.map(d => (
        <div key={d.id} className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
              <FolderOpen className="w-3.5 h-3.5 text-gold-text" /> {d.name}
            </span>
            <div className="flex items-center gap-2">
              <a href={d.file_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-2xs text-text-secondary hover:text-gold-text transition-colors">
                <ExternalLink className="w-3 h-3" /> Apri in Drive
              </a>
              <button onClick={() => deleteDoc(d)} aria-label="Rimuovi cartella"
                className="text-text-tertiary hover:text-error transition-colors"><Trash2 className="w-3 h-3" /></button>
            </div>
          </div>
          <DriveEmbed url={d.file_url} title={d.name} height={420} />
        </div>
      ))}

      {/* Filtri file Drive */}
      {driveFiles.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {CATEGORIES.map(t => (
            <button key={t} onClick={() => setFilter(t)}
              className={`text-sm px-3 py-1.5 rounded-lg transition-colors capitalize ${
                filter === t ? 'bg-gold text-on-gold font-bold' : 'bg-surface border border-border text-text-secondary hover:text-text-primary'
              }`}>
              {t === 'tutti' ? `Tutti (${driveFiles.length})` : `${t} (${driveFiles.filter(d => d.file_type === t).length})`}
            </button>
          ))}
        </div>
      )}

      {/* Grid file Drive */}
      {filteredFiles.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredFiles.map(doc => (
            <div key={doc.id} className="bg-surface border border-border rounded-card p-4 hover:border-gold/30 transition-colors group">
              <div className="flex items-center justify-center mb-3">
                <FolderOpen className="w-8 h-8 text-gold-text" />
              </div>
              <p className="text-xs font-semibold text-text-primary truncate mb-1" title={doc.name}>{doc.name}</p>
              <p className="text-xs text-text-secondary mb-3">
                {typeLabel[doc.file_type ?? 'altro'] ?? doc.file_type} · {timeAgo(doc.created_at)}
              </p>
              <div className="flex gap-2">
                <button onClick={() => setPreview(doc)}
                  className="flex-1 flex items-center justify-center gap-1 text-xs text-text-secondary hover:text-gold-text transition-colors border border-border rounded py-1">
                  <Eye className="w-3 h-3" /> Anteprima
                </button>
                <button onClick={() => deleteDoc(doc)} aria-label="Rimuovi documento"
                  className="p-1 text-text-secondary hover:text-error transition-colors border border-border rounded">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Documenti legacy su storage (sola apertura, in attesa di pulizia D10) */}
      {legacyDocs.length > 0 && (
        <div className="space-y-2">
          <p className="text-2xs uppercase tracking-wider text-text-tertiary font-bold">
            File storici (non Drive · {legacyDocs.length})
          </p>
          <div className="bg-surface border border-border rounded-card divide-y divide-border">
            {legacyDocs.map(doc => (
              <div key={doc.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="text-sm text-text-primary truncate flex-1">{doc.name}</span>
                <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
                  className="text-2xs text-text-secondary hover:text-gold-text transition-colors flex items-center gap-1">
                  <ExternalLink className="w-3 h-3" /> Apri
                </a>
                <button onClick={() => deleteDoc(doc)} aria-label="Rimuovi documento storico"
                  className="text-text-tertiary hover:text-error transition-colors"><Trash2 className="w-3 h-3" /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty */}
      {docs.length === 0 && (
        <div className="text-center py-16 text-text-secondary">
          <FolderOpen className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Nessun documento. Aggiungi la cartella Drive del cliente.</p>
        </div>
      )}

      {/* Modal anteprima Drive */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4"
          onClick={e => { if (e.target === e.currentTarget) setPreview(null) }}>
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
