'use client'

import { useState } from 'react'
import Link from 'next/link'
import { FolderKanban, Search, ExternalLink, Clock, CheckCircle2, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ProjectWithMeta {
  id: string
  name: string
  status: string
  project_kind: string | null
  client: { id: string; company_name: string } | null
  taskCount: number
  overdueCount: number
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  attivo:    { label: 'Attivo',    color: 'text-green-400 bg-green-400/10 border-green-400/20' },
  in_pausa:  { label: 'In pausa', color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20' },
  chiuso:    { label: 'Chiuso',   color: 'text-white/30 bg-white/5 border-white/10' },
}

interface Props {
  projects: ProjectWithMeta[]
}

export function WorkspaceProjectsClient({ projects }: Props) {
  const [search, setSearch] = useState('')

  const filtered = projects.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.client?.company_name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Progetti assegnati</h1>
          <p className="text-white/40 text-sm mt-0.5">{projects.length} progett{projects.length === 1 ? 'o' : 'i'} con task assegnate</p>
        </div>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cerca..."
            className="pl-9 pr-4 py-2 bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl text-sm text-white placeholder-white/30 focus:border-[#F5C800]/40 outline-none w-52"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-white/30 text-sm">
          {search ? 'Nessun progetto trovato' : 'Nessun progetto assegnato'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map(p => {
            const statusMeta = STATUS_META[p.status] ?? STATUS_META.attivo
            return (
              <Link
                key={p.id}
                href={`/clienti/${p.client?.id}/progetto/${p.id}`}
                className="group block p-5 rounded-2xl bg-[#1A1A1A] border border-[#2A2A2A] hover:border-[#F5C800]/20 transition-all"
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <FolderKanban className="w-4 h-4 text-[#F5C800]/60 shrink-0" />
                    <span className="text-white text-sm font-semibold truncate">{p.name}</span>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-white/20 group-hover:text-white/50 transition-colors shrink-0 mt-0.5" />
                </div>

                {p.client && (
                  <p className="text-white/40 text-xs mb-3 truncate">{p.client.company_name}</p>
                )}

                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn('px-2 py-0.5 rounded-full text-xs border', statusMeta.color)}>
                    {statusMeta.label}
                  </span>
                  {p.project_kind && (
                    <span className="px-2 py-0.5 rounded-full text-xs border border-[#F5C800]/20 text-[#F5C800]/60">
                      {p.project_kind === 'growth' ? 'G' : 'D'}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-4 mt-3 pt-3 border-t border-[#2A2A2A]">
                  <div className="flex items-center gap-1.5 text-xs text-white/40">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {p.taskCount} task
                  </div>
                  {p.overdueCount > 0 && (
                    <div className="flex items-center gap-1.5 text-xs text-red-400">
                      <Clock className="w-3.5 h-3.5" />
                      {p.overdueCount} scadut{p.overdueCount === 1 ? 'a' : 'e'}
                    </div>
                  )}
                  {p.status === 'attivo' && p.overdueCount === 0 && (
                    <div className="flex items-center gap-1.5 text-xs text-green-400/60">
                      <Zap className="w-3.5 h-3.5" />
                      In linea
                    </div>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
