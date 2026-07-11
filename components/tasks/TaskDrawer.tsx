'use client'

import { useState } from 'react'
import Link from 'next/link'
import { X, Pencil, Save, Loader2, FolderKanban, ExternalLink, ListTree, MessageSquare, Clock, FileText, Link2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Task, Profile } from '@/lib/types/database'
import { usePortalRoutes } from '@/lib/portal-routes'
import { isTaskDone } from '@/lib/task-status'
import { AssigneePicker } from './AssigneePicker'
import { SubtaskList } from './SubtaskList'
import { TaskComments } from './TaskComments'
import { TimeTracker } from './TimeTracker'
import { updateTaskFields } from '@/app/actions/tasks'
import { setTaskAssignees } from '@/app/actions/task-assignees'

// Drawer task condiviso (Fase 1b): stesso editor su Le mie attività, progetto,
// sprint/milestone, workload. Scritture centralizzate via updateTaskFields
// (campi scalari) e setTaskAssignees (owner). NON esposto ai clienti (D11).

const STATUS: { v: string; label: string }[] = [
  { v: 'da_fare', label: 'Da fare' }, { v: 'in_corso', label: 'In corso' },
  { v: 'in_revisione', label: 'In revisione' }, { v: 'completato', label: 'Completato' },
]
const PRIORITY: { v: string; label: string; cls: string }[] = [
  { v: 'alta', label: 'Alta', cls: 'bg-error/10 text-error border-error/20' },
  { v: 'media', label: 'Media', cls: 'bg-gold/10 text-gold-text border-warning/20' },
  { v: 'bassa', label: 'Bassa', cls: 'bg-success/10 text-success border-success/20' },
]

export interface DrawerTask extends Task {
  project?: { id: string; name: string; client_id: string; clients?: { company_name: string } | null } | null
}

type Tab = 'dettaglio' | 'subtask' | 'commenti' | 'ore'

