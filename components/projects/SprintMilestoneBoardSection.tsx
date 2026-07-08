'use client'

import { useState, useRef } from 'react'
import {
  ChevronDown, ChevronRight, Flag, GripVertical, Plus, Trash2,
  Check, X, Loader2, Calendar, MoreHorizontal, CheckSquare, Square, UserPlus, Users,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { getInitials } from '@/lib/utils'
import type { Profile, Task, Sprint } from '@/lib/types/database'

// ─── Types ────────────────────────────────────────────────────────────────────
export type ExtTask   = Task & { milestone_id?: string | null; parent_id?: string | null; order?: number; is_client_task?: boolean; tags?: string[] }
export type ExtSprint = Sprint & { order?: number }

// ─── Constants ───────────────────────────────────────────────────────────────
const PRIORITY_COLORS: Record<string, string> = { alta: '#EF4444', media: '#F59E0B', bassa: '#6B7280' }
const STATUS_TASK_OPTS   = ['da_fare', 'in_corso', 'in_revisione', 'completato']
const STATUS_TASK_LABEL: Record<string, string>   = { da_fare: 'Da fare', in_corso: 'In corso', in_revisione: 'In revisione', completato: 'Fatto' }
const STATUS_SPRINT_OPTS: Sprint['status'][]      = ['pianificato', 'in_corso', 'completato']
const STATUS_SPRINT_LABEL: Record<string, string> = { pianificato: 'Pianificato', in_corso: 'In corso', completato: 'Completato' }
const PRIORITY_LABELS: Record<string, string>     = { alta: 'Alta', media: 'Media', bassa: 'Bassa' }

// ─── Atoms ───────────────────────────────────────────────────────────────────
function Avatar({ name, size = 18, color = '#F5C800' }: { name: string; size?: number; color?: string }) {
  const ini = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div className="rounded-full flex items-center justify-center shrink-0 font-bold"
      style={{ width: size, height: size, fontSize: size * 0.38, background: `${color}18`, color, border: `1.5px solid ${color}30` }}>
      {ini}
    </div>
  )
}

function ProgressBar({ pct, accent }: { pct: number; accent: string }) {
  const color = pct >= 80 ? '#22C55E' : pct >= 40 ? accent : pct > 0 ? '#F59E0B' : '#1A1A1A'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 bg-[#111] rounded-full overflow-hidden" style={{ minWidth: 40 }}>
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-[10px] font-bold shrink-0" style={{ color: pct === 0 ? '#333' : color }}>{pct}%</span>
    </div>
  )
}

function InlineEdit({ value, onSave, disabled, className }: {
  value: string; onSave: (v: string) => void; disabled?: boolean; className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState(value)
  const ref = useRef<HTMLInputElement>(null)

  const commit = () => {
    setEditing(false)
    const v = draft.trim()
    if (v && v !== value) onSave(v)
    else setDraft(value)
  }

  if (!editing) return (
    <span
      className={`${className} ${!disabled ? 'cursor-text hover:text-white' : ''} transition-colors`}
      onDoubleClick={() => { if (!disabled) { setDraft(value); setEditing(true); setTimeout(() => ref.current?.focus(), 10) } }}
      title={!disabled ? 'Doppio clic per modificare' : undefined}>
      {value}
    </span>
  )

  return (
    <input ref={ref} value={draft} onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setEditing(false); setDraft(value) } }}
      className="bg-transparent border-b focus:outline-none text-white w-full"
      style={{ borderColor: '#F5C800' }} autoFocus />
  )
}

function DatePicker({ value, onChange, disabled, placeholder = 'Nessuna data', accent = '#F5C800', showIcon = true }: {
  value: string | null; onChange: (v: string | null) => void
  disabled?: boolean; placeholder?: string; accent?: string; showIcon?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  const formatted = value
    ? new Date(value).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: '2-digit' })
    : null
  const open = () => { if (!disabled) ref.current?.showPicker?.() ?? ref.current?.click() }
  return (
    <div className={`relative inline-flex items-center gap-1.5 ${disabled ? '' : 'cursor-pointer group/dp'}`} onClick={open}>
      {showIcon && <Calendar className="w-3 h-3 shrink-0 transition-colors" style={{ color: value ? accent : '#2A2A2A' }} />}
      <span className={`text-xs transition-colors ${value ? 'text-[#888] group-hover/dp:text-white' : 'text-[#2A2A2A] group-hover/dp:text-[#444]'}`}>
        {formatted ?? placeholder}
      </span>
      <input ref={ref} type="date" value={value ?? ''}
        onChange={e => onChange(e.target.value || null)}
        className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
        style={{ pointerEvents: disabled ? 'none' : 'auto' }}
        tabIndex={-1} />
    </div>
  )
}

