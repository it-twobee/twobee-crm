'use client'

import { useState } from 'react'
import {
  Plus, Check, Trash2, Loader2, ChevronDown, ChevronRight,
  Calendar, GripVertical, Star,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
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

export function ClientPlanSection({ project, client, isAdmin, accent }: Props) {
  const [tasks, setTasks]       = useState<ClientTask[]>([])
  const [loaded, setLoaded]     = useState(false)
  const [loading, setLoading]   = useState(true)
  const [newTitle, setNewTitle]  = useState('')
  const [newDue, setNewDue]     = useState('')
  const [newHint, setNewHint]   = useState('')
  const [adding, setAdding]     = useState(false)
  const [showAdd, setShowAdd]   = useState(false)
  const [editId, setEditId]     = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDue, setEditDue]   = useState('')
  const [editHint, setEditHint] = useState('')
  const [saving, setSaving]     = useState(false)
  const [showCompleted, setShowCompleted] = useState(false)

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
    setNewTitle('')
    setNewDue('')
    setNewHint('')
    setShowAdd(false)
    toast.success('Task aggiunta al piano cliente')
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
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${accent}15` }}>
            <Star className="w-4 h-4" style={{ color: accent }} />
          </div>
          <div>
            <h2 className="text-sm font-black text-white">Piano Cliente</h2>
            <p className="text-[10px] text-text-secondary mt-0.5">
              Task assegnate a {client.company_name} — visibili nel portale cliente
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-text-secondary">
            {completed.length}/{tasks.length} completate
          </span>
          {isAdmin && (
            <button onClick={() => setShowAdd(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
              style={{ background: `${accent}15`, color: accent }}>
              <Plus className="w-3 h-3" /> Aggiungi
            </button>
          )}
        </div>
      </div>

      {/* Progress */}
      {tasks.length > 0 && (
        <div className="bg-surface border border-[#2A2A2A] rounded-xl p-3">
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-[#1A1A1A] rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width: `${tasks.length ? Math.round(completed.length / tasks.length * 100) : 0}%`, background: accent }} />
            </div>
            <span className="text-xs font-bold text-white">{tasks.length ? Math.round(completed.length / tasks.length * 100) : 0}%</span>
          </div>
        </div>
      )}

      {/* Add form */}
      {showAdd && isAdmin && (
        <div className="bg-surface border border-[#2A2A2A] rounded-xl p-4 space-y-3">
          <input autoFocus value={newTitle} onChange={e => setNewTitle(e.target.value)}
            placeholder="Cosa deve fare il cliente?"
            onKeyDown={e => { if (e.key === 'Enter' && newTitle.trim()) addTask() }}
            className="w-full bg-[#111] border border-[#2A2A2A] rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-[#444] focus:outline-none focus:border-gold/40" />
          <input value={newHint} onChange={e => setNewHint(e.target.value)}
            placeholder="Istruzioni o note per il cliente (opzionale)"
            className="w-full bg-[#111] border border-[#2A2A2A] rounded-lg px-3 py-2 text-xs text-white placeholder:text-[#444] focus:outline-none focus:border-gold/40" />
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 flex-1">
              <Calendar className="w-3.5 h-3.5 text-text-secondary shrink-0" />
              <input type="date" value={newDue} onChange={e => setNewDue(e.target.value)}
                className="bg-[#111] border border-[#2A2A2A] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-gold/40" />
            </div>
            <button onClick={() => { setShowAdd(false); setNewTitle(''); setNewDue(''); setNewHint('') }}
              className="px-3 py-2 text-xs text-text-secondary hover:text-white transition-colors">Annulla</button>
            <button onClick={addTask} disabled={!newTitle.trim() || adding}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg text-black disabled:opacity-40 transition-colors"
              style={{ background: accent }}>
              {adding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
              Aggiungi
            </button>
          </div>
        </div>
      )}

      {/* Pending tasks */}
      {pending.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-wider px-1" style={{ color: accent }}>
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
                    className="w-full bg-[#111] border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold/40" />
                  <input value={editHint} onChange={e => setEditHint(e.target.value)}
                    placeholder="Istruzioni (opzionale)"
                    className="w-full bg-[#111] border border-[#2A2A2A] rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-[#444] focus:outline-none focus:border-gold/40" />
                  <div className="flex items-center gap-2">
                    <input type="date" value={editDue} onChange={e => setEditDue(e.target.value)}
                      className="bg-[#111] border border-[#2A2A2A] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none" />
                    <div className="flex-1" />
                    <button onClick={() => setEditId(null)} className="text-xs text-text-secondary hover:text-white">Annulla</button>
                    <button onClick={saveEdit} disabled={saving || !editTitle.trim()}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg text-black disabled:opacity-40"
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
                  isOver ? 'border-red-500/30 bg-red-500/5' : 'border-[#2A2A2A] hover:border-[#3A3A3A]'}`}>
                <button onClick={() => toggleStatus(t)}
                  className="w-5 h-5 rounded-full border-2 border-[#2A2A2A] hover:border-gold shrink-0 flex items-center justify-center transition-colors" />
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => isAdmin && startEdit(t)}>
                  <p className="text-sm text-white truncate">{t.title}</p>
                  {t.description && <p className="text-[10px] text-text-secondary mt-0.5 truncate">{t.description}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {t.due_date && (
                    <span className={`text-[10px] font-medium ${isOver ? 'text-red-400' : 'text-text-secondary'}`}>
                      {new Date(t.due_date).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}
                    </span>
                  )}
                  {isOver && <span className="text-[9px] text-red-400 font-bold">scaduta</span>}
                  {isAdmin && (
                    <button onClick={() => deleteTask(t.id)}
                      className="p-1 text-[#333] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all">
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
            className="flex items-center gap-1.5 text-[10px] font-bold text-[#22C55E] uppercase tracking-wider px-1 mb-1.5 hover:text-emerald-400 transition-colors">
            {showCompleted ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            Completate ({completed.length})
          </button>
          {showCompleted && (
            <div className="space-y-1.5 opacity-60">
              {completed.map(t => (
                <div key={t.id} className="group flex items-center gap-3 bg-surface border border-[#1A1A1A] rounded-xl px-4 py-3">
                  <button onClick={() => toggleStatus(t)}
                    className="w-5 h-5 rounded-full bg-[#22C55E] border-2 border-[#22C55E] shrink-0 flex items-center justify-center">
                    <Check className="w-3 h-3 text-black" />
                  </button>
                  <span className="text-sm text-[#555] line-through flex-1 truncate">{t.title}</span>
                  {isAdmin && (
                    <button onClick={() => deleteTask(t.id)}
                      className="p-1 text-[#333] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all">
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
      {tasks.length === 0 && (
        <div className="text-center py-16">
          <div className="w-14 h-14 rounded-2xl bg-surface border border-[#2A2A2A] flex items-center justify-center mx-auto mb-4">
            <Star className="w-6 h-6 text-[#2A2A2A]" />
          </div>
          <p className="text-white font-bold mb-1">Nessuna task per il cliente</p>
          <p className="text-text-secondary text-xs mb-4">
            Crea task che appariranno nel portale di {client.company_name}
          </p>
          {isAdmin && (
            <button onClick={() => setShowAdd(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl text-black"
              style={{ background: accent }}>
              <Plus className="w-3.5 h-3.5" /> Prima task
            </button>
          )}
        </div>
      )}
    </div>
  )
}
