'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Loader2, ExternalLink, Clock, CheckSquare } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import type { Task, TaskStatus } from '@/lib/types/database'

type ProjRel = { id: string; name: string; client_id: string | null; clients: { company_name: string } | null }
export type RisorsaTaskRow = Task & { project?: ProjRel | null }
type Row = RisorsaTaskRow

type Filter = 'oggi' | 'settimana' | 'scadute' | 'da_fare' | 'in_corso' | 'completate'

const STATUS_META: Record<TaskStatus, { label: string; color: string }> = {
  da_fare:      { label: 'Da fare',      color: '#6B7280' },
  in_corso:     { label: 'In corso',     color: '#F5C800' },
  in_revisione: { label: 'In revisione', color: '#3B82F6' },
  completato:   { label: 'Completato',   color: '#22C55E' },
}
const PRIO_COLOR: Record<string, string> = { alta: '#EF4444', media: '#F59E0B', bassa: '#6B7280' }

export function RisorsaTasks({ initialTasks }: { initialTasks: Row[] }) {
  const [tasks, setTasks] = useState(initialTasks)
  const [filter, setFilter] = useState<Filter>('oggi')
  const [busy, setBusy] = useState<string | null>(null)

  const today = new Date().toISOString().slice(0, 10)
  const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)

  const matches = (t: Row): boolean => {
    switch (filter) {
      case 'oggi':       return t.status !== 'completato' && (t.due_date === today || (!!t.due_date && t.due_date < today))
      case 'settimana':  return t.status !== 'completato' && !!t.due_date && t.due_date <= weekEnd
      case 'scadute':    return t.status !== 'completato' && !!t.due_date && t.due_date < today
      case 'da_fare':    return t.status === 'da_fare'
      case 'in_corso':   return t.status === 'in_corso'
      case 'completate': return t.status === 'completato'
    }
  }
  const visible = tasks.filter(matches)

  const counts: Record<Filter, number> = {
    oggi: tasks.filter(t => t.status !== 'completato' && (t.due_date === today || (!!t.due_date && t.due_date < today))).length,
    settimana: tasks.filter(t => t.status !== 'completato' && !!t.due_date && t.due_date <= weekEnd).length,
    scadute: tasks.filter(t => t.status !== 'completato' && !!t.due_date && t.due_date < today).length,
    da_fare: tasks.filter(t => t.status === 'da_fare').length,
    in_corso: tasks.filter(t => t.status === 'in_corso').length,
    completate: tasks.filter(t => t.status === 'completato').length,
  }

  const setStatus = async (t: Row, status: TaskStatus) => {
    setBusy(t.id)
    const { error } = await createClient().from('tasks').update({ status }).eq('id', t.id)
    setBusy(null)
    if (error) { toast.error(error.message); return }
    setTasks(prev => prev.map(x => x.id === t.id ? { ...x, status } : x))
    if (status === 'completato') toast.success('Task completato!')
  }

  const FILTERS: { id: Filter; label: string }[] = [
    { id: 'oggi', label: 'Oggi' }, { id: 'settimana', label: 'Settimana' }, { id: 'scadute', label: 'Scadute' },
    { id: 'da_fare', label: 'Da fare' }, { id: 'in_corso', label: 'In corso' }, { id: 'completate', label: 'Completate' },
  ]

  return (
    <div className="max-w-4xl mx-auto px-5 py-6 space-y-4">
      <h1 className="text-xl font-black text-white">Le mie attività</h1>

      <div className="flex gap-1 bg-[#0D0D0D] border border-[#1A1A1A] rounded-xl p-1 overflow-x-auto w-fit max-w-full">
        {FILTERS.map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${filter === f.id ? 'bg-[#F5C800] text-black' : 'text-[#555] hover:text-white'}`}>
            {f.label}
            {counts[f.id] > 0 && <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${filter === f.id ? 'bg-black/20' : 'bg-[#1A1A1A]'}`}>{counts[f.id]}</span>}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-[#1A1A1A] rounded-2xl">
          <CheckSquare className="w-8 h-8 text-[#1A1A1A] mx-auto mb-3" />
          <p className="text-[#555] text-sm">Nessuna attività in questa vista.</p>
          <p className="text-[#333] text-xs mt-1">Quando ti verrà assegnato un task, lo troverai qui.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map(t => {
            const isOver = t.status !== 'completato' && t.due_date && t.due_date < today
            const proj = t.project
            return (
              <div key={t.id} className="bg-[#0D0D0D] border border-[#1A1A1A] rounded-xl p-3.5 flex items-center gap-3">
                <button onClick={() => setStatus(t, t.status === 'completato' ? 'da_fare' : 'completato')} disabled={busy === t.id}
                  className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-all ${t.status === 'completato' ? 'bg-green-500 border-green-500' : 'border-[#2A2A2A] hover:border-[#F5C800]'}`}>
                  {busy === t.id ? <Loader2 className="w-3 h-3 animate-spin text-[#888]" /> : t.status === 'completato' && <CheckSquare className="w-3 h-3 text-black" />}
                </button>

                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold truncate ${t.status === 'completato' ? 'line-through text-[#444]' : 'text-white'}`}>{t.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {proj && <span className="text-[10px] text-[#555] truncate">{proj.clients?.company_name ?? proj.name}</span>}
                    {t.priority && <span className="text-[9px] font-bold" style={{ color: PRIO_COLOR[t.priority] ?? '#555' }}>{t.priority}</span>}
                    {(t.estimated_hours || t.logged_hours) && (
                      <span className="text-[9px] text-[#444] flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" />{t.logged_hours ?? 0}/{t.estimated_hours ?? '—'}h</span>
                    )}
                  </div>
                </div>

                {t.due_date && (
                  <span className={`text-[10px] shrink-0 ${isOver ? 'text-red-400 font-bold' : 'text-[#555]'}`}>
                    {new Date(t.due_date).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}
                  </span>
                )}

                {t.status !== 'completato' && (
                  <select value={t.status} onChange={e => setStatus(t, e.target.value as TaskStatus)}
                    className="bg-[#111] border border-[#1A1A1A] rounded-lg px-2 py-1 text-[10px] text-white focus:outline-none shrink-0"
                    style={{ color: STATUS_META[t.status].color }}>
                    <option value="da_fare">Da fare</option>
                    <option value="in_corso">In corso</option>
                    <option value="completato">Completa</option>
                  </select>
                )}

                {proj?.client_id && (
                  <Link href={`/clienti/${proj.client_id}/progetto/${proj.id}`} className="p-1 text-[#444] hover:text-[#F5C800] shrink-0" title="Apri progetto">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