export function TaskDrawer({ task, profiles, canEdit = true, initialAssignees, onClose, onPatched }: {
  task: DrawerTask
  profiles: Pick<Profile, 'id' | 'full_name' | 'avatar_url'>[]
  canEdit?: boolean
  initialAssignees?: string[]
  onClose: () => void
  onPatched: (patch: Partial<Task>) => void
}) {
  const { projectHref } = usePortalRoutes()
  const [tab, setTab] = useState<Tab>('dettaglio')
  const [saving, setSaving] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [title, setTitle] = useState(task.title)
  const [editingDesc, setEditingDesc] = useState(false)
  const [desc, setDesc] = useState(task.description ?? '')
  const [ids, setIds] = useState<string[]>(initialAssignees ?? (task.assignee_id ? [task.assignee_id] : []))

  const inp = 'w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-gold/40 placeholder:text-text-tertiary'

  // Salvataggio centralizzato: server action + aggiornamento locale ottimistico.
  const patch = async (p: Partial<Task>) => {
    onPatched(p)
    const res = await updateTaskFields(task.id, p as Record<string, unknown>)
    if ('error' in res) toast.error(res.error)
  }

  const saveTitle = async () => {
    if (!title.trim() || title === task.title) { setEditingTitle(false); return }
    setSaving(true); await patch({ title: title.trim() }); setSaving(false); setEditingTitle(false)
  }
  const saveDesc = async () => {
    const val = desc.trim() || null
    if (val === (task.description ?? null)) { setEditingDesc(false); return }
    setSaving(true); await patch({ description: val }); setSaving(false); setEditingDesc(false)
  }
  const saveAssignees = async (next: string[]) => {
    setIds(next)
    onPatched({ assignee_id: next[0] ?? null })
    const res = await setTaskAssignees(task.id, next)
    if ('error' in res) toast.error(res.error)
  }

  const TABS: { k: Tab; label: string; icon: React.ReactNode }[] = [
    { k: 'dettaglio', label: 'Dettaglio', icon: <FileText className="w-3.5 h-3.5" /> },
    { k: 'subtask', label: 'Subtask', icon: <ListTree className="w-3.5 h-3.5" /> },
    { k: 'commenti', label: 'Commenti', icon: <MessageSquare className="w-3.5 h-3.5" /> },
    { k: 'ore', label: 'Ore', icon: <Clock className="w-3.5 h-3.5" /> },
  ]

  return (
    <div className="w-80 lg:w-96 border-l border-border flex flex-col bg-surface shrink-0">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <h3 className="text-sm font-bold text-text-primary truncate flex-1">Dettaglio Task</h3>
        <button onClick={onClose} aria-label="Chiudi" className="p-1 rounded-lg text-text-tertiary hover:text-text-secondary hover:bg-surface-hover">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Contesto progetto */}
      {task.project && (
        <Link href={projectHref(task.project.client_id, task.project.id)}
          className="mx-4 mt-4 flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-hover border border-border hover:border-gold/30 transition-colors">
          <FolderKanban className="w-4 h-4 text-gold-text shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-text-primary truncate">{task.project.name}</p>
            {task.project.clients && <p className="text-2xs text-text-secondary truncate">{task.project.clients.company_name}</p>}
          </div>
          <ExternalLink className="w-3 h-3 text-text-secondary shrink-0" />
        </Link>
      )}

      {/* Tabs */}
      <div className="flex gap-1 px-4 mt-3 border-b border-border">
        {TABS.map(t => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`flex items-center gap-1 px-2.5 py-2 text-2xs font-semibold border-b-2 -mb-px transition-colors ${
              tab === t.k ? 'border-gold text-text-primary' : 'border-transparent text-text-tertiary hover:text-text-secondary'
            }`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {tab === 'dettaglio' && (
          <>
            {/* Titolo */}
            {editingTitle && canEdit ? (
              <div className="flex items-center gap-2">
                <input autoFocus value={title} onChange={e => setTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') { setEditingTitle(false); setTitle(task.title) } }}
                  className={inp + ' !text-base !font-bold'} />
                <button onClick={saveTitle} disabled={saving} aria-label="Salva titolo" className="text-gold-text shrink-0">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                </button>
              </div>
            ) : (
              <div className={`flex items-center gap-2 group ${canEdit ? 'cursor-pointer' : ''}`} onClick={() => canEdit && setEditingTitle(true)}>
                <h2 className="text-base font-bold text-text-primary flex-1">{task.title}</h2>
                {canEdit && <Pencil className="w-3.5 h-3.5 text-text-secondary opacity-0 group-hover:opacity-100 shrink-0" />}
              </div>
            )}

            {/* Stato */}
            <div className="space-y-2">
              <p className="text-2xs text-text-tertiary uppercase tracking-wider">Stato</p>
              <div className="flex gap-1.5 flex-wrap">
                {STATUS.map(s => (
                  <button key={s.v} disabled={!canEdit} onClick={() => patch({ status: s.v as Task['status'] })}
                    className={`px-3 py-1.5 rounded-lg text-2xs font-semibold transition-colors ${
                      task.status === s.v ? 'bg-gold text-on-gold' : 'bg-surface-hover text-text-secondary hover:text-text-primary'
                    } ${!canEdit ? 'opacity-60 cursor-default' : ''}`}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Priorità */}
            <div className="space-y-2">
              <p className="text-2xs text-text-tertiary uppercase tracking-wider">Priorità</p>
              <div className="flex gap-1.5">
                {PRIORITY.map(p => (
                  <button key={p.v} disabled={!canEdit} onClick={() => patch({ priority: p.v as Task['priority'] })}
                    className={`px-3 py-1.5 rounded-lg text-2xs font-semibold border transition-colors ${
                      task.priority === p.v ? p.cls : 'bg-surface-hover text-text-secondary border-transparent'
                    } ${!canEdit ? 'opacity-60 cursor-default' : ''}`}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Scadenza + ore stimate */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <p className="text-2xs text-text-tertiary uppercase tracking-wider">Scadenza</p>
                <input type="date" disabled={!canEdit} value={task.due_date ?? ''} aria-label="Scadenza"
                  onChange={e => patch({ due_date: e.target.value || null })} className={inp} />
              </div>
              <div className="space-y-2">
                <p className="text-2xs text-text-tertiary uppercase tracking-wider">Ore stimate</p>
                <input type="number" min="0" step="0.5" disabled={!canEdit} value={task.estimated_hours ?? ''} aria-label="Ore stimate"
                  onChange={e => patch({ estimated_hours: e.target.value ? parseFloat(e.target.value) : null })} className={inp} />
              </div>
            </div>

            {/* Assegnatari (owner + collaboratori) */}
            <div className="space-y-2">
              <p className="text-2xs text-text-tertiary uppercase tracking-wider">Assegnatari</p>
              {canEdit ? (
                <AssigneePicker profiles={profiles} value={ids} onChange={saveAssignees} />
              ) : (
                <p className="text-xs text-text-secondary">{ids.length === 0 ? 'Non assegnata' : profiles.filter(p => ids.includes(p.id)).map(p => p.full_name).join(', ')}</p>
              )}
            </div>

            {/* Descrizione */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-2xs text-text-tertiary uppercase tracking-wider">Descrizione</p>
                {!editingDesc && canEdit && (
                  <button onClick={() => setEditingDesc(true)} aria-label="Modifica descrizione" className="text-text-secondary hover:text-gold-text"><Pencil className="w-3 h-3" /></button>
                )}
              </div>
              {editingDesc && canEdit ? (
                <div className="space-y-2">
                  <textarea autoFocus value={desc} onChange={e => setDesc(e.target.value)} rows={4}
                    placeholder="Aggiungi una descrizione..." className={inp + ' resize-none'} />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => { setEditingDesc(false); setDesc(task.description ?? '') }} className="text-xs text-text-secondary hover:text-text-primary">Annulla</button>
                    <button onClick={saveDesc} disabled={saving} className="flex items-center gap-1 px-3 py-1 bg-gold text-on-gold rounded-lg text-xs font-bold hover:bg-gold/90 disabled:opacity-50">
                      {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Salva
                    </button>
                  </div>
                </div>
              ) : (
                <div onClick={() => canEdit && setEditingDesc(true)} className={canEdit ? 'cursor-pointer' : ''}>
                  {task.description
                    ? <p className="text-xs text-text-secondary leading-relaxed whitespace-pre-line">{task.description}</p>
                    : <p className="text-xs text-text-secondary italic">Nessuna descrizione{canEdit ? ' — clicca per aggiungere' : ''}</p>}
                </div>
              )}
            </div>

            {isTaskDone(task.status) && (
              <p className="text-2xs text-success flex items-center gap-1"><Link2 className="w-3 h-3" /> Task completata</p>
            )}
          </>
        )}

        {tab === 'subtask' && <SubtaskList parentTaskId={task.id} depth={1} />}
        {tab === 'commenti' && <TaskComments taskId={task.id} />}
        {tab === 'ore' && <TimeTracker taskId={task.id} estimatedHours={task.estimated_hours ?? null} />}
      </div>
    </div>
  )
}
