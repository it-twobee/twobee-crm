'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronUp, ChevronDown, Flag, Clock, Calendar, UserPlus, X } from 'lucide-react'
import { formatDate, getInitials } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import type { Task, Profile } from '@/lib/types/database'

interface TaskWithMeta extends Task {
  assignee: Pick<Profile, 'id' | 'full_name' | 'avatar_url'> | null
  project: { id: string; name: string; client_id: string; clients: { company_name: string } | null } | null
}

type SortKey = 'title' | 'due_date' | 'priority' | 'status' | 'assignee'
type SortDir = 'asc' | 'desc'

const PRIORITY_ORDER = { alta: 0, media: 1, bassa: 2 }
const STATUS_ORDER: Record<string, number> = { da_fare: 0, in_corso: 1, in_revisione: 2, completato: 3, richiesta_supporto: 4, non_svolta: 5 }

const STATUS_BADGE: Record<string, string> = {
  da_fare: 'bg-surface-active text-text-secondary',
  in_corso: 'bg-warning/20 text-warning',
  in_revisione: 'bg-gold/20 text-gold-text',
  completato: 'bg-success/20 text-success',
}

const STATUS_LABEL: Record<string, string> = {
  da_fare: 'Da fare',
  in_corso: 'In corso',
  in_revisione: 'In revisione',
  completato: 'Completato',
}

const PRIORITY_DOT: Record<string, string> = {
  alta: 'bg-error',
  media: 'bg-warning',
  bassa: 'bg-success',
}

