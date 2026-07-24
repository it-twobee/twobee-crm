'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { List, LayoutGrid, AlertTriangle, Repeat } from 'lucide-react'
import { TaskDetailDrawer } from '@/components/projects/TaskDetailDrawer'
import { updateTaskStatus } from '@/app/actions/tasks'
import type { Task, TaskStatusV2 } from '@/lib/types/database'

type Person = { id: string; full_name: string }

const COLUMNS: { key: TaskStatusV2; label: string }[] = [
  { key: 'da_fare', label: 'Da fare' },
  { key: 'in_corso', label: 'In corso' },
  { key: 'in_review', label: 'In review' },
  { key: 'richiesta_supporto', label: 'Supporto' },
  { key: 'completato', label: 'Completato' },
]
const TASK_TONE: Record<string, string> = {
  da_fare: 'text-text-tertiary', in_corso: 'text-info', in_review: 'text-warning',
  richiesta_supporto: 'text-orange', completato: 'text-success',
}
const today = () => new Date().toISOString().slice(0, 10)
const isOverdue = (t: Task) => !!t.due_date && t.status !== 'completato' && t.due_date < today()

export function MyTasksClient({
  tasks, profiles, projectName, clientName,
}: {
  tasks: Task[]
  profiles: Person[]
  projectName: Record<string, string>
  clientName: Record<string, string>
}) {
  const router = useRouter()
  const [, start] = useTransition()
  const [view, setView] = useState<'lista' | 'board'>('lista')
  const [selected, setSelected] = useState<Task | null>(null)
  const [hideDone, setHideDone] = useState(true)

  const shown = useMemo(() => tasks.filter(t => !hideDone || t.status !== 'completato'), [tasks, hideDone])
  const ctx = (t: Task) => t.task_type === 'ad_hoc'
    ? `Ad Hoc · ${clientName[t.client_id] ?? ''}`
    : `${projectName[t.project_id ?? ''] ?? 'Progetto'} · ${clientName[t.client_id] ?? ''}`

  const refresh = () => router.refresh()
  const move = (t: Task, status: TaskStatusV2) => start(async () => {
    try { await updateTaskStatus(t.id, status); refresh() }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
  })

  // raggruppa per progetto/ad hoc per la lista
  const groups = useMemo(() => {
    const m = new Map<string, { label: string; items: Task[] }>()
    shown.forEach(t => {
      const key = t.task_type === 'ad_hoc' ? `adhoc:${t.client_id}` : `proj:${t.project_id}`
      const label = t.task_type === 'ad_hoc' ? `Ad Hoc — ${clientName[t.client_id] ?? ''}` : (projectName[t.project_id ?? ''] ?? 'Progetto')
      if (!m.has(key)) m.set(key, { label, items: [] })
      m.get(key)!.items.push(t)
    })
    return Array.from(m.values())
  }, [shown, projectName, clientName])

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex bg-surface border border-border rounded-lg p-0.5">
          {([['lista', List], ['board', LayoutGrid]] as const).map(([v, Icon]) => (
            <button key={v} onClick={() => setView(v)} aria-label={v}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-2xs font-semibold capitalize ${view === v ? 'bg-gold text-on-gold' : 'text-text-secondary hover:text-text-primary'}`}>
              <Icon className="w-3.5 h-3.5" />{v}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1 text-2xs text-text-secondary">
          <input type="checkbox" checked={hideDone} onChange={e => setHideDone(e.target.checked)} />Nascondi completate
        </label>
        <span className="text-2xs text-text-tertiary ml-auto">{shown.length} task</span>
      </div>

      {shown.length === 0 && <p className="text-sm text-text-tertiary text-center py-10">Nessuna attività assegnata.</p>}

      {view === 'lista' && shown.length > 0 && (
        <div className="space-y-4">
          {groups.map(g => (
            <div key={g.label}>
              <div className="text-2xs font-semibold text-text-tertiary mb-1">{g.label}</div>
              <div className="border border-border rounded-lg divide-y divide-border">
                {g.items.map(t => (
                  <button key={t.id} onClick={() => setSelected(t)} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-surface-hover text-left">
                    {t.is_recurring_instance && <Repeat className="w-3.5 h-3.5 text-success shrink-0" />}
                    <span className="flex-1 text-sm text-text-primary truncate">{t.title}</span>
                    {isOverdue(t) && <AlertTriangle className="w-3.5 h-3.5 text-error" />}
                    {t.due_date && <span className="text-2xs text-text-tertiary">{t.due_date}</span>}
                    <span className={`text-2xs font-semibold ${TASK_TONE[t.status]}`}>{t.status}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {view === 'board' && shown.length > 0 && (
        <BoardView tasks={shown} onOpen={setSelected} onMove={move} />
      )}

      {selected && (
        <TaskDetailDrawer task={selected} profiles={profiles} canEdit
          contextLabel={ctx(selected)}
          onClose={() => setSelected(null)} onChanged={refresh} />
      )}
    </div>
  )
}

function BoardView({ tasks, onOpen, onMove }: {
  tasks: Task[]; onOpen: (t: Task) => void; onMove: (t: Task, s: TaskStatusV2) => void
}) {
  const [dragId, setDragId] = useState<string | null>(null)
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {COLUMNS.map(col => {
        const items = tasks.filter(t => t.status === col.key)
        return (
          <div key={col.key}
            onDragOver={e => e.preventDefault()}
            onDrop={() => { if (dragId) { const t = tasks.find(x => x.id === dragId); if (t && t.status !== col.key) onMove(t, col.key); setDragId(null) } }}
            className="shrink-0 w-56 bg-background border border-border rounded-lg p-2">
            <div className="flex items-center justify-between px-1 pb-2">
              <span className={`text-2xs font-bold ${TASK_TONE[col.key]}`}>{col.label}</span>
              <span className="text-2xs text-text-tertiary">{items.length}</span>
            </div>
            <div className="space-y-1.5">
              {items.map(t => (
                <div key={t.id} draggable onDragStart={() => setDragId(t.id)} onClick={() => onOpen(t)}
                  className="bg-surface border border-border rounded p-2 cursor-pointer hover:border-border-strong">
                  <div className="flex items-start gap-1">
                    {t.is_recurring_instance && <Repeat className="w-3 h-3 text-success mt-0.5 shrink-0" />}
                    <span className="text-2xs text-text-primary">{t.title}</span>
                  </div>
                  {t.due_date && (
                    <div className="flex items-center gap-1 mt-1">
                      {isOverdue(t) && <AlertTriangle className="w-3 h-3 text-error" />}
                      <span className="text-2xs text-text-tertiary">{t.due_date.slice(5)}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
