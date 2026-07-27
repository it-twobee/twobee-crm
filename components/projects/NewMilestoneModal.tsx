'use client'

import { useState } from 'react'
import { Flag, Eye, EyeOff, CalendarDays } from 'lucide-react'
import { ModalShell, Field, Avatar, inputCls } from '@/components/shared/formkit'
import { milestoneName, bareMilestone } from '@/lib/project-naming'
import type { Visibility } from '@/lib/types/database'

type Person = { id: string; full_name: string; avatar_url: string | null }

export type NewMilestoneValues = {
  title: string
  due_date: string | null
  owner_id: string | null
  visibility: Visibility
  approval_required: boolean
}

export function NewMilestoneModal({
  context, index, profiles, pending, clientVisibleAllowed = true, suggestedDue, onClose, onCreate,
}: {
  context: string
  /** posizione nella timeline: alimenta il prefisso "M{n} ·" della convention */
  index: number
  profiles: Person[]
  pending: boolean
  clientVisibleAllowed?: boolean
  suggestedDue?: string | null
  onClose: () => void
  onCreate: (v: NewMilestoneValues) => void
}) {
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const [owner, setOwner] = useState('')
  const [visibility, setVisibility] = useState<Visibility>('internal')
  const [approval, setApproval] = useState(false)

  const person = profiles.find(p => p.id === owner)
  const finalName = title.trim() ? milestoneName(index, bareMilestone(title)) : ''

  return (
    <ModalShell title="Nuova milestone" hint={context} icon={<Flag className="w-4 h-4 text-gold-text" />}
      onClose={onClose} pending={pending} canSubmit={!!title.trim()}
      onSubmit={() => onCreate({
        title: finalName, due_date: due || null, owner_id: owner || null,
        visibility, approval_required: approval,
      })}>

      <Field label="Titolo" hint="il prefisso M{n} lo mette la convention">
        {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
        <input value={title} onChange={e => setTitle(e.target.value)} autoFocus className={inputCls}
          placeholder="Kickoff e brief, Consegna sito, Go live…" />
        {finalName && <span className="block text-2xs text-text-tertiary mt-1.5 truncate">Diventerà: {finalName}</span>}
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Scadenza">
          <input type="date" value={due} onChange={e => setDue(e.target.value)} className={inputCls} aria-label="Scadenza" />
          {!due && (
            <span className="flex items-center gap-1.5 text-2xs text-text-tertiary mt-1.5">
              <CalendarDays className="w-3.5 h-3.5 shrink-0" />Senza data resta fuori dal calendario
            </span>
          )}
          {!due && suggestedDue && (
            <button type="button" onClick={() => setDue(suggestedDue)}
              className="text-2xs font-semibold text-gold-text mt-1">Usa {suggestedDue}</button>
          )}
        </Field>
        <Field label="Responsabile">
          <div className="flex items-center gap-2">
            {person && <Avatar name={person.full_name} url={person.avatar_url} />}
            <select value={owner} onChange={e => setOwner(e.target.value)} className={inputCls} aria-label="Responsabile">
              <option value="">— nessuno —</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          </div>
        </Field>
      </div>

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
            <span className="block text-2xs text-text-tertiary">Compare nella roadmap del portale cliente</span>
          </span>
        </button>
      )}

      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={approval} onChange={e => setApproval(e.target.checked)} />
        <span className="text-2xs text-text-secondary">Richiede approvazione prima di essere chiusa</span>
      </label>
    </ModalShell>
  )
}
