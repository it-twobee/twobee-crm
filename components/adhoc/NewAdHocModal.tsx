'use client'

import { useState, useMemo } from 'react'
import { ListTodo, Eye, EyeOff } from 'lucide-react'
import {
  ModalShell, Group, Field, Segmented, SearchInput, PickRow, Avatar, Empty, inputCls,
} from '@/components/shared/formkit'
import type { Priority, Visibility } from '@/lib/types/database'

type Person = { id: string; full_name: string; avatar_url: string | null }
type ClientOpt = { id: string; name: string }

export type AdHocValues = {
  client_id: string
  title: string
  assignee_id: string | null
  due_date: string | null
  priority: Priority
  visibility: Visibility
}

export function NewAdHocModal({
  clients, profiles, pending, fixedClientId, onClose, onCreate,
}: {
  clients: ClientOpt[]
  profiles: Person[]
  pending: boolean
  /** preselezionato quando si crea da un cliente già filtrato */
  fixedClientId?: string
  onClose: () => void
  onCreate: (v: AdHocValues, again: boolean) => void
}) {
  const [clientId, setClientId] = useState(fixedClientId ?? '')
  const [q, setQ] = useState('')
  const [title, setTitle] = useState('')
  const [assignee, setAssignee] = useState('')
  const [due, setDue] = useState('')
  const [priority, setPriority] = useState<Priority>('media')
  const [visibility, setVisibility] = useState<Visibility>('internal')
  const [again, setAgain] = useState(false)

  const client = clients.find(c => c.id === clientId)
  const person = profiles.find(p => p.id === assignee)
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    return t ? clients.filter(c => c.name.toLowerCase().includes(t)) : clients
  }, [clients, q])

  const submit = () => {
    onCreate({
      client_id: clientId, title: title.trim(), assignee_id: assignee || null,
      due_date: due || null, priority, visibility,
    }, again)
    if (again) { setTitle(''); setDue('') }
  }

  return (
    <ModalShell title="Nuova task ad hoc" hint={client?.name ?? 'Per quale cliente?'}
      icon={<ListTodo className="w-4 h-4 text-gold-text" />}
      onClose={onClose} onSubmit={submit} pending={pending}
      canSubmit={!!clientId && !!title.trim()} submitLabel={again ? 'Crea e continua' : 'Crea'}>

      <Group label="Cliente" meta={clientId && !fixedClientId
        ? <button type="button" onClick={() => setClientId('')} className="text-2xs font-semibold text-gold-text">Cambia</button>
        : undefined}>
        {clientId && client ? (
          <PickRow selected onClick={() => { if (!fixedClientId) setClientId('') }}
            icon={<Avatar name={client.name} />} title={client.name} />
        ) : (
          <div className="space-y-2">
            <SearchInput value={q} onChange={setQ} placeholder="Cerca cliente…" autoFocus />
            {filtered.length === 0 ? <Empty>Nessun cliente per «{q}».</Empty> : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {filtered.map(c => (
                  <PickRow key={c.id} selected={false} onClick={() => { setClientId(c.id); setQ('') }}
                    icon={<Avatar name={c.name} />} title={c.name} />
                ))}
              </div>
            )}
          </div>
        )}
      </Group>

      <Field label="Titolo">
        <input value={title} onChange={e => setTitle(e.target.value)} className={inputCls}
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
        <Field label="Scadenza">
          <input type="date" value={due} onChange={e => setDue(e.target.value)} className={inputCls} aria-label="Scadenza" />
        </Field>
      </div>

      <Field label="Priorità">
        <Segmented ariaLabel="Priorità" value={priority} onChange={setPriority}
          options={[{ value: 'alta', label: 'Alta' }, { value: 'media', label: 'Media' }, { value: 'bassa', label: 'Bassa' }]} />
      </Field>

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
          <span className="block text-2xs text-text-tertiary">Compare tra le attività nel suo portale</span>
        </span>
      </button>

      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={again} onChange={e => setAgain(e.target.checked)} />
        <span className="text-2xs text-text-secondary">Resta aperto per aggiungerne un&apos;altra</span>
      </label>
    </ModalShell>
  )
}
