'use client'

import { useState } from 'react'
import {
  Plus, Calendar, Loader2, X, FolderKanban,
  ChevronDown, ChevronUp, Brain, Users2,
  MessageSquare, FileText, Pencil, Trash2, Flag,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { Client, Project, Sprint, Task, MeetingNote, SprintStatus, TaskPriority, Profile, ProjectKind, ClientType } from '@/lib/types/database'
import { notifyTaskAssigned } from '@/lib/notifications'

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  client: Client
  projects: Project[]
  sprints: Sprint[]
  tasks: Task[]
  meetings: MeetingNote[]
  profiles?: Profile[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PROJECT_TYPE_META: Record<string, { icon: string; label: string }> = {
  ecommerce: { icon: '🛒', label: 'E-commerce' },
  lead_gen:  { icon: '🎯', label: 'Lead Gen' },
  sito_web:  { icon: '🌐', label: 'Sito Web' },
  app_ai:    { icon: '🤖', label: 'App AI' },
  campagna:  { icon: '📣', label: 'Campagna' },
  custom:    { icon: '📁', label: 'Custom' },
}

const STATUS_CFG: Record<string, { label: string; badge: string; dot: string }> = {
  attivo:     { label: 'Attivo',     badge: 'bg-success/10 text-success border-success/20',         dot: 'bg-success' },
  in_pausa:   { label: 'In pausa',   badge: 'bg-warning/10 text-warning border-warning/20',         dot: 'bg-warning' },
  completato: { label: 'Completato', badge: 'bg-surface-active text-text-secondary border-border-strong',   dot: 'bg-text-tertiary' },
  archiviato: { label: 'Archiviato', badge: 'bg-surface-active text-text-secondary border-border-strong',   dot: 'bg-text-tertiary' },
}

const TASK_COLS: { key: Task['status']; label: string; top: string }[] = [
  { key: 'da_fare',      label: 'Da fare',      top: 'border-t-border-strong' },
  { key: 'in_corso',     label: 'In corso',     top: 'border-t-warning' },
  { key: 'in_revisione', label: 'In revisione', top: 'border-t-gold' },
  { key: 'completato',   label: 'Completato',   top: 'border-t-success' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function projectProgress(tasks: Task[]) {
  if (!tasks.length) return 0
  return Math.round(tasks.filter(t => t.status === 'completato').length / tasks.length * 100)
}

function getMilestones(tasks: Task[]) {
  return tasks.filter(t => t.is_milestone).sort((a, b) => a.position - b.position)
}

// ─── ProgressRing ─────────────────────────────────────────────────────────────

function ProgressRing({ pct, size = 56 }: { pct: number; size?: number }) {
  const cx = size / 2
  const r  = cx - 5
  const circ   = 2 * Math.PI * r
  const offset = circ - (pct / 100) * circ
  const color  = pct >= 75 ? 'var(--color-success)' : pct >= 40 ? 'var(--color-gold-text)' : pct > 0 ? 'var(--color-error)' : 'var(--color-border-strong)'
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="#2A2A2A" strokeWidth="4.5" />
      <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth="4.5"
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cx})`} style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
      <text x={cx} y={cx + 4} textAnchor="middle" fill={color} fontSize="12" fontWeight="900">{pct}%</text>
    </svg>
  )
}

// ─── ProjectCard ──────────────────────────────────────────────────────────────

function ProjectCard({ project, tasks, sprints, isSelected, onSelect, onEdit }: {
  project: Project; tasks: Task[]; sprints: Sprint[]
  isSelected: boolean; onSelect: () => void; onEdit: (e: React.MouseEvent) => void
}) {
  const pct    = projectProgress(tasks)
  const open   = tasks.filter(t => t.status !== 'completato').length
  const overdue = tasks.filter(t => t.status !== 'completato' && t.due_date && new Date(t.due_date) < new Date()).length
  const curSprint = sprints.find(s => s.project_id === project.id && s.status === 'in_corso')
  const meta   = PROJECT_TYPE_META[project.project_type] ?? PROJECT_TYPE_META.custom
  const status = STATUS_CFG[project.status] ?? STATUS_CFG.archiviato

  return (
    <button onClick={onSelect} className={`w-full text-left rounded-xl border p-4 transition-all duration-200 hover:border-gold/40 ${
      isSelected ? 'bg-gold/5 border-gold/50 ring-1 ring-gold/15' : 'bg-surface border-border'
    }`}>
      <div className="flex items-center gap-4">
        <ProgressRing pct={pct} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-base leading-none">{meta.icon}</span>
            <span className="text-sm font-bold text-text-primary">{project.name}</span>
            <span className={`text-2xs font-semibold px-1.5 py-0.5 rounded border ${status.badge}`}>{status.label}</span>
            {project.project_kind === 'growth' && (
              <span className="text-2xs font-bold px-1.5 py-0.5 rounded border bg-gold/10 text-gold-text border-gold/25">📈 Growth</span>
            )}
            {project.project_kind === 'digital' && (
              <span className="text-2xs font-bold px-1.5 py-0.5 rounded border bg-info/10 text-info border-info/25">💻 Digital</span>
            )}
            {curSprint && (
              <span className="text-2xs text-gold-text font-semibold bg-gold/10 border border-gold/20 px-1.5 py-0.5 rounded">
                Sprint {project.sprint_current} in corso
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-text-secondary">
            <span>{meta.label}</span>
            {open > 0
              ? <span className={overdue > 0 ? 'text-error font-semibold' : ''}>{open} task aperte{overdue > 0 ? ` · ${overdue} scadute` : ''}</span>
              : tasks.length > 0
                ? <span className="text-success font-semibold">✓ Tutto completato</span>
                : <span>Nessuna task ancora</span>
            }
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span onClick={onEdit}
            className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-overlay/5 transition-colors"
            title="Modifica progetto">
            <Pencil className="w-3.5 h-3.5" />
          </span>
          <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isSelected ? 'rotate-180 text-gold-text' : 'text-text-secondary'}`} />
        </div>
      </div>
    </button>
  )
}

// ─── MilestoneTracker ─────────────────────────────────────────────────────────

