'use client'

import { useMemo, useState } from 'react'
import {
  ChevronDown, ChevronRight, Eye, ExternalLink, FileText, Folder, FolderOpen, Search, Users, X,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { isDriveUrl, driveKind, DRIVE_KIND_LABEL } from '@/lib/drive'
import { DriveEmbed } from '@/components/shared/DriveEmbed'
import { ClientFileArea } from '@/components/shared/file-area/ClientFileArea'
import type { ClientMaterial } from '@/lib/portal/explorer'
import type { Profile } from '@/lib/types/database'
import { VoceSezione } from '@/components/workspace/VoceSezione'
import type { Sezione } from '@/lib/task-mood'

/* §398 — L'archivio comune è l'**area file di un cliente** vista da noi: quello
   che ha caricato lui e quello che abbiamo caricato noi, nello stesso posto e
   con il confine dichiarato. Il cliente non vede mai il gruppo «Nostri»: non
   perché la pagina lo nasconda, ma perché la sua policy non gliene passa le
   righe. I link Drive restano quello che erano, collegamenti esterni.
   §403 — l'area è lo stesso componente della scheda cliente. */

interface DocItem {
  id: string; name: string; file_url: string; file_type: string | null
  created_at: string; client_id: string | null
  uploader: Pick<Profile, 'id' | 'full_name' | 'avatar_url'> | null
  client: { id: string; company_name: string } | null
}
export type DocMaterial = ClientMaterial

export function DocumentiClient({ documents, materials, clients, voce }: {
  /** §351 — la riga sotto il titolo, **solo** nel portale operativo. */
  voce?: Sezione
  documents: DocItem[]
  /** Per l'elenco delle aziende e la ricerca fra aziende: dentro, l'area carica da sé i suoi (§416). */
  materials: DocMaterial[]
  clients: { id: string; company_name: string }[]
}) {
  const [search, setSearch] = useState('')
  const [filterClient, setFilterClient] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [openClients, setOpenClients] = useState<Set<string>>(new Set())
  const [preview, setPreview] = useState<DocItem | null>(null)

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
      materials: visibleMaterials.filter(m => m.client_id === id),
      drive: visibleDocs.filter(d => (d.client_id ?? 'senza') === id),
    })).sort((a, b) => a.label.localeCompare(b.label, 'it'))
  }, [visibleMaterials, visibleDocs, clients, filterClient])

  const searching = search.trim().length > 0
  const isOpen = (id: string) => searching || !!filterClient || openClients.has(id)
  const toggleClient = (id: string) => setOpenClients(p => {
    const next = new Set(p); next.has(id) ? next.delete(id) : next.add(id); return next
  })

  return (
    <div className="min-h-full">
      <div className="sticky top-0 z-20 bg-background px-4 sm:px-6 py-4 border-b border-border">
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
      </div>

      <div className="p-4 sm:p-6 space-y-2">
        {!rows.length ? (
          <div className="text-center py-16">
            <FolderOpen className="w-12 h-12 text-text-secondary mx-auto mb-4" aria-hidden="true" />
            <p className="text-text-secondary">Nessun file.</p>
            <p className="text-xs text-text-tertiary mt-1">
              Scegli un cliente qui sopra per caricare qualcosa nella sua area — oppure aprila dalla sua scheda, scheda File.
            </p>
          </div>
        ) : rows.map(row => (
          <div key={row.id} className="border border-border rounded-xl overflow-hidden bg-surface">
            <button onClick={() => toggleClient(row.id)} aria-expanded={isOpen(row.id)}
              className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-surface-hover transition-colors text-left">
              {isOpen(row.id)
                ? <ChevronDown className="w-4 h-4 text-text-tertiary shrink-0" aria-hidden="true" />
                : <ChevronRight className="w-4 h-4 text-text-tertiary shrink-0" aria-hidden="true" />}
              <Users className="w-4 h-4 text-gold-text shrink-0" aria-hidden="true" />
              <span className="text-sm font-bold text-text-primary flex-1 truncate">{row.label}</span>
              <span className="text-2xs text-text-tertiary shrink-0">{row.materials.length + row.drive.length}</span>
            </button>

            {isOpen(row.id) && <div className="border-t border-border px-4 py-3 space-y-5">
              {row.id === 'senza'
                ? <p className="text-2xs text-text-tertiary">Documenti senza cliente: non hanno un’area dove caricare.</p>
                : <ClientFileArea clientId={row.id} />}

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

function DriveRow({ doc, onPreview }: { doc: DocItem; onPreview: () => void }) {
  const drive = isDriveUrl(doc.file_url)
  const kind = drive ? driveKind(doc.file_url) : null
  return (
    <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-surface-hover transition-colors">
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
