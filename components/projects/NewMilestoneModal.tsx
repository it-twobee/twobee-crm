'use client'

import { useState } from 'react'
import { Flag, Eye, EyeOff, CalendarDays, Loader2 } from 'lucide-react'
import { ModalShell, Field, Avatar, inputCls } from '@/components/shared/formkit'
import { CorsieDelServizio, useServiceCatalog } from '@/components/projects/WorkstreamPresets'
import { modelliDiTipo, type ModelloNodo } from '@/lib/workstream-presets'
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
  context, index, profiles, pending, clientVisibleAllowed = true, suggestedDue,
  servizio = null, onClose, onCreate, onCreaDaModello,
}: {
  context: string
  /** posizione nella timeline: alimenta il prefisso "M{n} ·" della convention */
  index: number
  profiles: Person[]
  pending: boolean
  clientVisibleAllowed?: boolean
  suggestedDue?: string | null
  /** §405 — il servizio del progetto: dice quali tappe propone il modello */
  servizio?: { service_type: string | null; service_subtype: string | null } | null
  onClose: () => void
  onCreate: (v: NewMilestoneValues) => void
  /** senza, le tappe a modello non si propongono: chi non sa crearle non le offre */
  onCreaDaModello?: (m: ModelloNodo) => void
}) {
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const [owner, setOwner] = useState('')
  const [visibility, setVisibility] = useState<Visibility>('internal')
  const [approval, setApproval] = useState(false)

  const person = profiles.find(p => p.id === owner)
  const finalName = title.trim() ? milestoneName(index, bareMilestone(title)) : ''

  /* §405 — le tappe che questo servizio ha di solito, con dentro i loro task.
     Stessa lista del wizard, stessa funzione: la domanda «cosa si fa qui» non
     cambia risposta a seconda della schermata. */
  const { templates, nodes, loading } = useServiceCatalog(!!onCreaDaModello && !!servizio?.service_type)
  const tappe = onCreaDaModello && servizio?.service_type
    ? modelliDiTipo(templates, nodes, [{ service_type: servizio.service_type, service_subtype: servizio.service_subtype }], 'milestone')
    : []

  return (
    <ModalShell title="Nuova milestone" hint={context} icon={<Flag className="w-4 h-4 text-gold-text" />}
      onClose={onClose} pending={pending} canSubmit={!!title.trim()}
      onSubmit={() => onCreate({
        title: finalName, due_date: due || null, owner_id: owner || null,
        visibility, approval_required: approval,
      })}>

      {onCreaDaModello && servizio?.service_type && (loading ? (
        <p className="flex items-center gap-2 text-2xs text-text-tertiary">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cerco le tappe di questo servizio…
        </p>
      ) : tappe.length > 0 && (
        <div>
          <span className="block text-2xs font-semibold text-text-secondary mb-1.5">
            Le tappe di questo servizio
          </span>
          <CorsieDelServizio
            corsie={tappe.map(t => ({
              key: t.key, nome: t.nome, nodeId: t.nodeId, quante: t.quante,
              tipo: 'project' as const, tappe: 0, task: t.figli, ricorrenti: 0,
            }))}
            pending={pending} vuoto="tappa senza task"
            onPick={c => { const m = tappe.find(t => t.key === c.key); if (m) onCreaDaModello(m) }} />
        </div>
      ))}

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
