'use client'

import { useState } from 'react'
import { CheckCircle2, Circle, Calendar, Flag, Plus, Loader2, ChevronDown, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { formatDate, getInitials } from '@/lib/utils'
import type { Task, Profile } from '@/lib/types/database'

interface TaskWithMeta extends Task {
  assignee: Pick<Profile, 'id' | 'full_name' | 'avatar_url'> | null
  project: { id: string; name: string; client_id: string; clients: { company_name: string } | null } | null
}

const PRIORITY_COLOR: Record<string, string> = {
  alta: 'text-error',
  media: 'text-warning',
  bassa: 'text-success',
}

type Section = 'oggi' | 'prossimi' | 'dopo' | 'completati'

function categorizeTasks(tasks: TaskWithMeta[]) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const in7Days = new Date(today)
  in7Days.setDate(in7Days.getDate() + 7)

  const oggi: TaskWithMeta[] = []
  const prossimi: TaskWithMeta[] = []
  const dopo: TaskWithMeta[] = []
  const completati: TaskWithMeta[] = []

  for (const t of tasks) {
    if (t.status === 'completato') { completati.push(t); continue }
    if (!t.due_date) { dopo.push(t); continue }
    const due = new Date(t.due_date)
    due.setHours(0, 0, 0, 0)
    if (due <= today) oggi.push(t)
    else if (due <= in7Days) prossimi.push(t)
    else dopo.push(t)
  }

  return { oggi, prossimi, dopo, completati }
}

const SECTION_META: Record<Section, { label: string; color: string; emptyMsg: string }> = {
  oggi: { label: 'Oggi', color: 'text-error', emptyMsg: 'Nessun task in scadenza oggi 🎉' },
  prossimi: { label: 'Prossimi 7 giorni', color: 'text-warning', emptyMsg: 'Nessun task nei prossimi 7 giorni' },
  dopo: { label: 'Più tardi', color: 'text-text-secondary', emptyMsg: 'Nessun task senza scadenza prossima' },
  completati: { label: 'Completati', color: 'text-success', emptyMsg: 'Nessun task completato' },
}

