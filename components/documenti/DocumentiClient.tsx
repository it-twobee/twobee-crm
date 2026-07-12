'use client'

import { useState, useMemo } from 'react'
import {
  FileText, Search, FolderOpen, FolderKanban, Users, ExternalLink,
  ChevronDown, ChevronRight, Eye, X, AlertTriangle, Folder,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { isDriveUrl, driveKind, DRIVE_KIND_LABEL } from '@/lib/drive'
import { DriveEmbed } from '@/components/shared/DriveEmbed'
import type { Profile } from '@/lib/types/database'

// §11 / §11.1 (D9): i Documenti workspace sono la raccolta dei riferimenti Drive di
// clienti e progetti — nessun upload, nessuna Drive API. L'alberatura è
// Cliente → Progetto → documenti, espandibile/collassabile, con embed folder view
// e "Apri in Drive". I file storici su storage (non Drive) restano visibili in
// sola apertura, marcati, finché non vengono ripuliti (D10).

interface DocItem {
  id: string; name: string; file_url: string; file_type: string | null
  created_at: string; client_id: string | null; project_id: string | null
  uploader: Pick<Profile, 'id' | 'full_name' | 'avatar_url'> | null
  client: { id: string; company_name: string } | null
  project: { id: string; name: string } | null
}

export function DocumentiClient({ documents, clients }: {
  documents: DocItem[]
  clients: { id: string; company_name: string }[]
  projects: { id: string; name: string; client_id: string }[]
}) {
  const [search, setSearch] = useState('')
  const [filterClient, setFilterClient] = useState<string | null>(null)
  const [onlyDrive, setOnlyDrive] = useState(true)
  const [openClients, setOpenClients] = useState<Set<string>>(new Set())
  const [openProjects, setOpenProjects] = useState<Set<string>>(new Set())
  const [preview, setPreview] = useState<DocItem | null>(null)

  const legacyCount = useMemo(() => documents.filter(d => !isDriveUrl(d.file_url)).length, [documents])

  const filtered = useMemo(() => {
    let d = documents
    if (onlyDrive) d = d.filter(doc => isDriveUrl(doc.file_url))
    if (filterClient) d = d.filter(doc => doc.client_id === filterClient)
    if (search) {
      const q = search.toLowerCase()
      d = d.filter(doc =>
        doc.name.toLowerCase().includes(q)
        || doc.client?.company_name.toLowerCase().includes(q)
        || doc.project?.name.toLowerCase().includes(q))
    }
    return d
  }, [documents, search, filterClient, onlyDrive])

  // Albero: cliente → { progetti → docs, docs senza progetto }
  const tree = useMemo(() => {
    type ProjNode = { id: string; label: string; docs: DocItem[] }
    type ClientNode = { id: string; label: string; projects: Map<string, ProjNode>; loose: DocItem[] }
    const byClient = new Map<string, ClientNode>()
    for (const doc of filtered) {
      const cid = doc.client_id ?? 'no-client'
      const clabel = doc.client?.company_name ?? 'Senza cliente'
      const entry: ClientNode = byClient.get(cid) ?? { id: cid, label: clabel, projects: new Map(), loose: [] }
      if (doc.project_id && doc.project) {
        const p: ProjNode = entry.projects.get(doc.project_id) ?? { id: doc.project_id, label: doc.project.name, docs: [] }
        p.docs.push(doc)
        entry.projects.set(doc.project_id, p)
      } else {
        entry.loose.push(doc)
      }
      byClient.set(cid, entry)
    }
    return Array.from(byClient.values())
      .map(c => ({ ...c, projects: Array.from(c.projects.values()).sort((a, b) => a.label.localeCompare(b.label)) }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [filtered])

  // Una ricerca attiva espande tutto: altrimenti i match restano nascosti nei rami chiusi.
  const searching = search.trim().length > 0
  const isClientOpen = (id: string) => searching || openClients.has(id)
  const isProjectOpen = (id: string) => searching || openProjects.has(id)

  const toggleClient = (id: string) => setOpenClients(p => {
    const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n
  })
  const toggleProject = (id: string) => setOpenProjects(p => {
    const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  const docCount = filtered.length

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-black text-text-primary">Documenti</h1>
            <p className="text-xs text-text-secondary mt-0.5">
              {docCount} riferimenti Drive · {clients.length} clienti
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Cerca per nome, cliente o progetto…"
              className="w-full bg-background border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-gold" />
          </div>
          <select value={filterClient ?? ''} onChange={e => setFilterClient(e.target.value || null)}
            aria-label="Filtra per cliente"
            className="bg-background border border-border rounded-lg px-3 py-2 text-xs text-text-primary">
            <option value="">Tutti i clienti</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
            <input type="checkbox" checked={onlyDrive} onChange={e => setOnlyDrive(e.target.checked)} className="accent-gold" />
            Solo Drive
          </label>
        </div>
      </div>

      {/* Body: alberatura */}
      <div className="flex-1 overflow-y-auto p-6 space-y-2">
        {legacyCount > 0 && onlyDrive && (
          <div className="flex items-start gap-2.5 bg-warning-dim border border-warning/20 rounded-xl px-4 py-2.5 mb-4">
            <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
            <p className="text-xs text-text-secondary">
              {legacyCount} file storici non sono su Drive (caricati prima del passaggio a Drive-only).
              Togli il filtro <span className="font-semibold">Solo Drive</span> per vederli.
            </p>
          </div>
        )}

        {tree.length === 0 ? (
          <div className="text-center py-16">
            <FolderOpen className="w-12 h-12 text-text-secondary mx-auto mb-4" />
            <p className="text-text-secondary">Nessun documento trovato.</p>
            <p className="text-xs text-text-tertiary mt-1">
              I documenti si aggiungono come link Drive dalla scheda cliente.
            </p>
          </div>
        ) : tree.map(client => (
          <div key={client.id} className="border border-border rounded-xl overflow-hidden bg-surface">
            {/* Cliente */}
            <button onClick={() => toggleClient(client.id)}
              className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-surface-hover transition-colors text-left">
              {isClientOpen(client.id)
                ? <ChevronDown className="w-4 h-4 text-text-tertiary shrink-0" />
                : <ChevronRight className="w-4 h-4 text-text-tertiary shrink-0" />}
              <Users className="w-4 h-4 text-gold-text shrink-0" />
              <span className="text-sm font-bold text-text-primary flex-1 truncate">{client.label}</span>
              <span className="text-2xs text-text-tertiary shrink-0">
                {client.projects.reduce((s, p) => s + p.docs.length, 0) + client.loose.length}
              </span>
            </button>

            {isClientOpen(client.id) && (
              <div className="border-t border-border">
                {/* Documenti del cliente senza progetto */}
                {client.loose.length > 0 && (
                  <div className="pl-6 pr-3 py-2 space-y-1">
                    {client.loose.map(doc => (
                      <DocRow key={doc.id} doc={doc} onPreview={() => setPreview(doc)} />
                    ))}
                  </div>
                )}

                {/* Progetti */}
                {client.projects.map(project => (
                  <div key={project.id} className="border-t border-border">
                    <button onClick={() => toggleProject(project.id)}
                      className="w-full flex items-center gap-2.5 pl-6 pr-4 py-2.5 hover:bg-surface-hover transition-colors text-left">
                      {isProjectOpen(project.id)
                        ? <ChevronDown className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
                        : <ChevronRight className="w-3.5 h-3.5 text-text-tertiary shrink-0" />}
                      <FolderKanban className="w-3.5 h-3.5 text-info shrink-0" />
                      <span className="text-xs font-semibold text-text-primary flex-1 truncate">{project.label}</span>
                      <span className="text-2xs text-text-tertiary shrink-0">{project.docs.length}</span>
                    </button>
                    {isProjectOpen(project.id) && (
                      <div className="pl-12 pr-3 pb-2 space-y-1">
                        {project.docs.map(doc => (
                          <DocRow key={doc.id} doc={doc} onPreview={() => setPreview(doc)} />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Anteprima Drive */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4"
          onClick={e => { if (e.target === e.currentTarget) setPreview(null) }}>
          <div className="w-full max-w-4xl">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-bold text-text-primary truncate">
                {preview.client?.company_name}
                {preview.project && <span className="text-text-tertiary"> / {preview.project.name}</span>}
                <span className="text-text-tertiary"> / </span>{preview.name}
              </p>
              <button onClick={() => setPreview(null)} aria-label="Chiudi anteprima"
                className="text-text-secondary hover:text-text-primary"><X className="w-5 h-5" /></button>
            </div>
            <DriveEmbed url={preview.file_url} title={preview.name} height={600} />
          </div>
        </div>
      )}
    </div>
  )
}

function DocRow({ doc, onPreview }: { doc: DocItem; onPreview: () => void }) {
  const drive = isDriveUrl(doc.file_url)
  const kind = drive ? driveKind(doc.file_url) : null

  return (
    <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-surface-hover transition-colors group">
      {drive
        ? (kind === 'folder'
            ? <Folder className="w-4 h-4 text-gold-text shrink-0" />
            : <FileText className="w-4 h-4 text-info shrink-0" />)
        : <FileText className="w-4 h-4 text-text-tertiary shrink-0" />}

      <div className="flex-1 min-w-0">
        <p className="text-sm text-text-primary truncate">{doc.name}</p>
        <p className="text-2xs text-text-tertiary">
          {drive && kind ? DRIVE_KIND_LABEL[kind] : 'File storico (non Drive)'} · {formatDate(doc.created_at)}
        </p>
      </div>

      {drive ? (
        <button onClick={onPreview}
          className="flex items-center gap-1 text-2xs text-text-secondary hover:text-gold-text transition-colors shrink-0 opacity-0 group-hover:opacity-100">
          <Eye className="w-3.5 h-3.5" /> Anteprima
        </button>
      ) : null}

      <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-1 text-2xs text-text-secondary hover:text-gold-text transition-colors shrink-0">
        <ExternalLink className="w-3.5 h-3.5" />
        {drive ? 'Apri in Drive' : 'Apri'}
      </a>
    </div>
  )
}