function QuickAssign({
  task,
  profiles,
  onAssign,
}: {
  task: TaskWithMeta
  profiles: Profile[]
  onAssign: (taskId: string, profileId: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  return (
    <div className="relative flex items-center gap-1.5" ref={ref}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
        title={task.assignee ? task.assignee.full_name : 'Assegna'}
        className={`w-5 h-5 rounded-full flex items-center justify-center text-2xs font-bold transition-colors ${
          task.assignee
            ? 'bg-gold/20 border border-gold/30 text-gold-text hover:bg-gold/30'
            : 'bg-surface-active border border-dashed border-border-strong text-text-secondary hover:border-gold/40 hover:text-gold-text'
        }`}
      >
        {task.assignee ? getInitials(task.assignee.full_name) : <UserPlus className="w-3 h-3" />}
      </button>
      {task.assignee && (
        <span className="text-xs text-text-secondary truncate">{task.assignee.full_name.split(' ')[0]}</span>
      )}

      {open && (
        <div className="absolute bottom-7 left-0 z-50 bg-surface border border-border rounded-lg shadow-xl p-1 min-w-[160px]">
          <p className="text-2xs text-text-secondary px-2 py-1 uppercase tracking-wider">Assegna a</p>
          {task.assignee && (
            <button
              onClick={(e) => { e.stopPropagation(); onAssign(task.id, null); setOpen(false) }}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface-active text-xs text-text-secondary"
            >
              <div className="w-5 h-5 rounded-full bg-surface-active flex items-center justify-center">
                <X className="w-3 h-3" />
              </div>
              Rimuovi
            </button>
          )}
          {profiles.map((p) => (
            <button
              key={p.id}
              onClick={(e) => { e.stopPropagation(); onAssign(task.id, p.id); setOpen(false) }}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface-active text-xs ${task.assignee?.id === p.id ? 'text-gold-text' : 'text-text-primary'}`}
            >
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-2xs font-bold ${task.assignee?.id === p.id ? 'bg-gold/20 text-gold-text' : 'bg-surface-active text-text-primary'}`}>
                {getInitials(p.full_name)}
              </div>
              {p.full_name}
              {task.assignee?.id === p.id && <span className="ml-auto text-gold-text">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function ListView({
  tasks: initialTasks,
  profiles = [],
  onSelect,
}: {
  tasks: TaskWithMeta[]
  profiles?: Profile[]
  onSelect: (task: TaskWithMeta) => void
}) {
  const [tasks, setTasks] = useState(initialTasks)
  const [sortKey, setSortKey] = useState<SortKey>('due_date')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [groupBy, setGroupBy] = useState<'none' | 'status' | 'priority' | 'assignee'>('status')

  const handleAssign = async (taskId: string, profileId: string | null) => {
    setTasks((prev) => prev.map((t) =>
      t.id === taskId
        ? { ...t, assignee_id: profileId, assignee: profiles.find((p) => p.id === profileId) ?? null }
        : t
    ))
    await createClient().from('tasks').update({ assignee_id: profileId || null }).eq('id', taskId)
  }

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const sorted = [...tasks].sort((a, b) => {
    let cmp = 0
    switch (sortKey) {
      case 'title': cmp = a.title.localeCompare(b.title); break
      case 'due_date': cmp = (a.due_date ?? '9999') < (b.due_date ?? '9999') ? -1 : 1; break
      case 'priority': cmp = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]; break
      case 'status': cmp = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]; break
      case 'assignee': cmp = (a.assignee?.full_name ?? '').localeCompare(b.assignee?.full_name ?? ''); break
    }
    return sortDir === 'asc' ? cmp : -cmp
  })

  // Raggruppa
  const grouped = (() => {
    if (groupBy === 'none') return { 'Tutti i task': sorted }
    const groups: Record<string, TaskWithMeta[]> = {}
    for (const t of sorted) {
      let key = ''
      if (groupBy === 'status') key = STATUS_LABEL[t.status]
      else if (groupBy === 'priority') key = t.priority.charAt(0).toUpperCase() + t.priority.slice(1)
      else if (groupBy === 'assignee') key = t.assignee?.full_name ?? 'Non assegnato'
      if (!groups[key]) groups[key] = []
      groups[key].push(t)
    }
    return groups
  })()

  const today = new Date().toISOString().slice(0, 10)

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey === k
      ? sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
      : null

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-text-secondary">Raggruppa per:</span>
        {(['none', 'status', 'priority', 'assignee'] as const).map((g) => (
          <button
            key={g}
            onClick={() => setGroupBy(g)}
            className={`text-xs px-2.5 py-1 rounded transition-colors ${groupBy === g ? 'bg-gold text-on-gold font-bold' : 'bg-surface border border-border text-text-secondary hover:text-text-primary'}`}
          >
            {g === 'none' ? 'Nessuno' : g === 'status' ? 'Stato' : g === 'priority' ? 'Priorità' : 'Assegnatario'}
          </button>
        ))}
      </div>

      {/* Tabella */}
      <div className="rounded-card border border-border overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[1fr_140px_100px_110px_120px_80px] bg-surface border-b border-border px-4 py-2.5">
          {([['title', 'Task'], ['status', 'Stato'], ['priority', 'Priorità'], ['due_date', 'Scadenza'], ['assignee', 'Assegnatario']] as [SortKey, string][]).map(([k, label]) => (
            <button
              key={k}
              onClick={() => toggleSort(k)}
              className="flex items-center gap-1 text-xs font-semibold text-text-secondary uppercase tracking-wide hover:text-text-primary transition-colors"
            >
              {label} <SortIcon k={k} />
            </button>
          ))}
          <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Ore</div>
        </div>

        {/* Gruppi e righe */}
        {Object.entries(grouped).map(([group, groupTasks]) => (
          <div key={group}>
            {groupBy !== 'none' && (
              <div className="px-4 py-2 bg-background/60 border-b border-border flex items-center gap-2">
                <span className="text-xs font-bold text-text-primary">{group}</span>
                <span className="text-xs text-text-secondary">({groupTasks.length})</span>
              </div>
            )}
            {groupTasks.map((task) => {
              const overdue = task.due_date && task.due_date < today && task.status !== 'completato'
              return (
                <div
                  key={task.id}
                  onClick={() => onSelect(task)}
                  className="grid grid-cols-[1fr_140px_100px_110px_120px_80px] px-4 py-2.5 border-b border-border hover:bg-surface-hover cursor-pointer group transition-colors"
                >
                  {/* Titolo */}
                  <div className="flex items-center gap-2 min-w-0">
                    {task.is_milestone && <Flag className="w-3 h-3 text-gold-text shrink-0" />}
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${PRIORITY_DOT[task.priority]}`} />
                    <span className="text-sm text-text-primary truncate group-hover:text-gold-text transition-colors">{task.title}</span>
                    {task.tags.length > 0 && (
                      <div className="flex gap-1 shrink-0">
                        {task.tags.slice(0, 2).map((tag) => (
                          <span key={tag} className="text-2xs bg-gold/10 text-gold-text px-1.5 py-0.5 rounded">{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Stato */}
                  <div>
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${STATUS_BADGE[task.status]}`}>
                      {STATUS_LABEL[task.status]}
                    </span>
                  </div>

                  {/* Priorità */}
                  <div className="flex items-center gap-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${PRIORITY_DOT[task.priority]}`} />
                    <span className="text-xs text-text-secondary capitalize">{task.priority}</span>
                  </div>

                  {/* Scadenza */}
                  <div className={`flex items-center gap-1 text-xs ${overdue ? 'text-error font-semibold' : 'text-text-secondary'}`}>
                    {task.due_date && (
                      <>
                        <Calendar className="w-3 h-3" />
                        {formatDate(task.due_date)}
                      </>
                    )}
                  </div>

                  {/* Assegnatario */}
                  <QuickAssign task={task} profiles={profiles} onAssign={handleAssign} />

                  {/* Ore */}
                  <div className="flex items-center gap-1 text-xs text-text-secondary">
                    {task.logged_hours > 0 && (
                      <>
                        <Clock className="w-3 h-3" />
                        {task.logged_hours}h
                        {task.estimated_hours && <span className="text-text-tertiary">/{task.estimated_hours}h</span>}
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
