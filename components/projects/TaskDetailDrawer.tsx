'use client'

import { useState, useEffect, useCallback, useTransition } from 'react'
import { toast } from 'sonner'
import {
  X, Trash2, Check, Plus, Repeat, Send, Loader2,
} from 'lucide-react'
import { createClient as createBrowserClient } from '@/lib/supabase/client'
import {
  updateTask, updateTaskStatus, setTaskAssignees, deleteTask,
  addTaskComment, deleteTaskComment,
  addChecklistItem, toggleChecklistItem, deleteChecklistItem,
} from '@/app/actions/tasks'
import type { Task, TaskStatusV2, Priority, Visibility } from '@/lib/types/database'

type Person = { id: string; full_name: string }
type Comment = { id: string; author_id: string; content: string; created_at: string }
type Check = { id: string; content: string; is_done: boolean; sort_order: number }

const STATUSES: TaskStatusV2[] = ['da_fare', 'in_corso', 'in_review', 'richiesta_supporto', 'completato']
const STATUS_LABEL: Record<string, string> = {
  da_fare: 'Da fare', in_corso: 'In corso', in_review: 'In review',
  richiesta_supporto: 'Richiesta supporto', completato: 'Completato',
}

export function TaskDetailDrawer({
  task, profiles, contextLabel, canEdit, onClose, onChanged,
}: {
  task: Task
  profiles: Person[]
  contextLabel?: string
  canEdit: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const [pending, start] = useTransition()
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description ?? '')
  const [assignees, setAssignees] = useState<string[]>([])
  const [comments, setComments] = useState<Comment[] | null>(null)
  const [checklist, setChecklist] = useState<Check[] | null>(null)
  const [newComment, setNewComment] = useState('')
  const [newCheck, setNewCheck] = useState('')

  const name = (id: string | null) => id ? (profiles.find(p => p.id === id)?.full_name ?? '—') : '—'

  const reload = useCallback(() => {
    const sb = createBrowserClient()
    sb.from('task_assignees').select('profile_id').eq('task_id', task.id)
      .then(({ data }) => setAssignees((data ?? []).map(r => r.profile_id)))
    sb.from('task_comments').select('id,author_id,content,created_at').eq('task_id', task.id).order('created_at')
      .then(({ data }) => setComments((data ?? []) as Comment[]))
    sb.from('task_checklist_items').select('id,content,is_done,sort_order').eq('task_id', task.id).order('sort_order')
      .then(({ data }) => setChecklist((data ?? []) as Check[]))
  }, [task.id])
  useEffect(() => { reload() }, [reload])

  const act = (fn: () => Promise<unknown>, ok?: string) => start(async () => {
    try { await fn(); if (ok) toast.success(ok); reload(); onChanged() }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
  })

  const done = checklist ? checklist.filter(c => c.is_done).length : 0

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-scrim animate-fade-in" onClick={onClose}>
      <div className="bg-surface border-l border-border w-full max-w-md h-full flex flex-col shadow-drawer animate-slide-in-right pt-safe" onClick={e => e.stopPropagation()}>
        {/* header */}
        <div className="flex items-start justify-between gap-2 p-4 border-b border-border">
          <div className="flex-1 min-w-0">
            {task.is_recurring_instance && (
              <div className="flex items-center gap-1 text-2xs text-success mb-1"><Repeat className="w-3 h-3" />occorrenza ricorrente</div>
            )}
            {canEdit ? (
              <input value={title} onChange={e => setTitle(e.target.value)}
                onBlur={() => title.trim() && title !== task.title && act(() => updateTask(task.id, { title }))}
                className="w-full bg-transparent text-base font-bold text-text-primary border-b border-transparent focus:border-border-interactive outline-none" />
            ) : <h2 className="text-base font-bold text-text-primary">{task.title}</h2>}
            {contextLabel && <p className="text-2xs text-text-tertiary mt-1">{contextLabel}</p>}
          </div>
          <button onClick={onClose} aria-label="Chiudi" className="text-text-tertiary hover:text-text-primary"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* meta grid */}
          <div className="grid grid-cols-2 gap-3">
            <Meta label="Stato">
              <select value={task.status} disabled={!canEdit || pending}
                onChange={e => act(() => updateTaskStatus(task.id, e.target.value as TaskStatusV2), 'Stato aggiornato')}
                className="w-full bg-background border border-border-interactive rounded px-2 py-1.5 text-2xs text-text-primary">
                {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </Meta>
            <Meta label="Priorità">
              <select value={task.priority} disabled={!canEdit || pending}
                onChange={e => act(() => updateTask(task.id, { priority: e.target.value as Priority }))}
                className="w-full bg-background border border-border-interactive rounded px-2 py-1.5 text-2xs text-text-primary">
                {(['alta', 'media', 'bassa'] as Priority[]).map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </Meta>
            <Meta label="Inizio">
              <input type="date" defaultValue={task.start_date ?? ''} disabled={!canEdit}
                onBlur={e => act(() => updateTask(task.id, { start_date: e.target.value || null }))}
                className="w-full bg-background border border-border-interactive rounded px-2 py-1.5 text-2xs text-text-primary" />
            </Meta>
            <Meta label="Scadenza">
              <input type="date" defaultValue={task.due_date ?? ''} disabled={!canEdit}
                onBlur={e => act(() => updateTask(task.id, { due_date: e.target.value || null }))}
                className="w-full bg-background border border-border-interactive rounded px-2 py-1.5 text-2xs text-text-primary" />
            </Meta>
            <Meta label="Ore stimate">
              <input type="number" step="0.5" defaultValue={task.estimated_hours ?? ''} disabled={!canEdit}
                onBlur={e => act(() => updateTask(task.id, { estimated_hours: e.target.value ? Number(e.target.value) : null }))}
                className="w-full bg-background border border-border-interactive rounded px-2 py-1.5 text-2xs text-text-primary" />
            </Meta>
            <Meta label="Visibilità">
              <select value={task.visibility} disabled={!canEdit || pending}
                onChange={e => act(() => updateTask(task.id, { visibility: e.target.value as Visibility }))}
                className="w-full bg-background border border-border-interactive rounded px-2 py-1.5 text-2xs text-text-primary">
                <option value="internal">Interna</option>
                <option value="client_visible">Cliente</option>
              </select>
            </Meta>
          </div>

          {/* assegnatari */}
          <div>
            <div className="text-2xs font-semibold text-text-secondary mb-1">Assegnatari</div>
            <div className="flex flex-wrap gap-1.5">
              {profiles.map(p => {
                const on = assignees.includes(p.id)
                return (
                  <button key={p.id} disabled={!canEdit}
                    onClick={() => { const next = on ? assignees.filter(x => x !== p.id) : [...assignees, p.id]; setAssignees(next); act(() => setTaskAssignees(task.id, next)) }}
                    className={`text-2xs px-2 py-1 rounded border transition-colors ${on ? 'bg-gold text-on-gold border-gold' : 'border-border text-text-secondary hover:bg-surface-hover'}`}>
                    {p.full_name}
                  </button>
                )
              })}
            </div>
          </div>

          {/* descrizione */}
          <div>
            <div className="text-2xs font-semibold text-text-secondary mb-1">Descrizione</div>
            <textarea value={description} onChange={e => setDescription(e.target.value)} disabled={!canEdit} rows={3}
              onBlur={() => description !== (task.description ?? '') && act(() => updateTask(task.id, { description: description || null }))}
              placeholder="—"
              className="w-full bg-background border border-border-interactive rounded px-2 py-1.5 text-sm text-text-primary" />
          </div>

          {/* checklist */}
          <div>
            <div className="text-2xs font-semibold text-text-secondary mb-1 flex items-center justify-between">
              <span>Checklist</span>
              {checklist && checklist.length > 0 && <span className="text-text-tertiary">{done}/{checklist.length}</span>}
            </div>
            {checklist === null ? <Loader /> : (
              <div className="space-y-1">
                {checklist.map(c => (
                  <div key={c.id} className="flex items-center gap-2 group">
                    <button disabled={!canEdit} onClick={() => act(() => toggleChecklistItem(c.id, !c.is_done))} aria-label="Spunta"
                      className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${c.is_done ? 'bg-success border-success' : 'border-border-strong'}`}>
                      {c.is_done && <Check className="w-3 h-3 text-on-gold" />}
                    </button>
                    <span className={`flex-1 text-sm ${c.is_done ? 'text-text-tertiary line-through' : 'text-text-primary'}`}>{c.content}</span>
                    {canEdit && <button onClick={() => act(() => deleteChecklistItem(c.id))} aria-label="Elimina" className="text-error opacity-0 group-hover:opacity-100"><Trash2 className="w-3 h-3" /></button>}
                  </div>
                ))}
                {canEdit && (
                  <div className="flex items-center gap-2 pt-1">
                    <input value={newCheck} onChange={e => setNewCheck(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && newCheck.trim()) { act(() => addChecklistItem(task.id, newCheck, checklist.length)); setNewCheck('') } }}
                      placeholder="Aggiungi elemento…"
                      className="flex-1 bg-background border border-border-interactive rounded px-2 py-1 text-2xs text-text-primary" />
                    <button onClick={() => { if (newCheck.trim()) { act(() => addChecklistItem(task.id, newCheck, checklist.length)); setNewCheck('') } }}
                      aria-label="Aggiungi" className="text-gold-text"><Plus className="w-4 h-4" /></button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* commenti */}
          <div>
            <div className="text-2xs font-semibold text-text-secondary mb-1">Commenti</div>
            {comments === null ? <Loader /> : (
              <div className="space-y-2">
                {comments.map(c => (
                  <div key={c.id} className="text-sm group">
                    <div className="flex items-center gap-2">
                      <span className="text-2xs font-semibold text-text-secondary">{name(c.author_id)}</span>
                      <span className="text-2xs text-text-tertiary">{new Date(c.created_at).toLocaleDateString('it-IT')}</span>
                      {canEdit && <button onClick={() => act(() => deleteTaskComment(c.id))} aria-label="Elimina commento" className="text-error opacity-0 group-hover:opacity-100 ml-auto"><Trash2 className="w-3 h-3" /></button>}
                    </div>
                    <p className="text-text-primary">{c.content}</p>
                  </div>
                ))}
                {comments.length === 0 && <p className="text-2xs text-text-tertiary">Nessun commento.</p>}
              </div>
            )}
            {canEdit && (
              <div className="flex items-center gap-2 mt-2">
                <input value={newComment} onChange={e => setNewComment(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && newComment.trim()) { act(() => addTaskComment(task.id, newComment)); setNewComment('') } }}
                  placeholder="Scrivi un commento…"
                  className="flex-1 bg-background border border-border-interactive rounded px-2 py-1.5 text-sm text-text-primary" />
                <button onClick={() => { if (newComment.trim()) { act(() => addTaskComment(task.id, newComment)); setNewComment('') } }}
                  aria-label="Invia" className="text-gold-text"><Send className="w-4 h-4" /></button>
              </div>
            )}
          </div>
        </div>

        {/* footer */}
        {canEdit && (
          <div className="p-3 border-t border-border flex justify-between items-center">
            <button onClick={() => { if (confirm('Eliminare la task?')) act(() => deleteTask(task.id), 'Eliminata'); onClose() }}
              className="flex items-center gap-1 text-2xs font-semibold text-error hover:opacity-80">
              <Trash2 className="w-3.5 h-3.5" />Elimina
            </button>
            {pending && <Loader2 className="w-4 h-4 text-text-tertiary animate-spin" />}
          </div>
        )}
      </div>
    </div>
  )
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><div className="text-2xs font-semibold text-text-secondary mb-1">{label}</div>{children}</div>
}
function Loader() {
  return <div className="flex items-center gap-2 text-2xs text-text-tertiary py-2"><Loader2 className="w-3.5 h-3.5 animate-spin" />…</div>
}
