'use client'

import { useEffect, useState, useCallback, useTransition } from 'react'
import { toast } from 'sonner'
import { Plus, Loader2, Trash2, Check, ListTodo } from 'lucide-react'
import { createClient as createBrowserClient } from '@/lib/supabase/client'
import { createAdHocTask, setAdHocTaskStatus, deleteAdHocTask } from '@/app/actions/ad-hoc-tasks'
import type { Profile, Priority, Visibility, TaskStatusV2 } from '@/lib/types/database'

type Row = {
  id: string; title: string; status: TaskStatusV2; priority: Priority
  due_date: string | null; visibility: Visibility; assignee_id: string | null
}
const TONE: Record<string, string> = {
  da_fare: 'text-text-tertiary', in_corso: 'text-info', in_review: 'text-warning',
  richiesta_supporto: 'text-orange', completato: 'text-success',
}

export function ClientAdHocTab({
  clientId, profiles, canManage,
}: {
  clientId: string
  profiles: Pick<Profile, 'id' | 'full_name'>[]
  canManage: boolean
}) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [pending, start] = useTransition()
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [assignee, setAssignee] = useState('')
  const [due, setDue] = useState('')
  const [priority, setPriority] = useState<Priority>('media')
  const [visibility, setVisibility] = useState<Visibility>('internal')

  const reload = useCallback(() => {
    createBrowserClient()
      .from('tasks').select('id,title,status,priority,due_date,visibility,assignee_id')
      .eq('client_id', clientId).eq('task_type', 'ad_hoc').is('deleted_at', null)
      .order('created_at', { ascending: false })
      .then(({ data }) => setRows((data ?? []) as Row[]))
  }, [clientId])

  useEffect(() => { reload() }, [reload])

  const name = (id: string | null) => id ? (profiles.find(p => p.id === id)?.full_name ?? '—') : null

  const submit = () => start(async () => {
    try {
      await createAdHocTask({ client_id: clientId, title, assignee_id: assignee || null, due_date: due || null, priority, visibility })
      toast.success('Task creata'); setAdding(false); setTitle(''); setAssignee(''); setDue(''); setPriority('media'); setVisibility('internal')
      reload()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
  })

  const toggle = (r: Row) => start(async () => {
    try { await setAdHocTaskStatus(r.id, clientId, r.status === 'completato' ? 'da_fare' : 'completato'); reload() }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
  })

  const remove = (r: Row) => start(async () => {
    try { await deleteAdHocTask(r.id, clientId); reload() }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
  })

  return (
    <div className="max-w-6xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-text-primary">Task Ad Hoc</h2>
          <p className="text-2xs text-text-tertiary mt-0.5">Attività slegate da progetti, milestone e workload.</p>
        </div>
        {canManage && !adding && (
          <button onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 text-2xs font-semibold bg-gold text-on-gold px-3 py-1.5 rounded-lg shadow-soft press">
            <Plus className="w-3.5 h-3.5" />Nuova task
          </button>
        )}
      </div>

      {adding && (
        <div className="bg-surface border border-border rounded-lg p-3 space-y-2">
          <input value={title} onChange={e => setTitle(e.target.value)} autoFocus placeholder="Titolo attività"
            className="w-full bg-background border border-border-interactive rounded px-3 py-2 text-sm text-text-primary" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <select value={assignee} onChange={e => setAssignee(e.target.value)} aria-label="Assegnatario"
              className="bg-background border border-border-interactive rounded px-2 py-1.5 text-2xs text-text-primary">
              <option value="">Assegna a…</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
            <input type="date" value={due} onChange={e => setDue(e.target.value)} aria-label="Scadenza"
              className="bg-background border border-border-interactive rounded px-2 py-1.5 text-2xs text-text-primary" />
            <select value={priority} onChange={e => setPriority(e.target.value as Priority)} aria-label="Priorità"
              className="bg-background border border-border-interactive rounded px-2 py-1.5 text-2xs text-text-primary">
              {(['alta', 'media', 'bassa'] as Priority[]).map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={visibility} onChange={e => setVisibility(e.target.value as Visibility)} aria-label="Visibilità"
              className="bg-background border border-border-interactive rounded px-2 py-1.5 text-2xs text-text-primary">
              <option value="internal">Interna</option>
              <option value="client_visible">Cliente</option>
            </select>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setAdding(false)} className="text-2xs font-semibold text-text-secondary px-3 py-1.5">Annulla</button>
            <button onClick={submit} disabled={pending || !title.trim()}
              className="text-2xs font-semibold bg-gold text-on-gold px-3 py-1.5 rounded disabled:opacity-40">Crea</button>
          </div>
        </div>
      )}

      {rows === null ? (
        <div className="flex items-center gap-2 text-sm text-text-tertiary py-8 justify-center"><Loader2 className="w-4 h-4 animate-spin" />Carico…</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border rounded-lg">
          <ListTodo className="w-7 h-7 text-text-tertiary mx-auto mb-2" />
          <p className="text-sm text-text-secondary">Nessuna task ad hoc.</p>
        </div>
      ) : (
        <div className="border border-border rounded-lg divide-y divide-border">
          {rows.map(r => (
            <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 group">
              {canManage ? (
                <button onClick={() => toggle(r)} aria-label="Completa"
                  className={`w-4 h-4 rounded border flex items-center justify-center ${r.status === 'completato' ? 'bg-success border-success' : 'border-border-strong'}`}>
                  {r.status === 'completato' && <Check className="w-3 h-3 text-on-gold" />}
                </button>
              ) : <span className="w-4 h-4" />}
              <span className={`flex-1 text-sm ${r.status === 'completato' ? 'text-text-tertiary line-through' : 'text-text-primary'}`}>{r.title}</span>
              {r.visibility === 'client_visible' && <span className="text-2xs text-info">cliente</span>}
              {name(r.assignee_id) && <span className="text-2xs text-text-tertiary">{name(r.assignee_id)}</span>}
              {r.due_date && <span className="text-2xs text-text-tertiary">{r.due_date}</span>}
              <span className={`text-2xs font-semibold ${TONE[r.status]}`}>{r.status}</span>
              {canManage && (
                <button onClick={() => remove(r)} aria-label="Elimina" className="text-error opacity-0 group-hover:opacity-100">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
