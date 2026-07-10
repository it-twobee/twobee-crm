'use client'

import { useState, useMemo } from 'react'
import {
  FileText, Image, Film, File, Download, Search, Filter,
  FolderOpen, Users, FolderKanban, Calendar, Grid, List,
} from 'lucide-react'
import { formatDate, getInitials } from '@/lib/utils'
import type { Profile } from '@/lib/types/database'

interface DocItem {
  id: string; name: string; file_url: string; file_type: string | null
  created_at: string; client_id: string | null; project_id: string | null
  uploader: Pick<Profile, 'id' | 'full_name' | 'avatar_url'> | null
  client: { id: string; company_name: string } | null
  project: { id: string; name: string } | null
}

type ViewMode = 'grid' | 'list'
type GroupBy = 'none' | 'client' | 'project' | 'type'

const FILE_ICONS: Record<string, { icon: typeof FileText; color: string }> = {
  pdf: { icon: FileText, color: 'text-error' },
  image: { icon: Image, color: 'text-info' },
  video: { icon: Film, color: 'text-accent' },
  default: { icon: File, color: 'text-text-secondary' },
}

function fileCategory(type: string | null): string {
  if (!type) return 'default'
  if (type.includes('pdf')) return 'pdf'
  if (type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(type)) return 'image'
  if (type.startsWith('video/') || ['mp4', 'mov', 'avi'].includes(type)) return 'video'
  return 'default'
}

