'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Briefcase, Search, Sparkles, X, FolderKanban } from 'lucide-react'
import { suggestPatterns, groupProjects, type GroupBy, type PatternInput } from '@/lib/portfolio-patterns'

const GROUPS: { key: GroupBy; label: string }[] = [
  { key: 'cliente', label: 'Cliente' },
  { key: 'tipo',    label: 'Tipo' },
  { key: 'stato',   label: 'Stato' },
  { key: 'nessuno', label: 'Nessuno' },
]

const KIND_UI: Record<string, string> = {
  growth:  'text-success bg-success-dim',
  digital: 'text-info bg-info-dim',
}

export function WorkspacePortfolioClient({ projects }: { projects: PatternInput[] }) {
  const [groupBy, setGroupBy] = useState<GroupBy>('cliente')
  const [query, setQuery] = useState('')
  const [activePattern, setActivePattern] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<string>('')

  const patterns = useMemo(() => suggestPatterns(projects), [projects])

  // §10: tipologie reali presenti nei dati (nessuna lista hardcoded).
  const projectTypes = useMemo(
    () => Array.from(new Set(projects.map(p => p.project_type).filter(Boolean) as string[])).sort(),
    [projects],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const pattern = patterns.find(p => p.id === activePattern)
    return projects.filter(p => {
      if (pattern && !pattern.match(p)) return false
      if (typeFilter && p.project_type !== typeFilter) return false
      if (q && !`${p.name} ${p.client_name}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [projects, query, activePattern, patterns, typeFilter])

  const groups = useMemo(() => groupProjects(filtered, groupBy), [filtered, groupBy])

  return (
    <div className="p-6 space-y-5">
      <header>
        <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
          <Briefcase className="w-5 h-5 text-gold-text" aria-hidden="true" />
          Portfolio
        </h1>
        <p className="text-text-tertiary text-sm mt-0.5">
          {projects.length} {projects.length === 1 ? 'progetto assegnato' : 'progetti assegnati'}
        </p>
      </header>

      {patterns.length > 0 && (
        <section aria-label="Raccolte suggerite">
          <p className="text-2xs uppercase tracking-wider text-text-tertiary font-bold mb-2 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" /> Raccolte suggerite
          </p>
          <div className="flex flex-wrap gap-2">
            {patterns.map(p => {
              const active = activePattern === p.id
              return (
                <button key={p.id}
                  onClick={() => setActivePattern(active ? null : p.id)}
                  aria-pressed={active}
                  title={p.reason}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs transition-colors ${
                    active
                      ? 'border-gold/40 bg-gold-dim text-gold-text font-semibold'
                      : 'border-border bg-surface text-text-secondary hover:border-border-strong'
                  }`}>
                  <span>{p.label}</span>
                  <span className="tabular text-2xs text-text-tertiary">{p.count}</span>
                  {active && <X className="w-3 h-3" aria-hidden="true" />}
                </button>
              )
            })}
          </div>
          {activePattern && (
            <p className="text-2xs text-text-tertiary mt-2">
              {patterns.find(p => p.id === activePattern)?.reason}
            </p>
          )}
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[12rem]">
          <Search className="w-4 h-4 text-text-tertiary absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Cerca progetto o cliente…"
            aria-label="Cerca nel portfolio"
            className="w-full bg-surface border border-border-interactive rounded-xl pl-9 pr-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold/40" />
        </div>
        {projectTypes.length > 0 && (
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} aria-label="Filtra per tipologia"
            className="bg-surface border border-border-interactive rounded-xl px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-gold/40">
            <option value="">Tutte le tipologie</option>
            {projectTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        <div className="flex gap-1" role="group" aria-label="Raggruppa per">
          <span className="self-center text-2xs text-text-tertiary mr-1">Raggruppa</span>
          {GROUPS.map(g => (
            <button key={g.key} onClick={() => setGroupBy(g.key)}
              aria-pressed={groupBy === g.key}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                groupBy === g.key ? 'bg-gold-dim text-gold-text' : 'text-text-tertiary hover:text-text-primary hover:bg-surface-hover'
              }`}>
              {g.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-20 text-text-tertiary text-sm">
          {projects.length === 0
            ? 'Nessun progetto assegnato.'
            : 'Nessun progetto con questi filtri.'}
        </div>
      )}

      <div className="space-y-6">
        {groups.map(group => (
          <section key={group.key || 'tutti'}>
            {group.key && (
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-sm font-bold text-text-secondary capitalize">{group.key}</h2>
                <div className="flex-1 h-px bg-border" />
                <span className="text-2xs text-text-tertiary tabular">{group.items.length}</span>
              </div>
            )}
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {group.items.map(p => {
                const pct = p.taskTotal > 0 ? Math.round((p.taskDone / p.taskTotal) * 100) : 0
                return (
                  <li key={p.id}>
                    <Link href={`/workspace/progetti/${p.id}`}
                      className="block rounded-xl border border-border bg-surface p-4 hover:border-border-strong transition-colors">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <FolderKanban className="w-4 h-4 text-text-tertiary shrink-0" aria-hidden="true" />
                          <p className="text-sm font-medium text-text-primary truncate">{p.name}</p>
                        </div>
                        {p.project_kind && (
                          <span className={`shrink-0 text-2xs font-semibold px-2 py-0.5 rounded-full ${KIND_UI[p.project_kind] ?? 'text-text-tertiary bg-surface-active'}`}>
                            {p.project_kind}
                          </span>
                        )}
                      </div>
                      <p className="text-2xs text-text-tertiary truncate mb-3">{p.client_name}</p>

                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-surface-active overflow-hidden">
                          <div className="h-full rounded-full bg-gold" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-2xs text-text-tertiary tabular shrink-0">
                          {p.taskDone}/{p.taskTotal}
                        </span>
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