function MilestoneTracker({ tasks, onAdd, onEdit, onDelete }: {
  tasks: Task[]
  onAdd: () => void
  onEdit: (m: Task) => void
  onDelete: (id: string) => void
}) {
  const milestones = getMilestones(tasks)
  const completedCount = milestones.filter(m => m.status === 'completato').length

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        {milestones.length > 0 && (
          <div className="flex items-center gap-3 flex-1 mr-4">
            <div className="flex-1 h-2 bg-surface-active rounded-full overflow-hidden">
              <div className="h-full bg-gold rounded-full transition-all duration-700"
                style={{ width: `${Math.round(completedCount / milestones.length * 100)}%` }} />
            </div>
            <span className="text-xs font-bold text-gold-text shrink-0">{completedCount}/{milestones.length}</span>
          </div>
        )}
        <button onClick={onAdd}
          className="flex items-center gap-1 text-xs font-semibold text-gold-text hover:text-gold-text transition-colors ml-auto">
          <Plus className="w-3.5 h-3.5" /> Aggiungi milestone
        </button>
      </div>

      {milestones.length === 0 ? (
        <div className="text-center py-8">
          <Flag className="w-8 h-8 text-text-tertiary mx-auto mb-2" />
          <p className="text-sm text-text-secondary mb-3">Nessuna milestone definita per questo progetto.</p>
          <button onClick={onAdd} className="text-xs text-gold-text hover:underline">Aggiungi la prima milestone</button>
        </div>
      ) : (
        <div>
          {milestones.map((m, i) => {
            const isDone    = m.status === 'completato'
            const isCurrent = !isDone && (m.status === 'in_corso' || m.status === 'in_revisione')
            const isOverdue = !isDone && !!m.due_date && new Date(m.due_date) < new Date()
            const isLast    = i === milestones.length - 1

            return (
              <div key={m.id} className="flex items-stretch gap-4 group">
                {/* Dot + line */}
                <div className="flex flex-col items-center w-7 shrink-0">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center z-10 border-2 transition-all shrink-0 ${
                    isDone    ? 'bg-success border-success' :
                    isCurrent ? 'bg-gold border-gold shadow-[0_0_12px_var(--color-gold-dim)]' :
                    isOverdue ? 'bg-error/10 border-error' :
                    'bg-surface border-border'
                  }`}>
                    {isDone ? (
                      <svg className="w-3.5 h-3.5 text-on-gold" viewBox="0 0 14 14" fill="none">
                        <path d="M2.5 7L5.5 10L11.5 4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <div className={`w-2 h-2 rounded-full ${isCurrent ? 'bg-on-gold' : isOverdue ? 'bg-error' : 'bg-text-tertiary'}`} />
                    )}
                  </div>
                  {!isLast && <div className={`w-px flex-1 my-1.5 ${isDone ? 'bg-success/30' : 'bg-surface-active'}`} />}
                </div>

                {/* Content */}
                <div className={`flex-1 ${isLast ? 'pb-0' : 'pb-5'}`}>
                  <div className="flex items-start justify-between gap-2 pt-0.5">
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold leading-snug ${
                        isDone ? 'text-text-secondary line-through decoration-text-tertiary' :
                        isCurrent ? 'text-text-primary' : 'text-text-secondary'
                      }`}>{m.title}</p>
                      {m.description && !isDone && (
                        <p className="text-xs text-text-secondary mt-0.5 leading-relaxed">{m.description}</p>
                      )}
                    </div>
                    <div className="shrink-0 flex items-center gap-1">
                      {isCurrent && <span className="text-2xs bg-gold/10 text-gold-text border border-gold/30 px-2 py-0.5 rounded-full font-bold whitespace-nowrap">In corso</span>}
                      {isOverdue && <span className="text-2xs bg-error/10 text-error border border-error/30 px-2 py-0.5 rounded-full font-bold whitespace-nowrap">Scaduta</span>}
                      {m.due_date && <span className="text-2xs text-text-secondary whitespace-nowrap">{formatDate(m.due_date)}</span>}
                      <button onClick={() => onEdit(m)} className="p-1 rounded hover:bg-overlay/5 text-text-secondary hover:text-text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button onClick={() => { if (confirm('Eliminare questa milestone?')) onDelete(m.id) }}
                        className="p-1 rounded hover:bg-error/10 text-text-secondary hover:text-error opacity-0 group-hover:opacity-100 transition-opacity">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── MiniTaskBoard ────────────────────────────────────────────────────────────

function MiniTaskBoard({ tasks, profiles, onStatusChange, onAdd, onEdit, onDelete }: {
  tasks: Task[]; profiles: Profile[]
  onStatusChange: (id: string, s: Task['status']) => void
  onAdd: () => void
  onEdit: (t: Task) => void
  onDelete: (id: string) => void
}) {
  const nonMilestone = tasks.filter(t => !t.is_milestone)

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button onClick={onAdd} className="flex items-center gap-1 text-xs font-semibold text-gold-text hover:text-gold-text transition-colors">
          <Plus className="w-3.5 h-3.5" /> Aggiungi task
        </button>
      </div>
      {nonMilestone.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-text-secondary mb-3">Nessuna task in questo progetto.</p>
          <button onClick={onAdd} className="text-xs text-gold-text hover:underline">Aggiungi la prima task</button>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {TASK_COLS.map(col => {
            const colTasks = nonMilestone.filter(t => t.status === col.key)
            return (
              <div key={col.key}>
                <div className={`bg-surface border border-border border-t-2 ${col.top} rounded-xl px-3 py-2 mb-2 flex items-center justify-between`}>
                  <span className="text-xs font-bold text-text-primary">{col.label}</span>
                  <span className="text-2xs bg-background text-text-secondary px-1.5 py-0.5 rounded-full font-semibold">{colTasks.length}</span>
                </div>
                <div className="space-y-1.5">
                  {colTasks.slice(0, 8).map(t => {
                    const assignee = profiles.find(p => p.id === t.assignee_id || p.id === t.assigned_to)
                    const isOverdue = t.status !== 'completato' && !!t.due_date && new Date(t.due_date) < new Date()
                    return (
                      <div key={t.id} className="group bg-surface border border-border rounded-lg p-2.5 hover:border-border-strong transition-colors">
                        <div className="flex items-start gap-1.5 mb-1">
                          <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                            t.priority === 'alta' ? 'bg-error' : t.priority === 'media' ? 'bg-warning' : 'bg-surface-active'
                          }`} />
                          <p className="text-xs text-text-primary leading-snug flex-1">{t.title}</p>
                        </div>
                        <div className="flex items-center gap-1 pl-3">
                          {t.due_date && (
                            <span className={`text-2xs ${isOverdue ? 'text-error font-bold' : 'text-text-secondary'}`}>
                              {formatDate(t.due_date)}
                            </span>
                          )}
                          {assignee && (
                            <span className="text-2xs text-text-secondary truncate max-w-[48px]">
                              {assignee.full_name.split(' ')[0]}
                            </span>
                          )}
                          <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <select value={t.status}
                              onChange={e => onStatusChange(t.id, e.target.value as Task['status'])}
                              onClick={e => e.stopPropagation()}
                              className="text-2xs bg-surface border border-border rounded px-1 py-0.5 text-text-secondary focus:outline-none focus:border-gold cursor-pointer">
                              <option value="da_fare">Da fare</option>
                              <option value="in_corso">In corso</option>
                              <option value="in_revisione">In rev.</option>
                              <option value="completato">Done</option>
                            </select>
                            <button onClick={() => onEdit(t)} className="p-0.5 rounded hover:bg-overlay/5 text-text-secondary hover:text-text-primary">
                              <Pencil className="w-2.5 h-2.5" />
                            </button>
                            <button onClick={() => { if (confirm('Eliminare questa task?')) onDelete(t.id) }}
                              className="p-0.5 rounded hover:bg-error/10 text-text-secondary hover:text-error">
                              <Trash2 className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  {colTasks.length > 8 && (
                    <p className="text-2xs text-text-secondary px-1 pt-0.5">+{colTasks.length - 8} altre</p>
                  )}
                  {colTasks.length === 0 && (
                    <div className="h-14 border border-dashed border-border rounded-lg flex items-center justify-center">
                      <span className="text-2xs text-text-tertiary">Nessuna</span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── SprintPanel ──────────────────────────────────────────────────────────────

function SprintPanel({ project, sprints, tasks, onAdd, onEdit, onDelete }: {
  project: Project; sprints: Sprint[]; tasks: Task[]
  onAdd: () => void; onEdit: (s: Sprint) => void; onDelete: (id: string) => void
}) {
  const [report, setReport] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const projectSprints = sprints
    .filter(s => s.project_id === project.id)
    .sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime())

  const current = projectSprints.find(s => s.status === 'in_corso') ?? projectSprints[0] ?? null

  const generateReport = async () => {
    if (!current) return
    setLoading(true)
    const sprintTasks = tasks.filter(t => t.sprint_id === current.id)
    const res = await fetch('/api/ai/sprint-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project, sprint: current, tasks: sprintTasks }),
    })
    const data = await res.json()
    setReport(data.report ?? 'Errore nella generazione.')
    setLoading(false)
  }

  return (
    <div className="space-y-4">
      {/* Header con bottone nuovo sprint */}
      <div className="flex justify-end">
        <button onClick={onAdd} className="flex items-center gap-1 text-xs font-semibold text-gold-text hover:text-gold-text transition-colors">
          <Plus className="w-3.5 h-3.5" /> Nuovo sprint
        </button>
      </div>

      {!current ? (
        <div className="text-center py-8">
          <p className="text-sm text-text-secondary mb-3">Nessuno sprint creato.</p>
          <button onClick={onAdd} className="text-xs text-gold-text hover:underline">Crea il primo sprint</button>
        </div>
      ) : (() => {
        const sprintTasks = tasks.filter(t => t.sprint_id === current.id)
        const done = sprintTasks.filter(t => t.status === 'completato').length
        const pct  = sprintTasks.length ? Math.round(done / sprintTasks.length * 100) : 0
        return (
          <>
            {/* Sprint corrente */}
            <div className="bg-surface border border-border rounded-xl p-4 group">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`text-2xs font-bold px-2 py-0.5 rounded border ${
                      current.status === 'in_corso'   ? 'bg-gold/10 text-gold-text border-gold/30' :
                      current.status === 'completato' ? 'bg-success/10 text-success border-success/30' :
                      'bg-surface text-text-secondary border-border'
                    }`}>
                      {current.status === 'in_corso' ? 'In corso' : current.status === 'completato' ? 'Completato' : 'Pianificato'}
                    </span>
                    <h3 className="text-sm font-bold text-text-primary">{current.name}</h3>
                    <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => onEdit(current)} className="p-1 rounded hover:bg-overlay/5 text-text-secondary hover:text-text-primary">
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button onClick={() => { if (confirm('Eliminare questo sprint?')) onDelete(current.id) }}
                        className="p-1 rounded hover:bg-error/10 text-text-secondary hover:text-error">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-text-secondary flex items-center gap-1.5">
                    <Calendar className="w-3 h-3" />
                    {formatDate(current.start_date)} → {formatDate(current.end_date)}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-2xl font-black text-gold-text">{pct}%</p>
                  <p className="text-2xs text-text-secondary">{done}/{sprintTasks.length} task</p>
                </div>
              </div>
              <div className="h-2 bg-surface-active rounded-full overflow-hidden mt-3">
                <div className="h-full bg-gold rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
              </div>
            </div>

            {/* AI Report */}
            <div className="border border-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-surface border-b border-border">
                <div className="flex items-center gap-2 text-text-secondary">
                  <Brain className="w-3.5 h-3.5" />
                  <span className="text-xs font-bold uppercase tracking-wider">Report Sprint AI</span>
                </div>
                {!report ? (
                  <button onClick={generateReport} disabled={loading}
                    className="text-xs text-gold-text hover:text-gold-text font-semibold disabled:opacity-50 flex items-center gap-1.5">
                    {loading ? <><Loader2 className="w-3 h-3 animate-spin" />Generando...</> : 'Genera →'}
                  </button>
                ) : (
                  <button onClick={() => setReport(null)} className="text-2xs text-text-secondary hover:text-text-primary">Rigenera</button>
                )}
              </div>
              <div className="px-4 py-3 bg-background">
                {report ? (
                  <p className="text-sm text-text-primary leading-relaxed whitespace-pre-line">{report}</p>
                ) : (
                  <p className="text-xs text-text-secondary">
                    {loading ? 'L\'AI sta analizzando le task dello sprint...' : 'Genera un riassunto leggibile dal cliente: cosa è stato fatto, cosa è in corso, prossimi passi.'}
                  </p>
                )}
              </div>
            </div>

            {/* Sprint precedenti / pianificati */}
            {projectSprints.filter(s => s.id !== current.id).length > 0 && (
              <div>
                <p className="text-2xs text-text-secondary uppercase tracking-wider font-bold mb-2">Altri sprint</p>
                <div className="space-y-1.5">
                  {projectSprints.filter(s => s.id !== current.id).map(s => {
                    const st = tasks.filter(t => t.sprint_id === s.id)
                    const sp = st.length ? Math.round(st.filter(t => t.status === 'completato').length / st.length * 100) : 0
                    return (
                      <div key={s.id} className="group flex items-center gap-3 py-2 border-b border-border last:border-0">
                        <span className="text-xs text-text-secondary flex-1 truncate">{s.name}</span>
                        <span className="text-2xs text-text-secondary hidden sm:block">{formatDate(s.start_date)} → {formatDate(s.end_date)}</span>
                        <span className={`text-xs font-bold ${sp === 100 ? 'text-success' : 'text-text-secondary'}`}>{sp}%</span>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => onEdit(s)} className="p-1 rounded hover:bg-overlay/5 text-text-secondary hover:text-text-primary">
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button onClick={() => { if (confirm('Eliminare questo sprint?')) onDelete(s.id) }}
                            className="p-1 rounded hover:bg-error/10 text-text-secondary hover:text-error">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )
      })()}
    </div>
  )
}

// ─── AgendaSection ────────────────────────────────────────────────────────────

function AgendaSection({ meetings, onAdd }: { meetings: MeetingNote[]; onAdd: () => void }) {
  const now     = new Date()
  const upcoming = meetings.filter(m => new Date(m.date) >= now).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  const past     = meetings.filter(m => new Date(m.date) < now).sort((a, b)  => new Date(b.date).getTime() - new Date(a.date).getTime())
  const [expandedId, setExpandedId] = useState<string | null>(null)

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

      {/* Prossimi appuntamenti */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-gold-text" />
            <span className="text-xs font-bold text-text-primary uppercase tracking-wider">Prossimi Appuntamenti</span>
          </div>
          <button onClick={onAdd} className="text-2xs text-gold-text hover:text-gold-text font-semibold flex items-center gap-1">
            <Plus className="w-3 h-3" /> Aggiungi
          </button>
        </div>
        <div className="p-4">
          {upcoming.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <Calendar className="w-8 h-8 text-text-tertiary" />
              <p className="text-sm text-text-secondary">Nessun appuntamento schedulato</p>
              <button onClick={onAdd} className="text-xs text-gold-text hover:text-gold-text underline underline-offset-2">Aggiungi il primo</button>
            </div>
          ) : (
            <div className="space-y-2">
              {upcoming.slice(0, 3).map((m, i) => {
                const d     = new Date(m.date)
                const isNext = i === 0
                return (
                  <div key={m.id} className={`flex items-start gap-3 p-3 rounded-xl border ${isNext ? 'bg-gold/5 border-gold/25' : 'bg-background border-border'}`}>
                    <div className={`shrink-0 rounded-xl p-2.5 text-center min-w-[48px] ${isNext ? 'bg-gold/15' : 'bg-surface'}`}>
                      <p className={`text-2xs font-bold uppercase tracking-wider ${isNext ? 'text-gold-text' : 'text-text-secondary'}`}>
                        {d.toLocaleDateString('it-IT', { month: 'short' })}
                      </p>
                      <p className={`text-xl font-black leading-tight ${isNext ? 'text-gold-text' : 'text-text-primary'}`}>{d.getDate()}</p>
                    </div>
                    <div className="flex-1 min-w-0 pt-0.5">
                      <p className="text-sm font-semibold text-text-primary truncate">{m.title}</p>
                      {m.attendees && m.attendees.length > 0 && (
                        <p className="text-2xs text-text-secondary mt-0.5 flex items-center gap-1">
                          <Users2 className="w-3 h-3 shrink-0" />
                          <span className="truncate">{m.attendees.join(', ')}</span>
                        </p>
                      )}
                      {m.next_actions && isNext && (
                        <p className="text-2xs text-gold-text mt-1 line-clamp-1">→ {m.next_actions}</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Ultimi incontri */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <FileText className="w-3.5 h-3.5 text-text-secondary" />
            <span className="text-xs font-bold text-text-primary uppercase tracking-wider">Ultimi Incontri</span>
          </div>
        </div>
        <div className="p-4">
          {past.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <MessageSquare className="w-8 h-8 text-text-tertiary" />
              <p className="text-sm text-text-secondary">Nessun incontro registrato.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {past.slice(0, 5).map(m => {
                const isOpen = expandedId === m.id
                return (
                  <div key={m.id} className="border border-border rounded-xl overflow-hidden">
                    <button onClick={() => setExpandedId(isOpen ? null : m.id)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-overlay/[0.02] transition-colors text-left">
                      <div className="w-7 h-7 rounded-lg bg-surface border border-border flex items-center justify-center text-text-secondary shrink-0">
                        <MessageSquare className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-text-primary truncate">{m.title}</p>
                        <p className="text-2xs text-text-secondary">
                          {new Date(m.date).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </p>
                      </div>
                      {isOpen
                        ? <ChevronUp className="w-3.5 h-3.5 text-text-secondary shrink-0" />
                        : <ChevronDown className="w-3.5 h-3.5 text-text-secondary shrink-0" />}
                    </button>

                    {isOpen && (
                      <div className="px-4 pb-4 space-y-2.5 border-t border-border pt-3">
                        {m.summary && (
                          <div>
                            <p className="text-2xs text-text-secondary uppercase tracking-wider font-bold mb-1">Sintesi</p>
                            <p className="text-xs text-text-primary leading-relaxed">{m.summary}</p>
                          </div>
                        )}
                        {m.decisions && (
                          <div>
                            <p className="text-2xs text-text-secondary uppercase tracking-wider font-bold mb-1">Decisioni</p>
                            <p className="text-xs text-text-primary leading-relaxed">{m.decisions}</p>
                          </div>
                        )}
                        {m.next_actions && (
                          <div>
                            <p className="text-2xs text-gold-text uppercase tracking-wider font-bold mb-1">Prossime azioni</p>
                            <p className="text-xs text-text-primary leading-relaxed">{m.next_actions}</p>
                          </div>
                        )}
                        {m.attendees && m.attendees.length > 0 && (
                          <p className="text-2xs text-text-secondary flex items-center gap-1 pt-1">
                            <Users2 className="w-3 h-3 shrink-0" /> {m.attendees.join(', ')}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── ProjectDetail (expanded tabs) ───────────────────────────────────────────

type DetailTab = 'milestone' | 'task' | 'sprint' | 'brief'
const DETAIL_TABS: { key: DetailTab; label: string }[] = [
  { key: 'milestone', label: '🏁 Milestone' },
  { key: 'task',      label: '📋 Task' },
  { key: 'sprint',    label: '⚡ Sprint' },
  { key: 'brief',     label: '📄 Brief' },
]

function ProjectDetail({ project, tasks, sprints, profiles, activeTab, onTabChange,
  briefText, onBriefChange, onSaveBrief, briefSaving, onStatusChange,
  onAddMilestone, onEditMilestone, onDeleteMilestone,
  onAddTask, onEditTask, onDeleteTask,
  onAddSprint, onEditSprint, onDeleteSprint,
}: {
  project: Project; tasks: Task[]; sprints: Sprint[]; profiles: Profile[]
  activeTab: DetailTab; onTabChange: (t: DetailTab) => void
  briefText: string; onBriefChange: (v: string) => void
  onSaveBrief: () => void; briefSaving: boolean
  onStatusChange: (id: string, s: Task['status']) => void
  onAddMilestone: () => void; onEditMilestone: (m: Task) => void; onDeleteMilestone: (id: string) => void
  onAddTask: () => void; onEditTask: (t: Task) => void; onDeleteTask: (id: string) => void
  onAddSprint: () => void; onEditSprint: (s: Sprint) => void; onDeleteSprint: (id: string) => void
}) {
  return (
    <div className="mt-2 bg-surface border border-gold/20 rounded-xl overflow-hidden">
      <div className="flex border-b border-border overflow-x-auto">
        {DETAIL_TABS.map(tab => (
          <button key={tab.key} onClick={() => onTabChange(tab.key)}
            className={`px-4 py-3 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors ${
              activeTab === tab.key ? 'border-gold text-gold-text' : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>
      <div className="p-5">
        {activeTab === 'milestone' && (
          <MilestoneTracker tasks={tasks} onAdd={onAddMilestone} onEdit={onEditMilestone} onDelete={onDeleteMilestone} />
        )}
        {activeTab === 'task' && (
          <MiniTaskBoard tasks={tasks} profiles={profiles} onStatusChange={onStatusChange}
            onAdd={onAddTask} onEdit={onEditTask} onDelete={onDeleteTask} />
        )}
        {activeTab === 'sprint' && (
          <SprintPanel project={project} sprints={sprints} tasks={tasks}
            onAdd={onAddSprint} onEdit={onEditSprint} onDelete={onDeleteSprint} />
        )}
        {activeTab === 'brief' && (
          <div>
            <textarea value={briefText} onChange={e => onBriefChange(e.target.value)} rows={7}
              placeholder="Descrivi il brief del progetto: obiettivi, contesto, vincoli, aspettative del cliente..."
              className="w-full bg-transparent text-sm text-text-primary resize-none outline-none placeholder:text-text-tertiary leading-relaxed" />
            <div className="flex justify-end mt-3 pt-3 border-t border-border">
              <button onClick={onSaveBrief}
                disabled={briefSaving || briefText === (project.brief ?? '')}
                className="text-xs px-4 py-2 bg-gold text-on-gold font-bold rounded-lg disabled:opacity-40 hover:bg-gold/90 transition-colors flex items-center gap-1.5">
                {briefSaving ? <><Loader2 className="w-3 h-3 animate-spin" />Salvataggio...</> : 'Salva brief'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Modals ───────────────────────────────────────────────────────────────────

async function recomputeClientType(supabase: ReturnType<typeof createClient>, clientId: string) {
  const { data: projs } = await supabase
    .from('projects').select('project_kind').eq('client_id', clientId)
  if (!projs) return
  const kinds = new Set(projs.map((p: { project_kind: string | null }) => p.project_kind).filter(Boolean))
  let newType: ClientType
  if (kinds.has('growth') && kinds.has('digital')) newType = 'growth_digital'
  else if (kinds.has('digital')) newType = 'digital'
  else newType = 'growth'
  await supabase.from('clients').update({ client_type: newType }).eq('id', clientId)
}

function KindSelector({ value, onChange }: { value: ProjectKind | ''; onChange: (k: ProjectKind | '') => void }) {
  return (
    <div>
      <label className="block text-xs text-text-secondary mb-2">Natura del progetto *</label>
      <div className="grid grid-cols-2 gap-2">
        {(['growth', 'digital'] as ProjectKind[]).map(k => (
          <button key={k} type="button"
            onClick={() => onChange(value === k ? '' : k)}
            className={`py-3 rounded-xl border text-sm font-bold transition-all ${
              value === k
                ? k === 'growth' ? 'bg-gold/10 border-gold text-gold-text' : 'bg-info/10 border-info text-info'
                : 'bg-background border-border text-text-secondary hover:border-border-strong'
            }`}>
            {k === 'growth' ? '📈 Growth' : '💻 Digital'}
          </button>
        ))}
      </div>
    </div>
  )
}

function ProjectNameField({ prefix, value, onChange, required = false }: {
  prefix: string; value: string; onChange: (v: string) => void; required?: boolean
}) {
  return (
    <div>
      <label className="block text-xs text-text-secondary mb-1">Titolo progetto{required ? ' *' : ''}</label>
      <div className="flex items-center rounded-lg border border-border bg-background focus-within:border-gold overflow-hidden">
        <span className="pl-3 pr-1 text-sm text-text-secondary whitespace-nowrap shrink-0 select-none">{prefix} –</span>
        <input
          required={required}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="es. Campagna Meta Q3 2025"
          className="flex-1 bg-transparent py-2 pr-3 text-sm text-text-primary focus:outline-none min-w-0"
        />
      </div>
      {value && (
        <p className="text-2xs text-text-secondary mt-1">
          Nome completo: <span className="text-text-primary">{prefix} – {value}</span>
        </p>
      )}
    </div>
  )
}

function NewProjectModal({ clientId, clientName, onClose, onCreated }: {
  clientId: string; clientName: string; onClose: () => void
  onCreated: (p: Project, newType: ClientType) => void
}) {
  const [form, setForm] = useState({ title: '', description: '', status: 'attivo' as Project['status'], kind: '' as ProjectKind | '' })
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.kind) { toast.error('Seleziona la natura del progetto (Growth o Digital)'); return }
    if (!form.title.trim()) { toast.error('Inserisci il titolo del progetto'); return }
    setLoading(true)
    const fullName = `${clientName} – ${form.title.trim()}`
    const supabase = createClient()
    const { data, error } = await supabase.from('projects').insert({
      client_id: clientId, name: fullName, description: form.description || null,
      status: form.status, sprint_current: 1, project_kind: form.kind,
    }).select().single()
    if (error) { toast.error('Errore: ' + error.message); setLoading(false); return }
    await recomputeClientType(supabase, clientId)
    const { data: updClient } = await supabase.from('clients').select('client_type').eq('id', clientId).single()
    setLoading(false)
    toast.success('Progetto creato!')
    onCreated(data as Project, (updClient?.client_type ?? 'growth') as ClientType)
  }

  return (
    <div className="fixed inset-0 bg-scrim backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-card w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-bold text-text-primary">Nuovo Progetto</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-text-secondary hover:text-text-primary" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <KindSelector value={form.kind} onChange={k => setForm(p => ({ ...p, kind: k }))} />
          <ProjectNameField prefix={clientName} value={form.title} onChange={v => setForm(p => ({ ...p, title: v }))} required />
          <div>
            <label className="block text-xs text-text-secondary mb-1">Descrizione</label>
            <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              rows={2} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold resize-none" />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">Stato</label>
            <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value as Project['status'] }))}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold">
              <option value="attivo">Attivo</option>
              <option value="in_pausa">In pausa</option>
              <option value="completato">Completato</option>
              <option value="archiviato">Archiviato</option>
            </select>
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-border rounded-lg text-sm text-text-secondary hover:text-text-primary">Annulla</button>
            <button type="submit" disabled={loading} className="flex-1 py-2.5 bg-gold text-on-gold font-bold rounded-lg text-sm hover:bg-gold/90 disabled:opacity-50 flex items-center justify-center gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />} Crea Progetto
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function EditProjectModal({ project, clientId, clientName, onClose, onSaved }: {
  project: Project; clientId: string; clientName: string; onClose: () => void
  onSaved: (updated: Project, newClientType: ClientType) => void
}) {
  const prefix = `${clientName} –`
  const extractTitle = (full: string) => {
    const sep = full.indexOf(' – ')
    return sep >= 0 ? full.slice(sep + 3) : full
  }
  const [form, setForm] = useState({
    title: extractTitle(project.name),
    description: project.description ?? '',
    status: project.status,
    kind: (project.project_kind ?? '') as ProjectKind | '',
    project_type: project.project_type,
  })
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const supabase = createClient()
    const fullName = `${clientName} – ${form.title.trim()}`
    const { data, error } = await supabase.from('projects').update({
      name: fullName,
      description: form.description || null,
      status: form.status,
      project_kind: form.kind || null,
      project_type: form.project_type,
    }).eq('id', project.id).select().single()
    if (error) { toast.error('Errore: ' + error.message); setLoading(false); return }
    if (form.kind) await recomputeClientType(supabase, clientId)
    const { data: updClient } = await supabase.from('clients').select('client_type').eq('id', clientId).single()
    setLoading(false)
    toast.success('Progetto aggiornato')
    onSaved(data as Project, (updClient?.client_type ?? 'growth') as ClientType)
  }

  return (
    <div className="fixed inset-0 bg-scrim backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-card w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-bold text-text-primary">Modifica Progetto</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-text-secondary hover:text-text-primary" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">

          <KindSelector value={form.kind} onChange={k => setForm(p => ({ ...p, kind: k }))} />

          <ProjectNameField prefix={clientName} value={form.title} onChange={v => setForm(p => ({ ...p, title: v }))} required />

          {/* Tipo + Stato */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1">Categoria</label>
              <select value={form.project_type} onChange={e => setForm(p => ({ ...p, project_type: e.target.value as Project['project_type'] }))}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold">
                <option value="ecommerce">🛒 E-commerce</option>
                <option value="lead_gen">🎯 Lead Gen</option>
                <option value="sito_web">🌐 Sito Web</option>
                <option value="app_ai">🤖 App AI</option>
                <option value="campagna">📣 Campagna</option>
                <option value="custom">📁 Custom</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Stato</label>
              <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value as Project['status'] }))}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold">
                <option value="attivo">Attivo</option>
                <option value="in_pausa">In pausa</option>
                <option value="completato">Completato</option>
                <option value="archiviato">Archiviato</option>
              </select>
            </div>
          </div>

          {/* Descrizione */}
          <div>
            <label className="block text-xs text-text-secondary mb-1">Descrizione</label>
            <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              rows={2} placeholder="Contesto e overview del progetto..."
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold resize-none" />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-border rounded-lg text-sm text-text-secondary hover:text-text-primary">Annulla</button>
            <button type="submit" disabled={loading} className="flex-1 py-2.5 bg-gold text-on-gold font-bold rounded-lg text-sm hover:bg-gold/90 disabled:opacity-50 flex items-center justify-center gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />} Salva modifiche
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function NewMeetingModal({ clientId, onClose, onCreated }: { clientId: string; onClose: () => void; onCreated: (m: MeetingNote) => void }) {
  const [form, setForm] = useState({ title: '', date: new Date().toISOString().slice(0, 10), summary: '', decisions: '', next_actions: '', attendees: '' })
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase.from('meeting_notes').insert({
      client_id: clientId, title: form.title, date: form.date,
      summary: form.summary, decisions: form.decisions || null, next_actions: form.next_actions || null,
      attendees: form.attendees ? form.attendees.split(',').map(s => s.trim()) : null, created_by: user?.id,
    }).select().single()
    setLoading(false)
    if (error) { toast.error('Errore: ' + error.message); return }
    toast.success('Recap aggiunto!')
    onCreated(data as MeetingNote)
  }

  return (
    <div className="fixed inset-0 bg-scrim backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-card w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-bold text-text-primary">Nuovo Incontro / Appuntamento</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-text-secondary hover:text-text-primary" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1">Titolo *</label>
              <input required value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                placeholder="es. Call settimanale"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold" />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Data *</label>
              <input type="date" required value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">Partecipanti (separati da virgola)</label>
            <input value={form.attendees} onChange={e => setForm(p => ({ ...p, attendees: e.target.value }))}
              placeholder="es. Marco, Luca, Cliente"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold" />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">Sintesi *</label>
            <textarea required value={form.summary} onChange={e => setForm(p => ({ ...p, summary: e.target.value }))}
              rows={3} placeholder="Cosa è stato discusso / cosa si farà..."
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold resize-none" />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">Decisioni prese</label>
            <textarea value={form.decisions} onChange={e => setForm(p => ({ ...p, decisions: e.target.value }))}
              rows={2} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold resize-none" />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">Prossime azioni</label>
            <textarea value={form.next_actions} onChange={e => setForm(p => ({ ...p, next_actions: e.target.value }))}
              rows={2} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold resize-none" />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-border rounded-lg text-sm text-text-secondary hover:text-text-primary">Annulla</button>
            <button type="submit" disabled={loading} className="flex-1 py-2.5 bg-gold text-on-gold font-bold rounded-lg text-sm hover:bg-gold/90 disabled:opacity-50 flex items-center justify-center gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />} Salva
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── TaskModal (add/edit task or milestone) ───────────────────────────────────

function TaskModal({ projectId, sprints, profiles, task, isMilestone, onClose, onSaved }: {
  projectId: string; sprints: Sprint[]; profiles: Profile[]
  task?: Task; isMilestone: boolean
  onClose: () => void; onSaved: (t: Task) => void
}) {
  const [form, setForm] = useState({
    title:       task?.title ?? '',
    description: task?.description ?? '',
    status:      task?.status ?? (isMilestone ? 'da_fare' : 'da_fare') as Task['status'],
    priority:    task?.priority ?? 'media' as TaskPriority,
    due_date:    task?.due_date?.slice(0, 10) ?? '',
    sprint_id:   task?.sprint_id ?? '',
    assignee_id: task?.assignee_id ?? '',
  })
  const [loading, setLoading] = useState(false)
  const sb = createClient()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim()) { toast.error('Titolo obbligatorio'); return }
    setLoading(true)
    const payload = {
      project_id:   projectId,
      title:        form.title.trim(),
      description:  form.description || null,
      status:       form.status,
      priority:     form.priority,
      due_date:     form.due_date || null,
      sprint_id:    form.sprint_id || null,
      assignee_id:  form.assignee_id || null,
      is_milestone: isMilestone,
    }
    const q = task
      ? sb.from('tasks').update(payload).eq('id', task.id).select().single()
      : sb.from('tasks').insert(payload).select().single()
    const { data, error } = await q
    setLoading(false)
    if (error) { toast.error('Errore: ' + error.message); return }
    toast.success(task ? 'Aggiornato' : (isMilestone ? 'Milestone aggiunta' : 'Task aggiunta'))
    onSaved(data as Task)
  }

  return (
    <div className="fixed inset-0 bg-scrim backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-card w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
            {isMilestone ? <Flag className="w-4 h-4 text-gold-text" /> : null}
            {task ? 'Modifica' : 'Nuova'} {isMilestone ? 'Milestone' : 'Task'}
          </h2>
          <button onClick={onClose}><X className="w-5 h-5 text-text-secondary hover:text-text-primary" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          <div>
            <label className="block text-xs text-text-secondary mb-1">Titolo *</label>
            <input required value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              placeholder={isMilestone ? 'es. MVP pronto' : 'es. Setup campagna Meta Ads'}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold" />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">Descrizione</label>
            <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              rows={2} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1">Stato</label>
              <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value as Task['status'] }))}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold">
                <option value="da_fare">Da fare</option>
                <option value="in_corso">In corso</option>
                <option value="in_revisione">In revisione</option>
                <option value="completato">Completato</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Priorità</label>
              <select value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value as TaskPriority }))}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold">
                <option value="bassa">Bassa</option>
                <option value="media">Media</option>
                <option value="alta">Alta</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1">Scadenza</label>
              <input type="date" value={form.due_date} onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold" />
            </div>
            {!isMilestone && (
              <div>
                <label className="block text-xs text-text-secondary mb-1">Sprint</label>
                <select value={form.sprint_id} onChange={e => setForm(p => ({ ...p, sprint_id: e.target.value }))}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold">
                  <option value="">Nessuno</option>
                  {sprints.filter(s => s.project_id === projectId).map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          {profiles.length > 0 && (
            <div>
              <label className="block text-xs text-text-secondary mb-1">Assegnata a</label>
              <select value={form.assignee_id} onChange={e => setForm(p => ({ ...p, assignee_id: e.target.value }))}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold">
                <option value="">Nessuno</option>
                {profiles.map(pr => <option key={pr.id} value={pr.id}>{pr.full_name}</option>)}
              </select>
            </div>
          )}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-border rounded-lg text-sm text-text-secondary hover:text-text-primary">Annulla</button>
            <button type="submit" disabled={loading} className="flex-1 py-2.5 bg-gold text-on-gold font-bold rounded-lg text-sm hover:bg-gold/90 disabled:opacity-50 flex items-center justify-center gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />} {task ? 'Salva' : 'Aggiungi'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── SprintModal (add/edit) ────────────────────────────────────────────────────

function SprintModal({ projectId, sprint, onClose, onSaved }: {
  projectId: string; sprint?: Sprint
  onClose: () => void; onSaved: (s: Sprint) => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const twoWeeks = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
  const [form, setForm] = useState({
    name:       sprint?.name ?? '',
    start_date: sprint?.start_date?.slice(0, 10) ?? today,
    end_date:   sprint?.end_date?.slice(0, 10) ?? twoWeeks,
    status:     sprint?.status ?? 'pianificato' as SprintStatus,
  })
  const [loading, setLoading] = useState(false)
  const sb = createClient()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) { toast.error('Nome obbligatorio'); return }
    setLoading(true)
    const payload = { project_id: projectId, name: form.name.trim(), start_date: form.start_date, end_date: form.end_date, status: form.status }
    const q = sprint
      ? sb.from('sprints').update(payload).eq('id', sprint.id).select().single()
      : sb.from('sprints').insert(payload).select().single()
    const { data, error } = await q
    setLoading(false)
    if (error) { toast.error('Errore: ' + error.message); return }
    toast.success(sprint ? 'Sprint aggiornato' : 'Sprint creato')
    onSaved(data as Sprint)
  }

  return (
    <div className="fixed inset-0 bg-scrim backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-card w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-bold text-text-primary">{sprint ? 'Modifica Sprint' : 'Nuovo Sprint'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-text-secondary hover:text-text-primary" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs text-text-secondary mb-1">Nome *</label>
            <input required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="es. Sprint 1 – Setup"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1">Inizio</label>
              <input type="date" value={form.start_date} onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold" />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Fine</label>
              <input type="date" value={form.end_date} onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">Stato</label>
            <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value as SprintStatus }))}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold">
              <option value="pianificato">Pianificato</option>
              <option value="in_corso">In corso</option>
              <option value="completato">Completato</option>
            </select>
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-border rounded-lg text-sm text-text-secondary hover:text-text-primary">Annulla</button>
            <button type="submit" disabled={loading} className="flex-1 py-2.5 bg-gold text-on-gold font-bold rounded-lg text-sm hover:bg-gold/90 disabled:opacity-50 flex items-center justify-center gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />} {sprint ? 'Salva' : 'Crea Sprint'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ProjectStatusTab({ client, projects: initialProjects, sprints: initialSprints, tasks, meetings: initialMeetings, profiles = [] }: Props) {
  const [clientType, setClientType] = useState<ClientType>(client.client_type)
  const [projects, setProjects]     = useState(initialProjects)
  const [sprints, setSprints]       = useState(initialSprints)
  const [meetings, setMeetings]     = useState(initialMeetings)
  const [localTasks, setLocalTasks] = useState(tasks)

  const [selectedId, setSelectedId]   = useState<string | null>(null)
  const [activeTab, setActiveTab]     = useState<DetailTab>('milestone')
  const [briefText, setBriefText]     = useState('')
  const [briefSaving, setBriefSaving] = useState(false)

  const [showNewProject, setShowNewProject] = useState(false)
  const [showNewMeeting, setShowNewMeeting] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)

  // task/milestone modal state
  const [taskModal, setTaskModal] = useState<{ task?: Task; isMilestone: boolean } | null>(null)
  // sprint modal state
  const [sprintModal, setSprintModal] = useState<{ sprint?: Sprint } | null>(null)

  const handleSelect = (id: string) => {
    if (selectedId === id) { setSelectedId(null); return }
    setSelectedId(id)
    setActiveTab('milestone')
    setBriefText(projects.find(p => p.id === id)?.brief ?? '')
  }

  const saveBrief = async () => {
    if (!selectedId) return
    setBriefSaving(true)
    const sb = createClient()
    const { error } = await sb.from('projects').update({ brief: briefText, brief_updated_at: new Date().toISOString() }).eq('id', selectedId)
    setBriefSaving(false)
    if (error) { toast.error('Errore nel salvataggio'); return }
    toast.success('Brief salvato')
    setProjects(prev => prev.map(p => p.id === selectedId ? { ...p, brief: briefText, brief_updated_at: new Date().toISOString() } : p))
  }

  const changeTaskStatus = async (taskId: string, newStatus: Task['status']) => {
    setLocalTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t))
    const supabase = createClient()
    const { error } = await supabase.from('tasks').update({ status: newStatus }).eq('id', taskId)
    if (error) { toast.error('Errore'); setLocalTasks(tasks) }
  }

  const handleTaskSaved = (t: Task) => {
    setLocalTasks(prev => {
      const idx = prev.findIndex(x => x.id === t.id)
      return idx >= 0 ? prev.map(x => x.id === t.id ? t : x) : [...prev, t]
    })
    setTaskModal(null)
  }

  const handleTaskDelete = async (id: string) => {
    const sb = createClient()
    const { error } = await sb.from('tasks').delete().eq('id', id)
    if (error) { toast.error('Errore: ' + error.message); return }
    setLocalTasks(prev => prev.filter(t => t.id !== id))
    toast.success('Eliminata')
  }

  const handleSprintSaved = (s: Sprint) => {
    setSprints(prev => {
      const idx = prev.findIndex(x => x.id === s.id)
      return idx >= 0 ? prev.map(x => x.id === s.id ? s : x) : [...prev, s]
    })
    setSprintModal(null)
  }

  const handleSprintDelete = async (id: string) => {
    const sb = createClient()
    const { error } = await sb.from('sprints').delete().eq('id', id)
    if (error) { toast.error('Errore: ' + error.message); return }
    setSprints(prev => prev.filter(s => s.id !== id))
    toast.success('Sprint eliminato')
  }

  const activeProjects = projects.filter(p => p.status === 'attivo')
  const otherProjects  = projects.filter(p => p.status !== 'attivo')

  const renderProjects = (list: Project[]) => list.map(proj => (
    <div key={proj.id}>
      <ProjectCard
        project={proj}
        tasks={localTasks.filter(t => t.project_id === proj.id)}
        sprints={sprints}
        isSelected={selectedId === proj.id}
        onSelect={() => handleSelect(proj.id)}
        onEdit={e => { e.stopPropagation(); setEditingProject(proj) }}
      />
      {selectedId === proj.id && (
        <ProjectDetail
          project={proj}
          tasks={localTasks.filter(t => t.project_id === proj.id)}
          sprints={sprints}
          profiles={profiles}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          briefText={briefText}
          onBriefChange={setBriefText}
          onSaveBrief={saveBrief}
          briefSaving={briefSaving}
          onStatusChange={changeTaskStatus}
          onAddMilestone={() => setTaskModal({ isMilestone: true })}
          onEditMilestone={m => setTaskModal({ task: m, isMilestone: true })}
          onDeleteMilestone={handleTaskDelete}
          onAddTask={() => setTaskModal({ isMilestone: false })}
          onEditTask={t => setTaskModal({ task: t, isMilestone: false })}
          onDeleteTask={handleTaskDelete}
          onAddSprint={() => setSprintModal({})}
          onEditSprint={s => setSprintModal({ sprint: s })}
          onDeleteSprint={handleSprintDelete}
        />
      )}
    </div>
  ))

  return (
    <div className="space-y-6">

      {/* 1 ── Agenda ──────────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-bold text-text-primary mb-3">Agenda</h2>
        <AgendaSection meetings={meetings} onAdd={() => setShowNewMeeting(true)} />
      </section>

      {/* 2 ── Progetti attivi ─────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-bold text-text-primary">
              Progetti Attivi
              {activeProjects.length > 0 && (
                <span className="ml-1.5 text-text-secondary font-normal">({activeProjects.length})</span>
              )}
            </h2>
            {/* Portfolio badge dinamico */}
            {clientType === 'growth' && (
              <span className="text-2xs font-bold px-2 py-0.5 rounded-full bg-gold/10 text-gold-text border border-gold/30">📈 Growth</span>
            )}
            {clientType === 'digital' && (
              <span className="text-2xs font-bold px-2 py-0.5 rounded-full bg-info/10 text-info border border-info/30">💻 Digital</span>
            )}
            {clientType === 'growth_digital' && (
              <span className="text-2xs font-bold px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/30">⚡ Growth + Digital</span>
            )}
          </div>
          <button onClick={() => setShowNewProject(true)}
            className="flex items-center gap-1.5 text-xs font-semibold text-gold-text hover:text-gold-text transition-colors">
            <Plus className="w-3.5 h-3.5" /> Nuovo progetto
          </button>
        </div>

        {activeProjects.length === 0 ? (
          <div className="bg-surface border border-dashed border-border rounded-xl py-12 flex flex-col items-center gap-3">
            <FolderKanban className="w-10 h-10 text-text-tertiary" />
            <p className="text-sm text-text-secondary">Nessun progetto attivo</p>
            <button onClick={() => setShowNewProject(true)} className="text-sm text-gold-text hover:underline">Crea il primo progetto</button>
          </div>
        ) : (
          <div className="space-y-2">{renderProjects(activeProjects)}</div>
        )}
      </section>

      {/* 3 ── Progetti completati / archiviati ───────────────────────────── */}
      {otherProjects.length > 0 && (
        <section>
          <h2 className="text-sm font-bold text-text-secondary mb-3">Progetti completati / archiviati</h2>
          <div className="space-y-2">{renderProjects(otherProjects)}</div>
        </section>
      )}

      {/* Modals */}
      {showNewProject && (
        <NewProjectModal clientId={client.id} clientName={client.company_name} onClose={() => setShowNewProject(false)}
          onCreated={(p, newType) => { setProjects(prev => [...prev, p]); setClientType(newType); setShowNewProject(false) }} />
      )}
      {editingProject && (
        <EditProjectModal
          project={editingProject}
          clientId={client.id}
          clientName={client.company_name}
          onClose={() => setEditingProject(null)}
          onSaved={(updated, newType) => {
            setProjects(prev => prev.map(p => p.id === updated.id ? updated : p))
            setClientType(newType)
            setEditingProject(null)
          }}
        />
      )}
      {showNewMeeting && (
        <NewMeetingModal clientId={client.id} onClose={() => setShowNewMeeting(false)}
          onCreated={m => { setMeetings(prev => [m, ...prev]); setShowNewMeeting(false) }} />
      )}
      {taskModal !== null && selectedId && (
        <TaskModal
          projectId={selectedId}
          sprints={sprints}
          profiles={profiles}
          task={taskModal.task}
          isMilestone={taskModal.isMilestone}
          onClose={() => setTaskModal(null)}
          onSaved={handleTaskSaved}
        />
      )}
      {sprintModal !== null && selectedId && (
        <SprintModal
          projectId={selectedId}
          sprint={sprintModal.sprint}
          onClose={() => setSprintModal(null)}
          onSaved={handleSprintSaved}
        />
      )}
    </div>
  )
}