export function DocumentiClient({ documents, clients, projects }: {
  documents: DocItem[]
  clients: { id: string; company_name: string }[]
  projects: { id: string; name: string; client_id: string }[]
}) {
  const [search, setSearch] = useState('')
  const [filterClient, setFilterClient] = useState<string | null>(null)
  const [filterType, setFilterType] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [groupBy, setGroupBy] = useState<GroupBy>('client')

  const filtered = useMemo(() => {
    let d = documents
    if (search) {
      const q = search.toLowerCase()
      d = d.filter(doc => doc.name.toLowerCase().includes(q) || doc.client?.company_name.toLowerCase().includes(q) || doc.project?.name.toLowerCase().includes(q))
    }
    if (filterClient) d = d.filter(doc => doc.client_id === filterClient)
    if (filterType) d = d.filter(doc => fileCategory(doc.file_type) === filterType)
    return d
  }, [documents, search, filterClient, filterType])

  const grouped = useMemo(() => {
    if (groupBy === 'none') return [{ key: 'all', label: `Tutti (${filtered.length})`, docs: filtered }]
    const map: Record<string, { label: string; docs: DocItem[] }> = {}
    for (const doc of filtered) {
      let key: string, label: string
      if (groupBy === 'client') {
        key = doc.client_id ?? 'no-client'
        label = doc.client?.company_name ?? 'Senza cliente'
      } else if (groupBy === 'project') {
        key = doc.project_id ?? 'no-project'
        label = doc.project ? `${doc.client?.company_name ?? ''} — ${doc.project.name}` : 'Senza progetto'
      } else {
        key = fileCategory(doc.file_type)
        label = key === 'pdf' ? 'PDF' : key === 'image' ? 'Immagini' : key === 'video' ? 'Video' : 'Altri file'
      }
      ;(map[key] ??= { label, docs: [] }).docs.push(doc)
    }
    return Object.entries(map).map(([key, v]) => ({ key, label: `${v.label} (${v.docs.length})`, docs: v.docs })).sort((a, b) => a.label.localeCompare(b.label))
  }, [filtered, groupBy])

  const fileTypes = useMemo(() => {
    const s = new Set(documents.map(d => fileCategory(d.file_type)))
    return Array.from(s).sort()
  }, [documents])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-black text-text-primary">Documenti</h1>
            <p className="text-xs text-text-secondary mt-0.5">{documents.length} file totali · {clients.length} clienti</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-lg ${viewMode === 'list' ? 'bg-gold/10 text-gold-text' : 'text-text-secondary hover:text-text-primary'}`}><List className="w-4 h-4" /></button>
            <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-lg ${viewMode === 'grid' ? 'bg-gold/10 text-gold-text' : 'text-text-secondary hover:text-text-primary'}`}><Grid className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cerca per nome, cliente o progetto..."
              className="w-full bg-background border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-gold" />
          </div>
          <select value={filterClient ?? ''} onChange={e => setFilterClient(e.target.value || null)}
            className="bg-background border border-border rounded-lg px-3 py-2 text-xs text-text-primary">
            <option value="">Tutti i clienti</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
          </select>
          <select value={filterType ?? ''} onChange={e => setFilterType(e.target.value || null)}
            className="bg-background border border-border rounded-lg px-3 py-2 text-xs text-text-primary">
            <option value="">Tutti i tipi</option>
            {fileTypes.map(t => <option key={t} value={t}>{t === 'pdf' ? 'PDF' : t === 'image' ? 'Immagini' : t === 'video' ? 'Video' : 'Altri'}</option>)}
          </select>
          <div className="flex items-center gap-1 text-xs text-text-secondary">
            <Filter className="w-3.5 h-3.5" />
            {(['client', 'project', 'type', 'none'] as GroupBy[]).map(g => (
              <button key={g} onClick={() => setGroupBy(g)}
                className={`px-2 py-0.5 rounded ${groupBy === g ? 'text-gold-text font-semibold' : 'hover:text-text-primary'}`}>
                {g === 'client' ? 'Cliente' : g === 'project' ? 'Progetto' : g === 'type' ? 'Tipo' : 'Nessuno'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <FolderOpen className="w-12 h-12 text-text-secondary mx-auto mb-4" />
            <p className="text-text-secondary">Nessun documento trovato.</p>
          </div>
        ) : grouped.map(group => (
          <div key={group.key}>
            {groupBy !== 'none' && (
              <div className="flex items-center gap-2 mb-3">
                {groupBy === 'client' && <Users className="w-4 h-4 text-gold-text" />}
                {groupBy === 'project' && <FolderKanban className="w-4 h-4 text-info" />}
                {groupBy === 'type' && <File className="w-4 h-4 text-accent" />}
                <span className="text-sm font-bold text-text-primary">{group.label}</span>
              </div>
            )}
            {viewMode === 'list' ? (
              <div className="bg-surface border border-border rounded-xl overflow-hidden divide-y divide-border">
                {group.docs.map(doc => {
                  const cat = fileCategory(doc.file_type)
                  const fi = FILE_ICONS[cat] ?? FILE_ICONS.default
                  return (
                    <div key={doc.id} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-hover transition-colors">
                      <fi.icon className={`w-5 h-5 shrink-0 ${fi.color}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-text-primary truncate">{doc.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {doc.client && <span className="text-2xs text-text-secondary">{doc.client.company_name}</span>}
                          {doc.project && <span className="text-2xs text-text-tertiary">/ {doc.project.name}</span>}
                        </div>
                      </div>
                      {doc.uploader && (
                        <div className="w-6 h-6 rounded-full bg-gold/20 flex items-center justify-center text-2xs font-bold text-gold-text shrink-0"
                          title={doc.uploader.full_name ?? ''}>
                          {getInitials(doc.uploader.full_name ?? '')}
                        </div>
                      )}
                      <span className="text-2xs text-text-tertiary shrink-0">{formatDate(doc.created_at)}</span>
                      <a href={doc.file_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                        className="text-text-secondary hover:text-gold-text transition-colors shrink-0">
                        <Download className="w-4 h-4" />
                      </a>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {group.docs.map(doc => {
                  const cat = fileCategory(doc.file_type)
                  const fi = FILE_ICONS[cat] ?? FILE_ICONS.default
                  return (
                    <a key={doc.id} href={doc.file_url} target="_blank" rel="noopener noreferrer"
                      className="bg-surface border border-border rounded-xl p-4 hover:border-gold/30 transition-colors group">
                      <fi.icon className={`w-8 h-8 ${fi.color} mb-3`} />
                      <p className="text-sm text-text-primary font-medium truncate mb-1">{doc.name}</p>
                      <p className="text-2xs text-text-tertiary truncate">{doc.client?.company_name ?? 'Senza cliente'}</p>
                      <p className="text-2xs text-text-tertiary mt-1">{formatDate(doc.created_at)}</p>
                    </a>
                  )
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