export function MieAttivitaClient({ tasks: initialTasks, profile }: {
  tasks: TaskWithMeta[]
  profile: Profile
}) {
  const [tasks, setTasks] = useState(initialTasks)
  const [collapsed, setCollapsed] = useState<Record<Section, boolean>>({ oggi: false, prossimi: false, dopo: false, completati: true })
  const [addingIn, setAddingIn] = useState<Section | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [newDue, setNewDue] = useState('')
  const [adding, setAdding] = useState(false)

  const { oggi, prossimi, dopo, completati } = categorizeTasks(tasks)
  const sections: [Section, TaskWithMeta[]][] = [
    ['oggi', oggi], ['prossimi', prossimi], ['dopo', dopo], ['completati', completati],
  ]

  const toggleStatus = async (task: TaskWithMeta) => {
    const newStatus = task.status === 'completato' ? 'da_fare' : 'completato'
    const supabase = createClient()
    await supabase.from('tasks').update({ status: newStatus }).eq('id', task.id)
    setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, status: newStatus } : t))
    if (newStatus === 'completato') toast.success('Task completata! ✓')
  }

  const addTask = async (section: Section) => {
    if (!newTitle.trim()) return
    setAdding(true)
    const supabase = createClient()

    const dueDate = section === 'oggi'
      ? new Date().toISOString().slice(0, 10)
      : newDue || null

    const { data, error } = await supabase.from('tasks').insert({
      title: newTitle.trim(),
      assignee_id: profile.id,
      status: 'da_fare',
      priority: 'media',
      due_date: dueDate,
      project_id: null as unknown as string, // sarà assegnato al progetto in seguito
    }).select(`*, assignee:profiles!tasks_assignee_id_fkey(id, full_name, avatar_url), project:projects(id, name, client_id, clients(company_name))`).single()

    setAdding(false)
    if (error) { toast.error('Errore: ' + error.message); return }
    setTasks((prev) => [data as TaskWithMeta, ...prev])
    setNewTitle('')
    setNewDue('')
    setAddingIn(null)
    toast.success('Task aggiunta!')
  }

  const total = tasks.filter((t) => t.status !== 'completato').length
  const done = completati.length

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-8 py-6 border-b border-[#2A2A2A]">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-gold/20 border border-gold/30 flex items-center justify-center text-gold font-bold">
            {getInitials(profile.full_name)}
          </div>
          <div>
            <h1 className="text-xl font-black text-white">Le mie attività</h1>
            <p className="text-xs text-text-secondary">{total} task attive · {done} completate</p>
          </div>
        </div>
        {/* Progress bar */}
        {(total + done) > 0 && (
          <div className="w-full h-1.5 bg-[#2A2A2A] rounded-full overflow-hidden">
            <div
              className="h-full bg-success rounded-full transition-all"
              style={{ width: `${Math.round((done / (total + done)) * 100)}%` }}
            />
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
        {sections.map(([key, sectionTasks]) => {
          const meta = SECTION_META[key]
          const isCollapsed = collapsed[key]
          return (
            <div key={key}>
              {/* Section header */}
              <button
                onClick={() => setCollapsed((p) => ({ ...p, [key]: !p[key] }))}
                className="flex items-center gap-2 mb-3 group"
              >
                {isCollapsed
                  ? <ChevronRight className="w-4 h-4 text-text-secondary" />
                  : <ChevronDown className="w-4 h-4 text-text-secondary" />
                }
                <span className={`text-sm font-bold ${meta.color}`}>{meta.label}</span>
                <span className="text-xs text-text-secondary bg-[#2A2A2A] px-1.5 py-0.5 rounded">{sectionTasks.length}</span>
              </button>

              {!isCollapsed && (
                <div className="space-y-px">
                  {sectionTasks.length === 0 ? (
                    <p className="text-xs text-text-secondary pl-6 py-2 italic">{meta.emptyMsg}</p>
                  ) : (
                    sectionTasks.map((task) => {
                      const isCompleted = task.status === 'completato'
                      const isOverdue = task.due_date && new Date(task.due_date) < new Date() && !isCompleted
                      return (
                        <div
                          key={task.id}
                          className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.03] group transition-colors"
                        >
                          {/* Checkbox */}
                          <button
                            onClick={() => toggleStatus(task)}
                            className={`shrink-0 transition-colors ${isCompleted ? 'text-success' : 'text-text-secondary hover:text-gold'}`}
                          >
                            {isCompleted
                              ? <CheckCircle2 className="w-5 h-5" />
                              : <Circle className="w-5 h-5" />
                            }
                          </button>

                          {/* Titolo */}
                          <span className={`flex-1 text-sm transition-colors ${isCompleted ? 'line-through text-text-secondary' : 'text-white'}`}>
                            {task.title}
                          </span>

                          {/* Milestone */}
                          {task.is_milestone && <Flag className="w-3.5 h-3.5 text-gold shrink-0" />}

                          {/* Progetto */}
                          {task.project && (
                            <span className="text-xs text-text-secondary opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                              {task.project.clients?.company_name ?? task.project.name}
                            </span>
                          )}

                          {/* Scadenza */}
                          {task.due_date && (
                            <div className={`flex items-center gap-1 text-xs shrink-0 ${isOverdue ? 'text-error font-semibold' : 'text-text-secondary'}`}>
                              <Calendar className="w-3 h-3" />
                              {formatDate(task.due_date)}
                            </div>
                          )}

                          {/* Priorità */}
                          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${task.priority === 'alta' ? 'bg-error' : task.priority === 'media' ? 'bg-warning' : 'bg-success'}`} />
                        </div>
                      )
                    })
                  )}

                  {/* Add task inline */}
                  {addingIn === key ? (
                    <div className="flex items-center gap-2 px-3 py-2">
                      <Circle className="w-5 h-5 text-text-secondary shrink-0" />
                      <input
                        autoFocus
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') addTask(key); if (e.key === 'Escape') { setAddingIn(null); setNewTitle('') } }}
                        placeholder="Titolo task..."
                        className="flex-1 bg-background border border-gold rounded px-2 py-1 text-sm text-white focus:outline-none"
                      />
                      {key !== 'oggi' && (
                        <input type="date" value={newDue} onChange={(e) => setNewDue(e.target.value)}
                          className="bg-background border border-[#2A2A2A] rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-gold" />
                      )}
                      <button onClick={() => addTask(key)} disabled={adding}
                        className="px-3 py-1 bg-gold text-black text-xs font-bold rounded hover:bg-yellow-400 disabled:opacity-50 flex items-center gap-1">
                        {adding && <Loader2 className="w-3 h-3 animate-spin" />} Aggiungi
                      </button>
                      <button onClick={() => { setAddingIn(null); setNewTitle('') }} className="text-text-secondary hover:text-white text-xs">✕</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddingIn(key)}
                      className="flex items-center gap-2 px-3 py-2 text-text-secondary hover:text-gold text-xs transition-colors w-full"
                    >
                      <Plus className="w-4 h-4" /> Aggiungi task
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
