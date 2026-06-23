'use client'

import { useState, useRef } from 'react'
import {
  Check, X, Plus, Loader2, Sparkles, Send, Trash2,
  ChevronDown, ChevronRight, Users, RefreshCw, Bot,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import {
  CLIENT_TASK_TEMPLATES, PHASE_LABEL, PHASE_COLOR,
  type ClientTaskTemplate,
} from '@/lib/reparti-constants'
import type { ExtTask } from '@/components/projects/SprintMilestoneBoardSection'
import type { DeptProject } from '@/app/(dashboard)/reparti/[dept]/page'

// ─── Phase badge ──────────────────────────────────────────────────────────────
function PhaseBadge({ phase }: { phase: string }) {
  const color = PHASE_COLOR[phase] ?? '#6B7280'
  return (
    <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full"
      style={{ background: `${color}18`, color }}>
      {PHASE_LABEL[phase] ?? phase}
    </span>
  )
}

// ─── Single client task row ───────────────────────────────────────────────────
function ClientTaskRow({ task, onUpdate, onDelete }: {
  task: ExtTask; onUpdate: (t: ExtTask) => void; onDelete: (id: string) => void
}) {
  const isDone = task.status === 'completato'
  const isOver = !isDone && task.due_date && task.due_date < new Date().toISOString().slice(0, 10)

  const toggle = async () => {
    const next = isDone ? 'da_fare' : 'completato'
    onUpdate({ ...task, status: next })
    await createClient().from('tasks').update({ status: next }).eq('id', task.id)
  }

  const del = async () => {
    onDelete(task.id)
    await createClient().from('tasks').delete().eq('id', task.id)
    toast.success('Task eliminata')
  }

  const phase = (task.tags ?? []).find(t => ['onboarding', 'build', 'lancio'].includes(t))

  return (
    <div className="group flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-[#0A0A0A] transition-colors">
      <button onClick={toggle}
        className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-all ${isDone ? 'bg-[#22C55E] border-[#22C55E]' : 'border-[#2A2A2A] hover:border-[#555]'}`}>
        {isDone && <Check className="w-2.5 h-2.5 text-black" />}
      </button>

      <span className={`flex-1 text-sm ${isDone ? 'line-through text-[#333]' : 'text-white'}`}>
        {task.title}
      </span>

      <div className="flex items-center gap-2 shrink-0">
        {phase && <PhaseBadge phase={phase} />}
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
          task.priority === 'alta' ? 'text-red-400 bg-red-400/10' :
          task.priority === 'media' ? 'text-yellow-400 bg-yellow-400/10' :
          'text-[#444] bg-[#1A1A1A]'
        }`}>{task.priority}</span>
        {isOver && <span className="text-[9px] text-red-400 font-bold">scaduta</span>}
        <button onClick={del}
          className="opacity-0 group-hover:opacity-100 p-1 text-[#222] hover:text-red-400 transition-all">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}

// ─── AI template chat ─────────────────────────────────────────────────────────
function AITemplateChat({ project, onApply, onClose }: {
  project: DeptProject; onApply: (tasks: ClientTaskTemplate[]) => void; onClose: () => void
}) {
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string; tasks?: ClientTaskTemplate[] }[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [pendingTasks, setPendingTasks] = useState<ClientTaskTemplate[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)

  const currentClientTasks = project.tasks.filter(t => t.is_client_task)

  const send = async (msg?: string) => {
    const text = msg ?? input.trim()
    if (!text || loading) return
    setInput('')
    const newMessages = [...messages, { role: 'user' as const, content: text }]
    setMessages(newMessages)
    setLoading(true)

    try {
      const res = await fetch('/api/reparti/client-tasks-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: project.name,
          projectType: project.project_type,
          clientName: project.client_name,
          existingTasks: currentClientTasks.map(t => ({ title: t.title, phase: (t.tags ?? []).find(x => ['onboarding','build','lancio'].includes(x)) ?? '', category: '' })),
          chatMessage: text,
          history: messages.map(m => ({ role: m.role, content: m.content })),
        }),
      })
      const data = await res.json()
      const tasks = data.tasks ?? []
      setPendingTasks(tasks)
      setMessages([...newMessages, { role: 'assistant', content: data.reply ?? '', tasks }])
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    } catch {
      setMessages(m => [...m, { role: 'assistant', content: 'Errore. Riprova.' }])
    } finally {
      setLoading(false)
    }
  }

  const QUICK = [
    `Genera task per ${project.project_type}`,
    'Aggiungi task per onboarding tecnico',
    'Suggerisci task per approvazioni',
    'Rimuovi le task già completate e aggiungi quelle mancanti',
  ]

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#0E0E0E] border border-[#2A2A2A] rounded-2xl w-full max-w-lg shadow-2xl flex flex-col" style={{ height: 560 }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[#1A1A1A] shrink-0">
          <Bot className="w-4 h-4 text-[#F5C800]" />
          <span className="text-sm font-bold text-white flex-1">AI — Template task cliente</span>
          <span className="text-[10px] text-[#444]">{project.name}</span>
          <button onClick={onClose} className="text-[#444] hover:text-white"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {messages.length === 0 ? (
            <div className="flex flex-col gap-3 py-4">
              <p className="text-xs text-[#444] text-center">Chiedi all'AI di generare o modificare le task cliente</p>
              <div className="grid grid-cols-2 gap-2">
                {QUICK.map(q => (
                  <button key={q} onClick={() => send(q)}
                    className="text-left text-[10px] text-[#555] bg-[#111] border border-[#1A1A1A] hover:border-[#2A2A2A] hover:text-white rounded-xl px-2.5 py-2 transition-all">
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[9px] font-black ${m.role === 'user' ? 'bg-[#F5C800] text-black' : 'bg-[#1A1A1A] border border-[#2A2A2A] text-[#F5C800]'}`}>
                {m.role === 'user' ? 'U' : <Bot className="w-3.5 h-3.5" />}
              </div>
              <div className={`flex flex-col gap-2 max-w-[85%] ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                {m.tasks && m.tasks.length > 0 && (
                  <div className="w-full bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-3 space-y-1.5">
                    <p className="text-[9px] text-[#444] font-bold uppercase tracking-wider mb-2">Task generate ({m.tasks.length})</p>
                    {m.tasks.map((t, j) => (
                      <div key={j} className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: PHASE_COLOR[t.phase] ?? '#444' }} />
                        <span className="text-xs text-[#888] flex-1">{t.title}</span>
                        <PhaseBadge phase={t.phase} />
                      </div>
                    ))}
                    <button onClick={() => { onApply(m.tasks!); onClose() }}
                      className="w-full mt-2 py-1.5 bg-[#F5C800] text-black text-xs font-black rounded-lg hover:bg-yellow-400">
                      Applica queste task
                    </button>
                  </div>
                )}
                <div className={`px-3 py-2 rounded-xl text-xs leading-relaxed ${m.role === 'user' ? 'bg-[#F5C800] text-black' : 'bg-[#111] border border-[#1A1A1A] text-[#888]'}`}>
                  {m.content.replace(/\{[\s\S]*\}/, '').trim() || (m.tasks?.length ? '' : m.content)}
                </div>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-[#1A1A1A] border border-[#2A2A2A] flex items-center justify-center">
                <Bot className="w-3.5 h-3.5 text-[#F5C800]" />
              </div>
              <div className="bg-[#111] border border-[#1A1A1A] rounded-xl px-4 py-3">
                <div className="flex gap-1">
                  {[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-[#F5C800] animate-bounce" style={{ animationDelay: `${i*150}ms` }} />)}
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="px-4 pb-4 shrink-0">
          <div className="flex gap-2 bg-[#111] border border-[#1A1A1A] rounded-xl px-3 py-2">
            <input value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') send() }}
              placeholder="Es: aggiungi task per social media, rimuovi tecnico…"
              className="flex-1 bg-transparent text-xs text-white placeholder-[#2A2A2A] focus:outline-none" />
            <button onClick={() => send()} disabled={!input.trim() || loading}
              className="w-7 h-7 rounded-lg bg-[#F5C800] flex items-center justify-center disabled:opacity-40">
              <Send className="w-3.5 h-3.5 text-black" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Per-project client task card ─────────────────────────────────────────────
function ProjectClientCard({ project }: { project: DeptProject }) {
  const [open, setOpen]       = useState(false)
  const [tasks, setTasks]     = useState<ExtTask[]>(project.tasks.filter(t => t.is_client_task))
  const [adding, setAdding]   = useState(false)
  const [draft, setDraft]     = useState('')
  const [saving, setSaving]   = useState(false)
  const [showAI, setShowAI]   = useState(false)
  const [applying, setApplying] = useState(false)
  const addRef = useRef<HTMLInputElement>(null)

  const done  = tasks.filter(t => t.status === 'completato').length
  const total = tasks.length

  const applyTemplate = async (templateTasks: ClientTaskTemplate[]) => {
    setApplying(true)
    const rows = templateTasks.map((t, i) => ({
      project_id: project.id,
      title: t.title,
      priority: t.priority,
      status: 'da_fare',
      is_milestone: false,
      is_client_task: true,
      tags: [t.category, t.phase],
      order: tasks.length + i,
    }))
    const { data, error } = await createClient().from('tasks').insert(rows as never[]).select('*')
    setApplying(false)
    if (error) { toast.error(error.message); return }
    setTasks(prev => [...prev, ...(data as ExtTask[])])
    setOpen(true)
    toast.success(`${rows.length} task cliente create`)
  }

  const applyDefaultTemplate = async () => {
    const template = CLIENT_TASK_TEMPLATES[project.project_type] ?? CLIENT_TASK_TEMPLATES.custom
    await applyTemplate(template)
  }

  const addTask = async () => {
    if (!draft.trim()) return
    setSaving(true)
    const { data, error } = await createClient().from('tasks').insert({
      project_id: project.id, title: draft.trim(), priority: 'media',
      status: 'da_fare', is_milestone: false, is_client_task: true,
      tags: ['onboarding'], order: tasks.length,
    } as never).select('*').single()
    setSaving(false)
    if (error) { toast.error(error.message); return }
    setTasks(prev => [...prev, data as ExtTask])
    setDraft(''); setAdding(false)
  }

  const updateTask = (updated: ExtTask) =>
    setTasks(prev => prev.map(t => t.id === updated.id ? updated : t))
  const deleteTask = (id: string) =>
    setTasks(prev => prev.filter(t => t.id !== id))

  return (
    <div className="bg-[#0D0D0D] border border-[#1A1A1A] rounded-2xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3.5">
        <button onClick={() => setOpen(o => !o)} className="shrink-0 text-[#333] hover:text-white transition-colors">
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setOpen(o => !o)}>
          <p className="text-sm font-bold text-white truncate">{project.name}</p>
          <p className="text-[10px] text-[#444] mt-0.5">{project.client_name ?? '—'} · {project.project_type}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {total > 0 ? (
            <>
              <div className="w-16 h-1.5 bg-[#1A1A1A] rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-[#F5C800] transition-all" style={{ width: `${total > 0 ? (done/total*100) : 0}%` }} />
              </div>
              <span className="text-[10px] text-[#444]">{done}/{total}</span>
            </>
          ) : (
            <span className="text-[10px] text-[#333]">nessuna task</span>
          )}
        </div>
      </div>

      {open && (
        <div className="border-t border-[#111] px-4 py-3">
          {/* Toolbar */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <button onClick={() => setShowAI(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-bold bg-[#F5C800]/10 border border-[#F5C800]/20 text-[#F5C800] rounded-lg hover:bg-[#F5C800]/20 transition-all">
              <Sparkles className="w-3 h-3" /> AI Genera & Ottimizza
            </button>
            {total === 0 && (
              <button onClick={applyDefaultTemplate} disabled={applying}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-bold border border-[#2A2A2A] text-[#666] rounded-lg hover:text-white hover:border-[#444] transition-all">
                {applying ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                Template {project.project_type}
              </button>
            )}
            <button onClick={() => { setAdding(true); setTimeout(() => addRef.current?.focus(), 30) }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-bold border border-[#2A2A2A] text-[#666] rounded-lg hover:text-white hover:border-[#444] transition-all">
              <Plus className="w-3 h-3" /> Aggiungi manuale
            </button>
          </div>

          {/* Tasks by phase */}
          {total === 0 && !adding ? (
            <div className="py-8 text-center">
              <p className="text-xs text-[#333]">Nessuna task cliente per questo progetto</p>
              <p className="text-[10px] text-[#222] mt-1">Usa AI o il template predefinito per iniziare</p>
            </div>
          ) : (
            <>
              {(['onboarding', 'build', 'lancio'] as const).map(phase => {
                const phaseTasks = tasks.filter(t => (t.tags ?? []).includes(phase))
                if (phaseTasks.length === 0) return null
                return (
                  <div key={phase} className="mb-3">
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: PHASE_COLOR[phase] }} />
                      <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: PHASE_COLOR[phase] }}>
                        {PHASE_LABEL[phase]}
                      </span>
                      <span className="text-[9px] text-[#333]">
                        {phaseTasks.filter(t => t.status === 'completato').length}/{phaseTasks.length}
                      </span>
                    </div>
                    {phaseTasks.map(t => (
                      <ClientTaskRow key={t.id} task={t} onUpdate={updateTask} onDelete={deleteTask} />
                    ))}
                  </div>
                )
              })}
              {/* Tasks without phase */}
              {tasks.filter(t => !['onboarding','build','lancio'].some(p => (t.tags ?? []).includes(p))).map(t => (
                <ClientTaskRow key={t.id} task={t} onUpdate={updateTask} onDelete={deleteTask} />
              ))}
            </>
          )}

          {adding && (
            <div className="flex items-center gap-2 px-2 py-2 border border-dashed border-[#2A2A2A] rounded-xl mt-2">
              <div className="w-4 h-4 rounded border border-[#2A2A2A] shrink-0" />
              <input ref={addRef} value={draft} onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addTask(); if (e.key === 'Escape') { setAdding(false); setDraft('') } }}
                placeholder="Descrivi cosa deve fare il cliente…"
                className="flex-1 bg-transparent text-sm text-white focus:outline-none placeholder:text-[#2A2A2A]" />
              <button onClick={addTask} disabled={saving || !draft.trim()} className="p-1 text-[#22C55E] disabled:opacity-40">
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              </button>
              <button onClick={() => { setAdding(false); setDraft('') }} className="p-1 text-[#444] hover:text-white">
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      )}

      {showAI && (
        <AITemplateChat project={project} onApply={applyTemplate} onClose={() => setShowAI(false)} />
      )}
    </div>
  )
}

// ─── Aggregated view ──────────────────────────────────────────────────────────
function AggregatedClientView({ projects }: { projects: DeptProject[] }) {
  const allClientTasks = projects.flatMap(p =>
    p.tasks.filter(t => t.is_client_task).map(t => ({ ...t, _projectName: p.name, _clientName: p.client_name }))
  )
  const pending    = allClientTasks.filter(t => t.status !== 'completato')
  const completed  = allClientTasks.filter(t => t.status === 'completato')

  if (allClientTasks.length === 0) return null

  return (
    <div className="bg-[#0D0D0D] border border-[#1A1A1A] rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-4">
        <Users className="w-4 h-4 text-[#F5C800]" />
        <span className="text-sm font-bold text-white">Vista aggregata clienti</span>
        <span className="text-[10px] text-[#444] ml-auto">{completed.length}/{allClientTasks.length} completate</span>
      </div>

      {pending.length > 0 && (
        <div className="mb-4">
          <p className="text-[9px] font-bold text-red-400 uppercase tracking-wider mb-2">In attesa ({pending.length})</p>
          {pending.map(t => (
            <div key={t.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[#0A0A0A]">
              <div className="w-3 h-3 rounded border border-[#2A2A2A] shrink-0" />
              <span className="flex-1 text-xs text-[#888] truncate">{t.title}</span>
              <span className="text-[9px] text-[#444] shrink-0">{(t as any)._clientName ?? (t as any)._projectName}</span>
            </div>
          ))}
        </div>
      )}

      {completed.length > 0 && (
        <div>
          <p className="text-[9px] font-bold text-green-400 uppercase tracking-wider mb-2">Ricevute ({completed.length})</p>
          {completed.map(t => (
            <div key={t.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg opacity-50">
              <div className="w-3 h-3 rounded bg-[#22C55E] flex items-center justify-center shrink-0">
                <Check className="w-2 h-2 text-black" />
              </div>
              <span className="flex-1 text-xs text-[#444] line-through truncate">{t.title}</span>
              <span className="text-[9px] text-[#333] shrink-0">{(t as any)._clientName ?? (t as any)._projectName}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function TaskClienteSection({ projects }: { projects: DeptProject[] }) {
  const activeProjects = projects.filter(p => p.status === 'attivo' || p.tasks.some(t => t.is_client_task))

  return (
    <div className="space-y-4">
      <AggregatedClientView projects={activeProjects} />
      <div className="space-y-3">
        {activeProjects.map(p => <ProjectClientCard key={p.id} project={p} />)}
      </div>
      {activeProjects.length === 0 && (
        <div className="flex flex-col items-center py-16 gap-3 text-center">
          <Users className="w-8 h-8 text-[#1A1A1A]" />
          <p className="text-[#444] text-sm">Nessun progetto attivo</p>
        </div>
      )}
    </div>
  )
}
