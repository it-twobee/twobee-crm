'use client'

import { useState } from 'react'
import {
  Plus, Check, Trash2, Loader2, ChevronDown, ChevronRight,
  Calendar, Star, Sparkles, ListChecks, PenLine, RefreshCw,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { CLIENT_TASK_TEMPLATES, PHASE_COLOR, type ClientTaskTemplate } from '@/lib/reparti-constants'
import type { Task, Project, Client } from '@/lib/types/database'

interface Props {
  project: Project
  client: Client
  isAdmin: boolean
  accent: string
}

interface ClientTask extends Task {
  is_client_task: boolean
}

type Suggestion = ClientTaskTemplate

type AddMode = 'closed' | 'picker' | 'manuale' | 'template' | 'ai'

export function ClientPlanSection({ project, client, isAdmin, accent }: Props) {
  const [tasks, setTasks]       = useState<ClientTask[]>([])
  const [loaded, setLoaded]     = useState(false)
  const [loading, setLoading]   = useState(true)
  const [newTitle, setNewTitle]  = useState('')
  const [newDue, setNewDue]     = useState('')
  const [newHint, setNewHint]   = useState('')
  const [adding, setAdding]     = useState(false)
  const [addMode, setAddMode]   = useState<AddMode>('closed')
  const [editId, setEditId]     = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDue, setEditDue]   = useState('')
  const [editHint, setEditHint] = useState('')
  const [saving, setSaving]     = useState(false)
  const [showCompleted, setShowCompleted] = useState(false)

  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [selected, setSelected]       = useState<Set<number>>(new Set())
  const [aiLoading, setAiLoading]     = useState(false)

  const sb = createClient()

  if (!loaded) {
    setLoaded(true)
    sb.from('tasks')
      .select('*')
      .eq('project_id', project.id)
      .eq('is_client_task', true)
      .order('position')
      .then(({ data }) => {
        setTasks((data ?? []) as ClientTask[])
        setLoading(false)
      })
  }

  const pending   = tasks.filter(t => t.status !== 'completato')
  const completed = tasks.filter(t => t.status === 'completato')

  const closeAdd = () => {
    setAddMode('closed')
    setNewTitle(''); setNewDue(''); setNewHint('')
    setSuggestions([]); setSelected(new Set())
  }

  const addTask = async () => {
    if (!newTitle.trim() || adding) return
    setAdding(true)
    const { data, error } = await sb.from('tasks').insert({
      project_id: project.id,
      title: newTitle.trim(),
      description: newHint.trim() || null,
      status: 'da_fare',
      priority: 'media',
      is_client_task: true,
      is_milestone: false,
      due_date: newDue || null,
      position: tasks.length,
      tags: [],
      logged_hours: 0,
      depth: 0,
    }).select().single()
    setAdding(false)
    if (error) { toast.error(error.message); return }
    setTasks(prev => [...prev, data as ClientTask])
    closeAdd()
    toast.success('Task aggiunta al piano cliente')
  }

  const addBulkTasks = async (items: Suggestion[]) => {
    if (items.length === 0 || adding) return
    setAdding(true)
    const rows = items.map((it, i) => ({
      project_id: project.id,
      title: it.title,
      description: it.hint?.trim() || null,
      status: 'da_fare' as const,
      priority: it.priority ?? 'media',
      is_client_task: true,
      is_milestone: false,
      due_date: null,
      position: tasks.length + i,
      tags: [it.category, it.phase].filter(Boolean),
      logged_hours: 0,
      depth: 0,
    }))
    const { data, error } = await sb.from('tasks').insert(rows).select()
    setAdding(false)
    if (error) { toast.error(error.message); return }
    setTasks(prev => [...prev, ...((data ?? []) as ClientTask[])])
    closeAdd()
    toast.success(`${items.length} task aggiunte al piano cliente`)
  }

  const generateWithAi = async () => {
    setAiLoading(true)
    setSuggestions([])
    try {
      const res = await fetch('/api/reparti/client-tasks-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: project.name,
          projectType: project.project_type,
          clientName: client.company_name,
          existingTasks: tasks.map(t => ({ title: t.title, phase: (t.tags ?? []).find(x => ['onboarding', 'build', 'lancio'].includes(x)) ?? '', category: '' })),
        }),
      })
      const data = await res.json()
      const items = (data.tasks ?? []) as Suggestion[]
      setSuggestions(items)
      setSelected(new Set(items.map((_, i) => i)))
      if (items.length === 0) toast.error('Nessun suggerimento generato')
    } catch {
      toast.error('Errore nella generazione AI')
    } finally {
      setAiLoading(false)
    }
  }

  const openTemplate = () => {
    const items = CLIENT_TASK_TEMPLATES[project.project_type] ?? CLIENT_TASK_TEMPLATES.custom
    setSuggestions(items)
    setSelected(new Set(items.map((_, i) => i)))
    setAddMode('template')
  }

  const toggleSelected = (i: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i); else next.add(i)
      return next
    })
  }

  const toggleStatus = async (task: ClientTask) => {
    const next = task.status === 'completato' ? 'da_fare' : 'completato'
    const { error } = await sb.from('tasks').update({ status: next }).eq('id', task.id)
    if (error) { toast.error(error.message); return }
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: next } : t))
    if (next === 'completato') toast.success('Completata!')
  }

  const deleteTask = async (id: string) => {
    const { error } = await sb.from('tasks').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    setTasks(prev => prev.filter(t => t.id !== id))
    toast.success('Eliminata')
  }

  const startEdit = (t: ClientTask) => {
    setEditId(t.id)
    setEditTitle(t.title)
    setEditDue(t.due_date ?? '')
    setEditHint(t.description ?? '')
  }

  const saveEdit = async () => {
    if (!editId || !editTitle.trim() || saving) return
    setSaving(true)
    const { error } = await sb.from('tasks').update({
      title: editTitle.trim(),
      due_date: editDue || null,
      description: editHint.trim() || null,
    }).eq('id', editId)
    setSaving(false)
    if (error) { toast.error(error.message); return }
    setTasks(prev => prev.map(t => t.id === editId ? { ...t, title: editTitle.trim(), due_date: editDue || null, description: editHint.trim() || null } : t))
    setEditId(null)
    toast.success('Aggiornata')
  }

  const today = new Date().toISOString().slice(0, 10)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: accent }} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `color-mix(in srgb, ${accent} 8%, transparent)` }}>
            <Star className="w-4 h-4" style={{ color: accent }} />
          </div>
          <div>
            <h2 className="text-sm font-black text-text-primary">Task al cliente</h2>
            <p className="text-2xs text-text-secondary mt-0.5">
              Task assegnate a {client.company_name} — visibili nel portale cliente
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-2xs text-text-secondary">
            {completed.length}/{tasks.length} completate
          </span>
          {isAdmin && addMode === 'closed' && (
            <button onClick={() => setAddMode('picker')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
              style={{ background: `color-mix(in srgb, ${accent} 8%, transparent)`, color: accent }}>
              <Plus className="w-3 h-3" /> Aggiungi
            </button>
          )}
        </div>
      </div>

      {/* Progress */}
      {tasks.length > 0 && (
        <div className="bg-surface border border-border rounded-xl p-3">
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-surface rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width: `${tasks.length ? Math.round(completed.length / tasks.length * 100) : 0}%`, background: accent }} />
            </div>
            <span className="text-xs font-bold text-text-primary">{tasks.length ? Math.round(completed.length / tasks.length * 100) : 0}%</span>
          </div>
        </div>
      )}

      {/* Mode picker */}
      {isAdmin && addMode === 'picker' && (
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-xs text-text-secondary mb-3">Come vuoi aggiungere le task?</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button onClick={() => setAddMode('manuale')}
              className="flex flex-col items-center gap-2 p-3 rounded-xl border border-border hover:border-border bg-background transition-colors">
              <PenLine className="w-4 h-4 text-text-secondary" />
              <span className="text-xs font-bold text-text-primary">Manuale</span>
              <span className="text-2xs text-text-secondary text-center">Scrivi una task alla volta</span>
            </button>
            <button onClick={openTemplate}
              className="flex flex-col items-center gap-2 p-3 rounded-xl border border-border hover:border-border bg-background transition-colors">
              <ListChecks className="w-4 h-4 text-text-secondary" />
              <span className="text-xs font-bold text-text-primary">Template intelligente</span>
              <span className="text-2xs text-text-secondary text-center">Checklist pronta in base al tipo di progetto</span>
            </button>
            <button onClick={() => { setAddMode('ai'); generateWithAi() }}
              className="flex flex-col items-center gap-2 p-3 rounded-xl border border-border hover:border-border bg-background transition-colors">
              <Sparkles className="w-4 h-4 text-text-secondary" />
              <span className="text-xs font-bold text-text-primary">Genera con AI</span>
              <span className="text-2xs text-text-secondary text-center">Suggerimenti su misura per il progetto</span>
            </button>
          </div>
          <button onClick={closeAdd} className="mt-3 text-xs text-text-secondary hover:text-text-primary transition-colors">Annulla</button>
        </div>
      )}

      {/* Manuale */}
      {isAdmin && addMode === 'manuale' && (
        <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
          <input autoFocus value={newTitle} onChange={e => setNewTitle(e.target.value)}
            placeholder="Cosa deve fare il cliente?"
            onKeyDown={e => { if (e.key === 'Enter' && newTitle.trim()) addTask() }}
            className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-gold/40" />
          <input value={newHint} onChange={e => setNewHint(e.target.value)}
            placeholder="Istruzioni o note per il cliente (opzionale)"
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-gold/40" />
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 flex-1">
              <Calendar className="w-3.5 h-3.5 text-text-secondary shrink-0" />
              <input type="date" value={newDue} onChange={e => setNewDue(e.target.value)}
                className="bg-background border border-border rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-gold/40" />
            </div>
            <button onClick={closeAdd}
              className="px-3 py-2 text-xs text-text-secondary hover:text-text-primary transition-colors">Annulla</button>
            <button onClick={addTask} disabled={!newTitle.trim() || adding}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg text-on-gold disabled:opacity-40 transition-colors"
              style={{ background: accent }}>
              {adding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
              Aggiungi
            </button>
          </div>
        </div>
      )}

      {/* Template / AI review */}
      {isAdmin && (addMode === 'template' || addMode === 'ai') && (
        <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-text-primary flex items-center gap-1.5">
              {addMode === 'ai' ? <Sparkles className="w-3.5 h-3.5" style={{ color: accent }} /> : <ListChecks className="w-3.5 h-3.5" style={{ color: accent }} />}
              {addMode === 'ai' ? 'Suggerimenti AI' : `Template — ${project.project_type}`}
            </p>
            {addMode === 'ai' && (
              <button onClick={generateWithAi} disabled={aiLoading}
                className="flex items-center gap-1 text-2xs text-text-secondary hover:text-text-primary transition-colors disabled:opacity-40">
                <RefreshCw className={`w-3 h-3 ${aiLoading ? 'animate-spin' : ''}`} /> Rigenera
              </button>
            )}
          </div>

          {aiLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: accent }} />
            </div>
          ) : suggestions.length === 0 ? (
            <p className="text-xs text-text-secondary py-4 text-center">Nessun suggerimento disponibile.</p>
          ) : (
            <div className="space-y-1.5">
              {suggestions.map((s, i) => (
                <label key={i} className="flex items-start gap-2.5 p-2.5 rounded-lg hover:bg-surface-hover cursor-pointer transition-colors">
                  <input type="checkbox" checked={selected.has(i)} onChange={() => toggleSelected(i)}
                    className="mt-0.5 accent-gold" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-primary">{s.title}</p>
                    {s.hint && <p className="text-2xs text-text-secondary mt-0.5">{s.hint}</p>}
                  </div>
                  {s.phase && (
                    <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full shrink-0"
                      style={{ background: `color-mix(in srgb, ${PHASE_COLOR[s.phase] ?? 'var(--color-text-tertiary)'} 9%, transparent)`, color: PHASE_COLOR[s.phase] ?? 'var(--color-text-tertiary)' }}>
                      {s.phase}
                    </span>
                  )}
                </label>
              ))}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button onClick={closeAdd} className="px-3 py-2 text-xs text-text-secondary hover:text-text-primary transition-colors">Annulla</button>
            <button
              onClick={() => addBulkTasks(suggestions.filter((_, i) => selected.has(i)))}
              disabled={selected.size === 0 || adding || aiLoading}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg text-on-gold disabled:opacity-40 transition-colors"
              style={{ background: accent }}>
              {adding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
              Aggiungi selezionate ({selected.size})
            </button>
          </div>
        </div>
      )}

      {/* Pending tasks */}
      {pending.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-2xs font-bold uppercase tracking-wider px-1" style={{ color: accent }}>
            Da completare ({pending.length})
          </p>
          {pending.map(t => {
            const isOver = t.due_date && t.due_date < today
            const isEditing = editId === t.id

            if (isEditing) {
              return (
                <div key={t.id} className="bg-surface border border-gold/30 rounded-xl p-3 space-y-2">
                  <input autoFocus value={editTitle} onChange={e => setEditTitle(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditId(null) }}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold/40" />
                  <input value={editHint} onChange={e => setEditHint(e.target.value)}
                    placeholder="Istruzioni (opzionale)"
                    className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-gold/40" />
                  <div className="flex items-center gap-2">
                    <input type="date" value={editDue} onChange={e => setEditDue(e.target.value)}
                      className="bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-text-primary focus:outline-none" />
                    <div className="flex-1" />
                    <button onClick={() => setEditId(null)} className="text-xs text-text-secondary hover:text-text-primary">Annulla</button>
                    <button onClick={saveEdit} disabled={saving || !editTitle.trim()}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg text-on-gold disabled:opacity-40"
                      style={{ background: accent }}>
                      {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Salva
                    </button>
                  </div>
                </div>
              )
            }

            return (
              <div key={t.id}
                className={`group flex items-center gap-3 bg-surface border rounded-xl px-4 py-3 transition-all ${
                  isOver ? 'border-error/30 bg-error/5' : 'border-border hover:border-border'}`}>
                <button onClick={() => toggleStatus(t)}
                  className="w-5 h-5 rounded-full border-2 border-border hover:border-gold shrink-0 flex items-center justify-center transition-colors" />
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => isAdmin && startEdit(t)}>
                  <p className="text-sm text-text-primary truncate">{t.title}</p>
                  {t.description && <p className="text-2xs text-text-secondary mt-0.5 truncate">{t.description}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {t.due_date && (
                    <span className={`text-2xs font-medium ${isOver ? 'text-error' : 'text-text-secondary'}`}>
                      {new Date(t.due_date).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}
                    </span>
                  )}
                  {isOver && <span className="text-2xs text-error font-bold">scaduta</span>}
                  {isAdmin && (
                    <button onClick={() => deleteTask(t.id)}
                      className="p-1 text-text-tertiary hover:text-error opacity-0 group-hover:opacity-100 transition-all">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Completed */}
      {completed.length > 0 && (
        <div>
          <button onClick={() => setShowCompleted(v => !v)}
            className="flex items-center gap-1.5 text-2xs font-bold text-success uppercase tracking-wider px-1 mb-1.5 hover:text-success transition-colors">
            {showCompleted ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            Completate ({completed.length})
          </button>
          {showCompleted && (
            <div className="space-y-1.5 opacity-60">
              {completed.map(t => (
                <div key={t.id} className="group flex items-center gap-3 bg-surface border border-border rounded-xl px-4 py-3">
                  <button onClick={() => toggleStatus(t)}
                    className="w-5 h-5 rounded-full bg-success border-2 border-success shrink-0 flex items-center justify-center">
                    <Check className="w-3 h-3 text-on-gold" />
                  </button>
                  <span className="text-sm text-text-tertiary line-through flex-1 truncate">{t.title}</span>
                  {isAdmin && (
                    <button onClick={() => deleteTask(t.id)}
                      className="p-1 text-text-tertiary hover:text-error opacity-0 group-hover:opacity-100 transition-all">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty */}
      {tasks.length === 0 && addMode === 'closed' && (
        <div className="text-center py-16">
          <div className="w-14 h-14 rounded-2xl bg-surface border border-border flex items-center justify-center mx-auto mb-4">
            <Star className="w-6 h-6 text-text-tertiary" />
          </div>
          <p className="text-text-primary font-bold mb-1">Nessuna task per il cliente</p>
          <p className="text-text-secondary text-xs mb-4">
            Crea task che appariranno nel portale di {client.company_name}
          </p>
          {isAdmin && (
            <button onClick={() => setAddMode('picker')}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl text-on-gold"
              style={{ background: accent }}>
              <Plus className="w-3.5 h-3.5" /> Prima task
            </button>
          )}
        </div>
      )}
    </div>
  )
}
