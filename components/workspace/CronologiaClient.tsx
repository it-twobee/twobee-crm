'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { History, Search, ArrowUpRight, Plus, Pencil, Trash2 } from 'lucide-react'
import type { ActivityLog, ActivityAction } from '@/lib/types/database'

const ACTION_UI: Record<ActivityAction, { label: string; cls: string; Icon: typeof Plus }> = {
  create: { label: 'Creato',    cls: 'text-success bg-success-dim', Icon: Plus },
  update: { label: 'Modificato', cls: 'text-info bg-info-dim',      Icon: Pencil },
  delete: { label: 'Eliminato', cls: 'text-error bg-error-dim',     Icon: Trash2 },
}

const ENTITY_LABELS: Record<string, string> = {
  task: 'Task', project: 'Progetto', client: 'Cliente', invoice: 'Fattura',
  sprint: 'Sprint', document: 'Documento', approval: 'Approvazione',
  hr_request: 'Richiesta HR', deal: 'Deal', objective: 'Obiettivo',
}

/** Dove si apre l'entità. null = non c'è una pagina dedicata. */
function entityHref(log: ActivityLog): string | null {
  switch (log.entity_type) {
    case 'task':    return '/workspace/attivita'
    case 'project': return `/workspace/progetti/${log.entity_id}`
    case 'client':  return `/workspace/clienti/${log.entity_id}`
    default:        return null
  }
}

const PERIODS = [
  { key: '7',   label: '7 giorni' },
  { key: '30',  label: '30 giorni' },
  { key: '90',  label: '3 mesi' },
  { key: 'all', label: 'Tutto' },
] as const

export function CronologiaClient({ logs }: { logs: ActivityLog[] }) {
  const [query, setQuery] = useState('')
  const [action, setAction] = useState<ActivityAction | 'all'>('all')
  const [period, setPeriod] = useState<(typeof PERIODS)[number]['key']>('30')

  const filtered = useMemo(() => {
    const now = Date.now()
    const maxAge = period === 'all' ? Infinity : Number(period) * 86_400_000
    const q = query.trim().toLowerCase()

    return logs.filter(l => {
      if (now - new Date(l.created_at).getTime() > maxAge) return false
      if (action !== 'all' && l.action !== action) return false
      if (q) {
        const hay = `${l.entity_label ?? ''} ${l.entity_type}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [logs, query, action, period])

  // Raggruppa per giorno: la cronologia si legge per data, non per riga.
  const byDay = useMemo(() => {
    const map = new Map<string, ActivityLog[]>()
    for (const l of filtered) {
      const day = new Date(l.created_at).toLocaleDateString('it-IT', {
        weekday: 'long', day: 'numeric', month: 'long',
      })
      if (!map.has(day)) map.set(day, [])
      map.get(day)!.push(l)
    }
    return Array.from(map.entries())
  }, [filtered])

  return (
    <div className="p-6 space-y-5">
      <header>
        <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
          <History className="w-5 h-5 text-gold-text" aria-hidden="true" />
          Cronologia
        </h1>
        <p className="text-text-tertiary text-sm mt-0.5">
          Le tue attività recenti. Nessuno vede questa pagina al posto tuo.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[12rem]">
          <Search className="w-4 h-4 text-text-tertiary absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Cerca per nome…"
            aria-label="Cerca nella cronologia"
            className="w-full bg-surface border border-border-interactive rounded-xl pl-9 pr-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold/40"
          />
        </div>

        <div className="flex gap-1" role="group" aria-label="Filtra per azione">
          {(['all', 'create', 'update', 'delete'] as const).map(a => (
            <button key={a} onClick={() => setAction(a)}
              aria-pressed={action === a}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                action === a ? 'bg-gold-dim text-gold-text' : 'text-text-tertiary hover:text-text-primary hover:bg-surface-hover'
              }`}>
              {a === 'all' ? 'Tutte' : ACTION_UI[a].label}
            </button>
          ))}
        </div>

        <div className="flex gap-1" role="group" aria-label="Filtra per periodo">
          {PERIODS.map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              aria-pressed={period === p.key}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                period === p.key ? 'bg-gold-dim text-gold-text' : 'text-text-tertiary hover:text-text-primary hover:bg-surface-hover'
              }`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-20 text-text-tertiary text-sm">
          {logs.length === 0 ? 'Nessuna attività registrata.' : 'Nessuna attività con questi filtri.'}
        </div>
      )}

      <div className="space-y-6">
        {byDay.map(([day, items]) => (
          <section key={day}>
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-text-tertiary">{day}</h2>
              <div className="flex-1 h-px bg-border" />
              <span className="text-2xs text-text-tertiary tabular">{items.length}</span>
            </div>

            <ul className="space-y-1.5">
              {items.map(l => {
                const ui = ACTION_UI[l.action]
                const href = entityHref(l)
                return (
                  <li key={l.id} className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-2.5">
                    <span className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${ui.cls}`}>
                      <ui.Icon className="w-3.5 h-3.5" aria-hidden="true" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text-primary truncate">
                        {ui.label} · {l.entity_label ?? ENTITY_LABELS[l.entity_type] ?? l.entity_type}
                      </p>
                      <p className="text-2xs text-text-tertiary">
                        {ENTITY_LABELS[l.entity_type] ?? l.entity_type} ·{' '}
                        {new Date(l.created_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    {href && l.action !== 'delete' && (
                      <Link href={href} aria-label={`Apri ${l.entity_label ?? l.entity_type}`}
                        className="p-2 rounded-lg text-text-tertiary hover:text-gold-text hover:bg-surface-hover transition-colors shrink-0">
                        <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
                      </Link>
                    )}
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
