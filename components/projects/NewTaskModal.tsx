'use client'

import { useState } from 'react'
import { CheckSquare, Eye, EyeOff, CornerDownRight, Repeat } from 'lucide-react'
import { ModalShell, Field, Segmented, Avatar, inputCls } from '@/components/shared/formkit'
import type { Priority, Visibility } from '@/lib/types/database'

type Person = { id: string; full_name: string; avatar_url: string | null }

export type NewTaskValues = {
  title: string
  assignee_id: string | null
  due_date: string | null
  priority: Priority
  visibility: Visibility
}

/**
 * Stesso flusso della CTA «Crea → Nuova task», ma con progetto/workstream/milestone
 * già noti dal contesto: qui si sceglie solo il *cosa*, non il *dove*.
 */
export function NewTaskModal({
  context, profiles, pending, kind = 'task', clientVisibleAllowed = true, defaultDue, onClose, onCreate,
}: {
  /** briciole di contesto mostrate in testata, es. "Progetto · Workstream · M1" */
  context: string
  profiles: Person[]
  pending: boolean
  kind?: 'task' | 'subtask' | 'continuous'
  clientVisibleAllowed?: boolean
  defaultDue?: string | null
  onClose: () => void
  onCreate: (v: NewTaskValues, again: boolean) => void
}) {
  const [title, setTitle] = useState('')
  const [assignee, setAssignee] = useState('')
  const [due, setDue] = useState(defaultDue ?? '')
  const [priority, setPriority] = useState<Priority>('media')
  const [visibility, setVisibility] = useState<Visibility>('internal')
  const [again, setAgain] = useState(false)

  const person = profiles.find(p => p.id === assignee)
  const label = kind === 'subtask' ? 'Nuova subtask' : kind === 'continuous' ? 'Nuova attività continuativa' : 'Nuova task'
  const Icon = kind === 'subtask' ? CornerDownRight : kind === 'continuous' ? Repeat : CheckSquare

  const submit = () => {
    onCreate({
      title: title.trim(), assignee_id: assignee || null, due_date: due || null,
      priority, visibility,
    }, again)
    if (again) { setTitle(''); setDue(defaultDue ?? '') }
  }

  return (
    <ModalShell title={label} hint={context} icon={<Icon className="w-4 h-4 text-gold-text" />}
      onClose={onClose} onSubmit={submit} canSubmit={!!title.trim()} pending={pending}
      submitLabel={again ? 'Crea e continua' : 'Crea'}>

      <Field label="Titolo">
        {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
        <input value={title} onChange={e => setTitle(e.target.value)} autoFocus className={inputCls}
          placeholder="Cosa va fatto?" />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Assegnatario">
          <div className="flex items-center gap-2">
            {person && <Avatar name={person.full_name} url={person.avatar_url} />}
            <select value={assignee} onChange={e => setAssignee(e.target.value)} className={inputCls} aria-label="Assegnatario">
              <option value="">— nessuno —</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          </div>
        </Field>
        <Field label="Scadenza" hint={kind === 'continuous' ? 'facoltativa' : undefined}>
          <input type="date" value={due} onChange={e => setDue(e.target.value)} className={inputCls} aria-label="Scadenza" />
        </Field>
      </div>

      <Field label="Priorità">
        <Segmented ariaLabel="Priorità" value={priority} onChange={setPriority}
          options={[{ value: 'alta', label: 'Alta' }, { value: 'media', label: 'Media' }, { value: 'bassa', label: 'Bassa' }]} />
      </Field>

      {clientVisibleAllowed && (
        <button type="button" onClick={() => setVisibility(v => v === 'internal' ? 'client_visible' : 'internal')}
          aria-pressed={visibility === 'client_visible'}
          className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-colors ${
            visibility === 'client_visible' ? 'border-gold bg-gold-dim' : 'border-border hover:bg-surface-hover'
          }`}>
          {visibility === 'client_visible'
            ? <Eye className="w-4 h-4 text-info shrink-0" />
            : <EyeOff className="w-4 h-4 text-text-tertiary shrink-0" />}
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-text-primary">Visibile al cliente</span>
            <span className="block text-2xs text-text-tertiary">Compare nel portale cliente insieme alla milestone</span>
          </span>
        </button>
      )}

      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={again} onChange={e => setAgain(e.target.checked)} />
        <span className="text-2xs text-text-secondary">Resta aperto per aggiungerne un&apos;altra</span>
      </label>
    </ModalShell>
  )
}
