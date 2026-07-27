'use client'

import { useState, useMemo } from 'react'
import {
  ListTodo, Trash2, Eye, EyeOff, Users, Link2, Building2, AlertTriangle, Search,
} from 'lucide-react'
import { ModalShell, Field, Segmented, Avatar, inputCls } from '@/components/shared/formkit'
import { isExternalResource, CLIENT_ROLES } from '@/lib/permissions'
import type { AppRole, Priority, Visibility, TaskStatusV2 } from '@/lib/types/database'

export type AssignablePerson = {
  id: string
  full_name: string
  avatar_url: string | null
  app_role: AppRole | null
  /** valorizzato per i profili cliente: a quale anagrafica appartengono */
  client_id?: string | null
}

export type AdHocDetail = {
  id: string
  client_id: string | null
  title: string
  description?: string | null
  status: TaskStatusV2
  priority: Priority
  due_date: string | null
  visibility: Visibility
  assignee_id: string | null
}

export type AdHocPatch = {
  title?: string
  description?: string | null
  status?: TaskStatusV2
  assignee_id?: string | null
  due_date?: string | null
  priority?: Priority
  visibility?: Visibility
}

const STATUSES: { value: TaskStatusV2; label: string }[] = [
  { value: 'da_fare', label: 'Da fare' },
  { value: 'in_corso', label: 'In corso' },
  { value: 'in_review', label: 'In review' },
  { value: 'completato', label: 'Completata' },
]

type Bucket = 'interni' | 'esterni' | 'cliente'
const bucketOf = (p: AssignablePerson): Bucket =>
  CLIENT_ROLES.includes(p.app_role as AppRole) ? 'cliente'
    : isExternalResource(p.app_role) ? 'esterni' : 'interni'

const BUCKET_META: Record<Bucket, { label: string; icon: React.ReactNode; hint: string }> = {
  interni: { label: 'Team interno', icon: <Users className="w-3.5 h-3.5" />, hint: 'Chi lavora in TWO BEE' },
  esterni: { label: 'Risorse esterne', icon: <Link2 className="w-3.5 h-3.5" />, hint: 'Freelance e partner' },
  cliente: { label: 'Lato cliente', icon: <Building2 className="w-3.5 h-3.5" />, hint: 'Referenti dell\'anagrafica' },
}