// ─── Task detail modal ────────────────────────────────────────────────────────
function TaskDetailModal({ task, profiles, isAdmin, onSave, onDelete, onClose, accent }: {
  task: ExtTask; profiles: Profile[]; isAdmin: boolean; accent: string
  onSave: (patch: Partial<ExtTask>) => void; onDelete: () => void; onClose: () => void
}) {
  const [form, setForm] = useState({
    title:       task.title,
    priority:    task.priority as string,
    status:      task.status as string,
    due_date:    task.due_date ?? '',
    assignee_id: task.assignee_id ?? '',
  })
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    const patch: Partial<ExtTask> = {
      title:       form.title.trim() || task.title,
      priority:    form.priority as Task['priority'],
      status:      form.status as Task['status'],
      due_date:    form.due_date || null,
      assignee_id: form.assignee_id || null,
    }
    await createClient().from('tasks').update(patch as Record<string, unknown>).eq('id', task.id)
    setSaving(false)
    onSave(patch)
    onClose()
  }

  const inp = 'w-full bg-[#111] border border-[#2A2A2A] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#F5C800]'

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-[#0E0E0E] border border-[#2A2A2A] rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1A1A1A]">
          <h3 className="text-sm font-bold text-white">Dettaglio task</h3>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <button onClick={() => { if (confirm('Eliminare?')) { onDelete(); onClose() } }}
                className="p-1.5 text-[#444] hover:text-[#EF4444] hover:bg-[#EF4444]/10 rounded-lg transition-all">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
            <button onClick={onClose} className="p-1.5 text-[#444] hover:text-white"><X className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-[10px] text-[#444] mb-1.5 uppercase tracking-wider">Titolo</label>
            <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} disabled={!isAdmin} className={inp} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] text-[#444] mb-1.5 uppercase tracking-wider">Priorità</label>
              <select value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))} disabled={!isAdmin} className={inp}>
                {['alta', 'media', 'bassa'].map(v => <option key={v} value={v}>{PRIORITY_LABELS[v]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-[#444] mb-1.5 uppercase tracking-wider">Stato</label>
              <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} disabled={!isAdmin} className={inp}>
                {STATUS_TASK_OPTS.map(v => <option key={v} value={v}>{STATUS_TASK_LABEL[v]}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] text-[#444] mb-1.5 uppercase tracking-wider">Scadenza</label>
              <input type="date" value={form.due_date} onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))} disabled={!isAdmin} className={inp} />
            </div>
            <div>
              <label className="block text-[10px] text-[#444] mb-1.5 uppercase tracking-wider">Assegnato a</label>
              <select value={form.assignee_id} onChange={e => setForm(p => ({ ...p, assignee_id: e.target.value }))} disabled={!isAdmin} className={inp}>
                <option value="">—</option>
                {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
            </div>
          </div>
        </div>
        {isAdmin && (
          <div className="flex gap-3 px-5 pb-5">
            <button onClick={onClose} className="flex-1 py-2.5 border border-[#2A2A2A] rounded-xl text-sm text-[#555] hover:text-white">Annulla</button>
            <button onClick={save} disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-black flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ background: accent }}>
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Salva
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── TaskRow ──────────────────────────────────────────────────────────────────
function TaskRow({ task, allTasks, profiles, isAdmin, depth, projectId, milestoneId, accent, onUpdate, selectedIds, toggleSelect }: {
  task: ExtTask; allTasks: ExtTask[]; profiles: Profile[]; isAdmin: boolean
  depth: number; projectId: string; milestoneId: string; accent: string
  onUpdate: (tasks: ExtTask[]) => void
  selectedIds?: Set<string>; toggleSelect?: (id: string) => void
}) {
  const [expanded, setExpanded]   = useState(false)
  const [addingChild, setAdding]  = useState(false)
  const [addDraft, setAddDraft]   = useState('')
  const [addSaving, setAddSaving] = useState(false)
  const [showDetail, setShowDetail] = useState(false)
  const addRef = useRef<HTMLInputElement>(null)

  const children = allTasks.filter(t => t.parent_id === task.id)
    .sort((a, b) => ((a.order ?? 0) - (b.order ?? 0)))

  const isDone    = task.status === 'completato'
  const isBlocked = task.status === 'in_revisione'
  const isOver    = !isDone && task.due_date && task.due_date < new Date().toISOString().slice(0, 10)
  const assignee  = profiles.find(p => p.id === task.assignee_id)
  const canAdd    = depth < 2 && isAdmin

  const toggleDone = async () => {
    const next: Task['status'] = isDone ? 'da_fare' : 'completato'
    onUpdate(allTasks.map(t => t.id === task.id ? { ...t, status: next } : t))
    await createClient().from('tasks').update({ status: next }).eq('id', task.id)
  }

  const saveField = async (patch: Partial<ExtTask>) => {
    onUpdate(allTasks.map(t => t.id === task.id ? { ...t, ...patch } : t))
    await createClient().from('tasks').update(patch as Record<string, unknown>).eq('id', task.id)
  }

  const deleteTask = async () => {
    const ids = new Set<string>()
    const col = (id: string) => { ids.add(id); allTasks.filter(t => t.parent_id === id).forEach(c => col(c.id)) }
    col(task.id)
    onUpdate(allTasks.filter(t => !ids.has(t.id)))
    await createClient().from('tasks').delete().in('id', Array.from(ids))
    toast.success('Task eliminata')
  }

  const addChild = async () => {
    if (!addDraft.trim()) return
    setAddSaving(true)
    const { data, error } = await createClient().from('tasks').insert({
      project_id: projectId, title: addDraft.trim(), status: 'da_fare',
      priority: 'media', is_milestone: false,
      parent_id: task.id, milestone_id: milestoneId, order: children.length,
    } as never).select().single()
    setAddSaving(false)
    if (error) { toast.error(error.message); return }
    onUpdate([...allTasks, data as ExtTask])
    setAddDraft(''); setAdding(false); setExpanded(true)
    toast.success('Sub-task aggiunto')
  }

  const pl = depth * 18

  return (
    <div>
      <div className={`group flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-[#0D0D0D] transition-colors ${selectedIds?.has(task.id) ? 'bg-[#F5C800]/[0.06] ring-1 ring-[#F5C800]/20' : ''}`}
        style={{ paddingLeft: pl + 12 }}>
        {toggleSelect && (
          <button onClick={() => toggleSelect(task.id)}
            className={`shrink-0 transition-colors ${selectedIds?.has(task.id) ? 'text-[#F5C800]' : 'text-transparent group-hover:text-[#2A2A2A] hover:!text-[#F5C800]'}`}>
            {selectedIds?.has(task.id) ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
          </button>
        )}
        {isAdmin && <GripVertical className="w-3 h-3 text-[#222] group-hover:text-[#444] shrink-0 cursor-grab" />}

        <button onClick={() => setExpanded(e => !e)} className="w-4 shrink-0 flex items-center justify-center text-[#333] hover:text-[#666]">
          {children.length > 0
            ? (expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />)
            : canAdd ? <div className="w-1 h-1 rounded-full bg-[#2A2A2A]" /> : null}
        </button>

        <button onClick={toggleDone}
          className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-all ${
            isDone    ? 'bg-[#22C55E] border-[#22C55E]' :
            isBlocked ? 'border-[#EF4444]' : 'border-[#2A2A2A] hover:border-[#555]'
          }`}>
          {isDone && <Check className="w-2.5 h-2.5 text-black" />}
          {isBlocked && <X className="w-2.5 h-2.5 text-[#EF4444]" />}
        </button>

        <div className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: PRIORITY_COLORS[task.priority] ?? '#2A2A2A' }} />

        <div className="flex-1 min-w-0">
          <InlineEdit
            value={task.title}
            onSave={v => saveField({ title: v })}
            disabled={!isAdmin}
            className={`text-sm block w-full ${isDone ? 'line-through text-[#3A3A3A]' : 'text-white'}`}
          />
        </div>

        <div className="flex items-center gap-1.5 ml-1 shrink-0">
          <div className="hidden md:block">
            <DatePicker
              value={task.due_date}
              onChange={v => saveField({ due_date: v })}
              disabled={!isAdmin}
              placeholder=""
              accent={isOver ? '#EF4444' : '#888'}
            />
          </div>
          {assignee && <Avatar name={assignee.full_name} size={18} color="#60A5FA" />}

          <div className="hidden group-hover:flex items-center gap-0.5">
            <button onClick={() => setShowDetail(true)}
              className="p-1 rounded text-[#333] hover:text-white hover:bg-white/5 transition-colors">
              <MoreHorizontal className="w-3 h-3" />
            </button>
            {canAdd && (
              <button onClick={() => { setAdding(true); setExpanded(true); setTimeout(() => addRef.current?.focus(), 30) }}
                className="p-1 rounded text-[#333] hover:text-white hover:bg-white/5 transition-colors" title="Aggiungi sub-task">
                <Plus className="w-3 h-3" />
              </button>
            )}
            {isAdmin && (
              <button onClick={() => { if (confirm('Eliminare task e sub-task?')) deleteTask() }}
                className="p-1 rounded text-[#333] hover:text-[#EF4444] hover:bg-[#EF4444]/10 transition-colors">
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {expanded && children.map(c => (
        <TaskRow key={c.id} task={c} allTasks={allTasks} profiles={profiles}
          isAdmin={isAdmin} depth={depth + 1} projectId={projectId} milestoneId={milestoneId}
          accent={accent} onUpdate={onUpdate} selectedIds={selectedIds} toggleSelect={toggleSelect} />
      ))}

      {expanded && addingChild && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl" style={{ paddingLeft: (depth + 1) * 18 + 12 }}>
          <div className="w-3 shrink-0" />
          <div className="w-4 h-4 rounded border border-[#2A2A2A] shrink-0" />
          <div className="w-1.5 h-1.5 rounded-full bg-[#2A2A2A] shrink-0" />
          <input ref={addRef} value={addDraft} onChange={e => setAddDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addChild(); if (e.key === 'Escape') { setAdding(false); setAddDraft('') } }}
            placeholder="Sub-task… (Invio)"
            className="flex-1 bg-transparent text-sm text-white focus:outline-none placeholder:text-[#2A2A2A]" />
          <button onClick={addChild} disabled={addSaving || !addDraft.trim()} className="p-1 text-[#22C55E] disabled:opacity-40">
            {addSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
          </button>
          <button onClick={() => { setAdding(false); setAddDraft('') }} className="p-1 text-[#444] hover:text-white"><X className="w-3 h-3" /></button>
        </div>
      )}

      {showDetail && (
        <TaskDetailModal task={task} profiles={profiles} isAdmin={isAdmin} accent={accent}
          onSave={patch => saveField(patch)}
          onDelete={deleteTask}
          onClose={() => setShowDetail(false)} />
      )}
    </div>
  )
}

// ─── MilestoneBlock ───────────────────────────────────────────────────────────
function MilestoneBlock({ milestone, allTasks, profiles, isAdmin, projectId, accent, onUpdate, selectedIds, toggleSelect }: {
  milestone: ExtTask; allTasks: ExtTask[]; profiles: Profile[]
  isAdmin: boolean; projectId: string; accent: string
  selectedIds?: Set<string>; toggleSelect?: (id: string) => void
  onUpdate: (t: ExtTask[]) => void
}) {
  const [open, setOpen]         = useState(true)
  const [addingTask, setAdding] = useState(false)
  const [taskDraft, setDraft]   = useState('')
  const [saving, setSaving]     = useState(false)
  const addRef = useRef<HTMLInputElement>(null)

  const tasks = allTasks
    .filter(t => !t.is_milestone && t.milestone_id === milestone.id && !t.parent_id)
    .sort((a, b) => ((a.order ?? 0) - (b.order ?? 0)))

  const done   = tasks.filter(t => t.status === 'completato').length
  const isDone = milestone.status === 'completato'
  const isOver = !isDone && milestone.due_date && milestone.due_date < new Date().toISOString().slice(0, 10)
  const milColor = isDone ? '#22C55E' : isOver ? '#EF4444' : accent
  const assignee = profiles.find(p => p.id === milestone.assignee_id)

  const saveField = async (patch: Partial<ExtTask>) => {
    onUpdate(allTasks.map(t => t.id === milestone.id ? { ...t, ...patch } : t))
    await createClient().from('tasks').update(patch as Record<string, unknown>).eq('id', milestone.id)
  }

  const deleteMilestone = async () => {
    if (!confirm('Eliminare milestone e tutti i task?')) return
    const ids = new Set<string>()
    const col = (id: string) => { ids.add(id); allTasks.filter(t => t.parent_id === id || t.milestone_id === id).forEach(c => col(c.id)) }
    col(milestone.id)
    onUpdate(allTasks.filter(t => !ids.has(t.id)))
    await createClient().from('tasks').delete().in('id', Array.from(ids))
    toast.success('Milestone eliminata')
  }

  const addTask = async () => {
    if (!taskDraft.trim()) return
    setSaving(true)
    const { data, error } = await createClient().from('tasks').insert({
      project_id: projectId, title: taskDraft.trim(), status: 'da_fare',
      priority: 'media', is_milestone: false, milestone_id: milestone.id, order: tasks.length,
    } as never).select().single()
    setSaving(false)
    if (error) { toast.error(error.message); return }
    onUpdate([...allTasks, data as ExtTask])
    setDraft(''); setAdding(false)
  }

  return (
    <div className="rounded-xl border transition-all mb-1.5"
      style={{ borderColor: open ? `${milColor}20` : '#1A1A1A' }}>
      <div className={`group flex items-center gap-2 px-3 py-2.5 rounded-xl transition-colors ${open ? 'bg-[#0C0C0C]' : 'bg-[#090909] hover:bg-[#0C0C0C]'}`}>
        {isAdmin && <GripVertical className="w-3 h-3 text-[#1A1A1A] group-hover:text-[#333] shrink-0 cursor-grab transition-colors" />}

        <button onClick={() => setOpen(o => !o)} className="shrink-0 transition-colors" style={{ color: isDone ? '#22C55E30' : '#2A2A2A' }}>
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>

        <button onClick={() => isAdmin && saveField({ status: isDone ? 'da_fare' : 'completato' })}
          className={`shrink-0 transition-all hover:scale-110 ${isAdmin ? 'cursor-pointer' : ''}`}>
          <Flag className="w-3.5 h-3.5" style={{ color: milColor }} fill={isDone ? milColor : 'none'} />
        </button>

        <div className="flex-1 min-w-0">
          <InlineEdit
            value={milestone.title}
            onSave={v => saveField({ title: v })}
            disabled={!isAdmin}
            className={`text-sm font-semibold block w-full ${isDone ? 'line-through text-[#333]' : 'text-[#ddd]'}`}
          />
        </div>

        <div className="flex items-center gap-2 ml-1 shrink-0">
          {tasks.length > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{
                background: done === tasks.length ? '#22C55E18' : '#1A1A1A',
                color: done === tasks.length ? '#22C55E' : '#444',
              }}>
              {done}/{tasks.length}
            </span>
          )}
          <div className="hidden sm:block">
            <DatePicker
              value={milestone.due_date}
              onChange={v => isAdmin && saveField({ due_date: v })}
              disabled={!isAdmin}
              placeholder="Scadenza"
              accent={isOver ? '#EF4444' : accent}
            />
          </div>
          {assignee && <Avatar name={assignee.full_name} size={18} color={accent} />}
          {isAdmin && (
            <button onClick={deleteMilestone}
              className="p-1 rounded opacity-0 group-hover:opacity-100 transition-all text-[#222] hover:text-[#EF4444] hover:bg-[#EF4444]/10">
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="px-2 pb-2 pt-1">
          {tasks.map(t => (
            <TaskRow key={t.id} task={t} allTasks={allTasks} profiles={profiles}
              isAdmin={isAdmin} depth={0} projectId={projectId} milestoneId={milestone.id}
              accent={accent} onUpdate={onUpdate} selectedIds={selectedIds} toggleSelect={toggleSelect} />
          ))}

          {addingTask ? (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl">
              <div className="w-4 h-4 rounded border border-[#2A2A2A] shrink-0" />
              <div className="w-1.5 h-1.5 rounded-full bg-[#2A2A2A] shrink-0" />
              <input ref={addRef} value={taskDraft} onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addTask(); if (e.key === 'Escape') { setAdding(false); setDraft('') } }}
                placeholder="Nuova task… (Invio)"
                className="flex-1 bg-transparent text-sm text-white focus:outline-none placeholder:text-[#2A2A2A]"
                autoFocus />
              <button onClick={addTask} disabled={saving || !taskDraft.trim()} className="p-1 text-[#22C55E] disabled:opacity-40">
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              </button>
              <button onClick={() => { setAdding(false); setDraft('') }} className="p-1 text-[#444] hover:text-white"><X className="w-3 h-3" /></button>
            </div>
          ) : isAdmin && (
            <button onClick={() => { setAdding(true); setTimeout(() => addRef.current?.focus(), 30) }}
              className="flex items-center gap-1.5 w-full px-3 py-1.5 text-[10px] text-[#2A2A2A] hover:text-[#555] transition-colors">
              <Plus className="w-3 h-3" /> Aggiungi task
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── SprintBlock ──────────────────────────────────────────────────────────────
function SprintBlock({ sprint, allTasks, profiles, isAdmin, projectId, accent, sprintIndex, onUpdateTasks, onUpdateSprint, onDeleteSprint, selectedIds, toggleSelect }: {
  sprint: ExtSprint; allTasks: ExtTask[]; profiles: Profile[]
  isAdmin: boolean; projectId: string; accent: string; sprintIndex: number
  onUpdateTasks: (t: ExtTask[]) => void
  onUpdateSprint: (s: ExtSprint) => void
  onDeleteSprint: (id: string) => void
  selectedIds?: Set<string>; toggleSelect?: (id: string) => void
}) {
  const [open, setOpen]     = useState(true)
  const [addingM, setAddM]  = useState(false)
  const [mDraft, setMDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const addRef = useRef<HTMLInputElement>(null)

  const milestones = allTasks
    .filter(t => t.is_milestone && t.sprint_id === sprint.id)
    .sort((a, b) => ((a.order ?? 0) - (b.order ?? 0)))

  const allTasksInSprint = allTasks.filter(t => {
    if (t.is_milestone) return false
    const mid = t.milestone_id
    return mid ? milestones.some(m => m.id === mid) : false
  })
  const done  = allTasksInSprint.filter(t => !t.parent_id && t.status === 'completato').length
  const total = allTasksInSprint.filter(t => !t.parent_id).length
  const pct   = total ? Math.round(done / total * 100) : 0

  const isActive = sprint.status === 'in_corso'
  const isDone   = sprint.status === 'completato'

  const saveField = async (patch: Partial<ExtSprint>) => {
    onUpdateSprint({ ...sprint, ...patch })
    await createClient().from('sprints').update(patch as Record<string, unknown>).eq('id', sprint.id)
  }

  const addMilestone = async () => {
    if (!mDraft.trim()) return
    setSaving(true)
    const { data, error } = await createClient().from('tasks').insert({
      project_id: projectId, title: mDraft.trim(), status: 'da_fare', priority: 'media',
      is_milestone: true, sprint_id: sprint.id, order: milestones.length,
    } as never).select().single()
    setSaving(false)
    if (error) { toast.error(error.message); return }
    onUpdateTasks([...allTasks, data as ExtTask])
    setMDraft(''); setAddM(false)
  }

  const borderColor  = isDone ? '#22C55E25' : isActive ? `${accent}35` : '#1A1A1A'
  const accentColor  = isDone ? '#22C55E' : isActive ? accent : '#3A3A3A'

  return (
    <div className="rounded-2xl overflow-hidden mb-3" style={{ border: `1px solid ${borderColor}` }}>
      {/* Sprint header */}
      <div className="group" style={{ background: isDone ? '#22C55E06' : isActive ? `${accent}06` : '#0A0A0A', borderBottom: open ? `1px solid ${borderColor}` : 'none' }}>
        <div className="h-0.5 w-full" style={{ background: `linear-gradient(90deg, ${accentColor}60, transparent)` }} />
        <div className="flex items-center gap-2.5 px-4 py-3">
          {isAdmin && <GripVertical className="w-3.5 h-3.5 text-[#1A1A1A] group-hover:text-[#333] shrink-0 cursor-grab transition-colors" />}

          <button onClick={() => setOpen(o => !o)} className="shrink-0 transition-colors" style={{ color: isDone ? '#22C55E' : '#444' }}>
            {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>

          <div className="w-6 h-6 rounded-md flex items-center justify-center text-[9px] font-black shrink-0"
            style={{ background: `${accentColor}15`, color: accentColor }}>
            {sprintIndex + 1}
          </div>

          <div className="flex-1 min-w-0">
            <InlineEdit
              value={sprint.name}
              onSave={v => saveField({ name: v })}
              disabled={!isAdmin}
              className={`text-sm font-bold block w-full ${isDone ? 'text-[#22C55E]' : isActive ? 'text-white' : 'text-[#555]'}`}
            />
          </div>

          {isAdmin ? (
            <select value={sprint.status}
              onChange={e => saveField({ status: e.target.value as Sprint['status'] })}
              onClick={e => e.stopPropagation()}
              className="text-[10px] font-bold px-2 py-1 rounded-lg border focus:outline-none bg-transparent cursor-pointer shrink-0"
              style={{ borderColor: `${accentColor}30`, color: accentColor }}>
              {STATUS_SPRINT_OPTS.map(v => <option key={v} value={v} className="bg-[#111] text-white">{STATUS_SPRINT_LABEL[v]}</option>)}
            </select>
          ) : (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
              style={{ background: `${accentColor}12`, color: accentColor }}>
              {STATUS_SPRINT_LABEL[sprint.status]}
            </span>
          )}

          <div className="hidden lg:flex items-center gap-1.5 shrink-0">
            <DatePicker value={sprint.start_date.slice(0, 10)} onChange={v => v && saveField({ start_date: v })} disabled={!isAdmin} placeholder="Inizio" accent={accentColor} showIcon={false} />
            <span className="text-[#2A2A2A] text-xs">→</span>
            <DatePicker value={sprint.end_date.slice(0, 10)} onChange={v => v && saveField({ end_date: v })} disabled={!isAdmin} placeholder="Fine" accent={accentColor} showIcon={false} />
          </div>

          {total > 0 && (
            <div className="hidden sm:flex items-center gap-1.5 w-20 shrink-0">
              <ProgressBar pct={pct} accent={accentColor} />
            </div>
          )}

          {isAdmin && (
            <button onClick={e => { e.stopPropagation(); if (confirm('Eliminare sprint e tutto il contenuto?')) onDeleteSprint(sprint.id) }}
              className="p-1.5 rounded-lg text-[#1A1A1A] hover:text-[#EF4444] hover:bg-[#EF4444]/10 opacity-0 group-hover:opacity-100 transition-all">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="p-3 space-y-1.5 bg-[#050505]">
          {milestones.length === 0 && !addingM && (
            <div className="flex flex-col items-center gap-1.5 py-6 text-center">
              <Flag className="w-5 h-5 text-[#1A1A1A]" />
              <p className="text-xs text-[#2A2A2A]">Nessuna milestone in questo sprint</p>
            </div>
          )}

          {milestones.map(m => (
            <MilestoneBlock key={m.id} milestone={m} allTasks={allTasks} profiles={profiles}
              isAdmin={isAdmin} projectId={projectId} accent={accent} onUpdate={onUpdateTasks}
              selectedIds={selectedIds} toggleSelect={toggleSelect} />
          ))}

          {addingM ? (
            <div className="flex items-center gap-2 px-3 py-2.5 border border-dashed rounded-xl"
              style={{ borderColor: `${accent}30`, background: `${accent}05` }}>
              <Flag className="w-3.5 h-3.5 shrink-0" style={{ color: accent }} />
              <input ref={addRef} value={mDraft} onChange={e => setMDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addMilestone(); if (e.key === 'Escape') { setAddM(false); setMDraft('') } }}
                placeholder="Nome milestone… premi Invio"
                className="flex-1 bg-transparent text-sm text-white focus:outline-none placeholder:text-[#2A2A2A]"
                autoFocus />
              <button onClick={addMilestone} disabled={saving || !mDraft.trim()} className="p-1 text-[#22C55E] disabled:opacity-40">
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              </button>
              <button onClick={() => { setAddM(false); setMDraft('') }} className="p-1 text-[#444] hover:text-white"><X className="w-3 h-3" /></button>
            </div>
          ) : isAdmin && (
            <button onClick={() => { setAddM(true); setTimeout(() => addRef.current?.focus(), 30) }}
              className="flex items-center gap-2 w-full px-3 py-2 text-xs text-[#2A2A2A] hover:text-[#666] border border-dashed border-[#111] hover:border-[#2A2A2A] rounded-xl transition-all">
              <Flag className="w-3 h-3" /> Aggiungi milestone
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── AssignModal ─────────────────────────────────────────────────────────────
function AssignModal({ profiles, assigning, onConfirm, onClose }: {
  profiles: Profile[]; assigning: boolean
  onConfirm: (ids: string[]) => void; onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const filtered = profiles.filter(p => p.full_name?.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-[#0E0E0E] border border-[#2A2A2A] rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1A1A1A]">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-[#F5C800]" /> Assegna task
          </h3>
          <button onClick={onClose} className="p-1.5 text-[#444] hover:text-white"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-3">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Cerca risorsa…"
            className="w-full bg-[#111] border border-[#2A2A2A] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#F5C800] placeholder:text-[#333]" />
          <div className="max-h-48 overflow-y-auto space-y-1">
            {filtered.map(p => {
              const on = selected.has(p.id)
              return (
                <button key={p.id}
                  onClick={() => { const n = new Set(selected); if (on) n.delete(p.id); else n.add(p.id); setSelected(n) }}
                  className={`flex items-center gap-3 w-full px-3 py-2 rounded-xl text-left transition-colors ${on ? 'bg-[#F5C800]/10 ring-1 ring-[#F5C800]/20' : 'hover:bg-white/5'}`}>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                    style={{ background: on ? '#F5C800' : '#1A1A1A', color: on ? '#000' : '#555' }}>
                    {getInitials(p.full_name || '')}
                  </div>
                  <span className={`text-sm ${on ? 'text-[#F5C800] font-semibold' : 'text-[#999]'}`}>{p.full_name}</span>
                  <div className="flex-1" />
                  {on ? <CheckSquare className="w-4 h-4 text-[#F5C800]" /> : <Square className="w-4 h-4 text-[#2A2A2A]" />}
                </button>
              )
            })}
          </div>
          <button
            onClick={() => onConfirm(Array.from(selected))}
            disabled={selected.size === 0 || assigning}
            className="w-full py-2.5 rounded-xl text-sm font-bold text-black bg-[#F5C800] disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
            {assigning ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            Assegna a {selected.size || '…'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function SprintMilestoneBoardSection({ tasks: initialTasks, sprints: initialSprints, profiles, projectId, isAdmin = true, accent = '#F5C800' }: {
  tasks: ExtTask[]; sprints: ExtSprint[]
  profiles: Profile[]; projectId: string
  isAdmin?: boolean; accent?: string
}) {
  const [allTasks, setAllTasks]     = useState<ExtTask[]>(initialTasks)
  const [allSprints, setAllSprints] = useState<ExtSprint[]>(initialSprints)
  const [addingSprint, setAddingSprint] = useState(false)
  const [sprintDraft, setSprintDraft]   = useState({ name: '', start: '', end: '' })
  const [saving, setSaving] = useState(false)
  const addRef = useRef<HTMLInputElement>(null)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [assigning, setAssigning] = useState(false)

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const bulkAssign = async (profileIds: string[]) => {
    setAssigning(true)
    const rows = Array.from(selectedIds).flatMap(taskId =>
      profileIds.map(profileId => ({ task_id: taskId, profile_id: profileId, role: 'assignee' }))
    )
    const { error } = await createClient().from('task_assignees').upsert(rows, { onConflict: 'task_id,profile_id' })
    setAssigning(false)
    if (error) { toast.error(error.message); return }
    toast.success(`Assegnate ${selectedIds.size} task a ${profileIds.length} risorsa/e`)
    setSelectedIds(new Set())
    setShowAssignModal(false)
  }

  const updateSprint = (s: ExtSprint) =>
    setAllSprints(prev => prev.map(x => x.id === s.id ? s : x))

  const deleteSprint = async (id: string) => {
    const taskIds = new Set<string>()
    const col = (tid: string) => { taskIds.add(tid); allTasks.filter(t => t.parent_id === tid || t.milestone_id === tid).forEach(c => col(c.id)) }
    allTasks.filter(t => t.sprint_id === id).forEach(t => col(t.id))
    setAllSprints(prev => prev.filter(s => s.id !== id))
    setAllTasks(prev => prev.filter(t => !taskIds.has(t.id)))
    await createClient().from('sprints').delete().eq('id', id)
    await createClient().from('tasks').delete().in('id', Array.from(taskIds))
    toast.success('Sprint eliminato')
  }

  const addSprint = async () => {
    if (!sprintDraft.name.trim() || !sprintDraft.start || !sprintDraft.end) return
    setSaving(true)
    const { data, error } = await createClient().from('sprints').insert({
      project_id: projectId, name: sprintDraft.name.trim(),
      start_date: sprintDraft.start, end_date: sprintDraft.end,
      status: 'pianificato', order: allSprints.length,
    }).select().single()
    setSaving(false)
    if (error) { toast.error(error.message); return }
    setAllSprints(prev => [...prev, data as ExtSprint])
    setSprintDraft({ name: '', start: '', end: '' })
    setAddingSprint(false)
    toast.success('Sprint creato')
  }

  if (allSprints.length === 0 && allTasks.filter(t => !t.is_milestone).length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <Flag className="w-8 h-8 text-[#1A1A1A]" />
        <div>
          <p className="text-sm text-[#444] font-semibold">Nessuno sprint creato</p>
          <p className="text-xs text-[#2A2A2A] mt-0.5">Crea il primo sprint per organizzare il lavoro</p>
        </div>
        {isAdmin && (
          <button onClick={() => { setAddingSprint(true); setTimeout(() => addRef.current?.focus(), 30) }}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl text-black"
            style={{ background: accent }}>
            <Plus className="w-3.5 h-3.5" /> Nuovo Sprint
          </button>
        )}
      </div>
    )
  }

  return (
    <div>
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 mb-3 rounded-xl bg-[#F5C800]/10 border border-[#F5C800]/20">
          <span className="text-sm font-bold text-[#F5C800]">{selectedIds.size} selezionate</span>
          <button onClick={() => setSelectedIds(new Set())}
            className="text-xs text-[#888] hover:text-white transition-colors">Deseleziona</button>
          <div className="flex-1" />
          <button onClick={() => setShowAssignModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-black bg-[#F5C800] hover:bg-[#F5C800]/90 transition-colors">
            <UserPlus className="w-3.5 h-3.5" /> Assegna a…
          </button>
        </div>
      )}

      {allSprints.map((s, i) => (
        <SprintBlock
          key={s.id} sprint={s} allTasks={allTasks} profiles={profiles}
          isAdmin={isAdmin} projectId={projectId} accent={accent} sprintIndex={i}
          onUpdateTasks={setAllTasks}
          onUpdateSprint={updateSprint}
          onDeleteSprint={deleteSprint}
          selectedIds={selectedIds}
          toggleSelect={toggleSelect}
        />
      ))}

      {isAdmin && (
        addingSprint ? (
          <div className="border border-dashed rounded-2xl p-4 space-y-3" style={{ borderColor: `${accent}30` }}>
            <input ref={addRef} value={sprintDraft.name} onChange={e => setSprintDraft(p => ({ ...p, name: e.target.value }))}
              placeholder="Nome sprint…"
              className="w-full bg-transparent border-b text-sm text-white focus:outline-none placeholder:text-[#2A2A2A]"
              style={{ borderColor: accent }} />
            <div className="flex items-center gap-3">
              <input type="date" value={sprintDraft.start} onChange={e => setSprintDraft(p => ({ ...p, start: e.target.value }))}
                className="flex-1 bg-[#111] border border-[#2A2A2A] rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none" />
              <span className="text-[#333] text-xs">→</span>
              <input type="date" value={sprintDraft.end} onChange={e => setSprintDraft(p => ({ ...p, end: e.target.value }))}
                className="flex-1 bg-[#111] border border-[#2A2A2A] rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none" />
            </div>
            <div className="flex gap-2">
              <button onClick={addSprint} disabled={saving || !sprintDraft.name.trim() || !sprintDraft.start || !sprintDraft.end}
                className="flex-1 py-2 rounded-xl text-xs font-bold text-black disabled:opacity-50 flex items-center justify-center gap-1.5"
                style={{ background: accent }}>
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Crea Sprint
              </button>
              <button onClick={() => { setAddingSprint(false); setSprintDraft({ name: '', start: '', end: '' }) }}
                className="px-4 py-2 rounded-xl text-xs text-[#444] hover:text-white border border-[#2A2A2A]">
                Annulla
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => { setAddingSprint(true); setTimeout(() => addRef.current?.focus(), 30) }}
            className="flex items-center gap-2 w-full px-4 py-3 text-xs text-[#2A2A2A] hover:text-[#666] border border-dashed border-[#111] hover:border-[#2A2A2A] rounded-2xl transition-all">
            <Plus className="w-3.5 h-3.5" /> Aggiungi sprint
          </button>
        )
      )}

      {showAssignModal && (
        <AssignModal
          profiles={profiles}
          assigning={assigning}
          onConfirm={bulkAssign}
          onClose={() => setShowAssignModal(false)}
        />
      )}
    </div>
  )
}