export function AdHocDetailModal({
  task, clientLabel, people, canManage, pending, onClose, onSave, onDelete,
}: {
  task: AdHocDetail
  clientLabel: string
  people: AssignablePerson[]
  canManage: boolean
  pending: boolean
  onClose: () => void
  onSave: (patch: AdHocPatch) => void
  onDelete: () => void
}) {
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description ?? '')
  const [status, setStatus] = useState<TaskStatusV2>(
    STATUSES.some(s => s.value === task.status) ? task.status : 'da_fare',
  )
  const [priority, setPriority] = useState<Priority>(task.priority)
  const [due, setDue] = useState(task.due_date ?? '')
  const [visibility, setVisibility] = useState<Visibility>(task.visibility)
  const [assignee, setAssignee] = useState<string | null>(task.assignee_id)
  const [q, setQ] = useState('')

  /** i referenti cliente mostrati sono solo quelli dell'anagrafica di questa task */
  const groups = useMemo(() => {
    const t = q.trim().toLowerCase()
    const out: Record<Bucket, AssignablePerson[]> = { interni: [], esterni: [], cliente: [] }
    for (const p of people) {
      const b = bucketOf(p)
      if (b === 'cliente' && (!task.client_id || p.client_id !== task.client_id)) continue
      if (t && !p.full_name.toLowerCase().includes(t)) continue
      out[b].push(p)
    }
    return out
  }, [people, q, task.client_id])

  const picked = people.find(p => p.id === assignee) ?? null
  const pickedBucket = picked ? bucketOf(picked) : null
  // una task assegnata al cliente ma interna: lui non la vedrà mai
  const clientBlind = pickedBucket === 'cliente' && visibility !== 'client_visible'

  const dirty =
    title.trim() !== task.title ||
    (description.trim() || null) !== (task.description ?? null) ||
    status !== task.status || priority !== task.priority ||
    (due || null) !== task.due_date || visibility !== task.visibility ||
    (assignee ?? null) !== task.assignee_id

  const save = () => onSave({
    title: title.trim(), description: description.trim() || null, status,
    priority, due_date: due || null, visibility, assignee_id: assignee ?? null,
  })

  return (
    <ModalShell title="Dettaglio task ad hoc" hint={clientLabel}
      icon={<ListTodo className="w-4 h-4 text-gold-text" />}
      onClose={onClose} onSubmit={save} pending={pending}
      canSubmit={canManage && dirty && !!title.trim()}
      submitLabel={dirty ? 'Salva modifiche' : 'Nessuna modifica'}>

      <Field label="Titolo">
        <input value={title} onChange={e => setTitle(e.target.value)} disabled={!canManage}
          className={inputCls} placeholder="Cosa va fatto?" />
      </Field>

      <Field label="Dettagli" hint="contesto, link, cosa serve per chiuderla">
        <textarea value={description} onChange={e => setDescription(e.target.value)} disabled={!canManage}
          rows={4} className={`${inputCls} resize-none`}
          placeholder="Descrivi la richiesta: cosa serve, entro quando, con quali riferimenti." />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Stato">
          <Segmented ariaLabel="Stato" value={status} onChange={setStatus} options={STATUSES} />
        </Field>
        <Field label="Priorità">
          <Segmented ariaLabel="Priorità" value={priority} onChange={setPriority}
            options={[{ value: 'alta', label: 'Alta' }, { value: 'media', label: 'Media' }, { value: 'bassa', label: 'Bassa' }]} />
        </Field>
      </div>

      <Field label="Scadenza">
        <input type="date" value={due} onChange={e => setDue(e.target.value)} disabled={!canManage}
          className={inputCls} aria-label="Scadenza" />
      </Field>

      {/* assegnatario: interni · esterni · lato cliente */}
      <div>
        <div className="flex items-baseline justify-between gap-2 mb-1.5">
          <span className="text-2xs font-semibold text-text-secondary">Assegnata a</span>
          {picked && canManage && (
            <button type="button" onClick={() => setAssignee(null)} className="text-2xs font-semibold text-text-tertiary hover:text-error">
              Togli assegnazione
            </button>
          )}
        </div>

        {picked && (
          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-gold bg-gold-dim mb-2">
            <Avatar name={picked.full_name} url={picked.avatar_url} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-text-primary truncate">{picked.full_name}</span>
              <span className="block text-2xs text-text-tertiary">
                {pickedBucket && BUCKET_META[pickedBucket].label}{picked.app_role ? ` · ${picked.app_role}` : ''}
              </span>
            </span>
          </div>
        )}

        {canManage && (
          <>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cerca una persona…"
                aria-label="Cerca assegnatario" className={`${inputCls} pl-9`} />
            </div>
            <div className="max-h-56 overflow-y-auto pr-1 space-y-3">
              {(['interni', 'esterni', 'cliente'] as Bucket[]).map(b => {
                const list = groups[b]
                if (b === 'cliente' && !task.client_id) return null
                return (
                  <div key={b}>
                    <div className="flex items-center gap-1.5 text-2xs font-semibold text-text-tertiary mb-1.5">
                      {BUCKET_META[b].icon}{BUCKET_META[b].label}
                      <span className="tabular">{list.length}</span>
                      <span className="text-text-tertiary/70">· {BUCKET_META[b].hint}</span>
                    </div>
                    {list.length === 0 ? (
                      <p className="text-2xs text-text-tertiary px-1">
                        {b === 'cliente' ? 'Nessun referente collegato a questa anagrafica.' : 'Nessun risultato.'}
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {list.map(p => (
                          <button key={p.id} type="button" onClick={() => setAssignee(p.id)}
                            aria-pressed={assignee === p.id}
                            className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl border text-left transition-colors ${
                              assignee === p.id ? 'border-gold bg-gold-dim' : 'border-border hover:bg-surface-hover'
                            }`}>
                            <Avatar name={p.full_name} url={p.avatar_url} size={24} />
                            <span className="flex-1 min-w-0 text-sm text-text-primary truncate">{p.full_name}</span>
                            {p.app_role && <span className="text-2xs text-text-tertiary shrink-0">{p.app_role}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      <button type="button" onClick={() => canManage && setVisibility(v => v === 'internal' ? 'client_visible' : 'internal')}
        disabled={!canManage} aria-pressed={visibility === 'client_visible'}
        className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-colors disabled:opacity-60 ${
          visibility === 'client_visible' ? 'border-gold bg-gold-dim' : 'border-border hover:bg-surface-hover'
        }`}>
        {visibility === 'client_visible'
          ? <Eye className="w-4 h-4 text-info shrink-0" />
          : <EyeOff className="w-4 h-4 text-text-tertiary shrink-0" />}
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-text-primary">Visibile al cliente</span>
          <span className="block text-2xs text-text-tertiary">Compare tra le attività nel suo portale</span>
        </span>
      </button>

      {clientBlind && (
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-warning-dim">
          <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0" />
          <span className="flex-1 text-2xs text-warning">
            È assegnata a un referente del cliente ma resta interna: lui non la vedrà.
          </span>
          <button type="button" onClick={() => setVisibility('client_visible')}
            className="text-2xs font-semibold text-text-primary underline underline-offset-2 shrink-0 hover:opacity-80">
            Rendila visibile
          </button>
        </div>
      )}

      {canManage && (
        <div className="pt-1 border-t border-border">
          <button type="button" onClick={() => { if (confirm(`Eliminare "${task.title}"?`)) onDelete() }}
            className="flex items-center gap-1.5 text-2xs font-semibold text-error hover:opacity-80">
            <Trash2 className="w-3.5 h-3.5" />Elimina task
          </button>
        </div>
      )}
    </ModalShell>
  )
}
