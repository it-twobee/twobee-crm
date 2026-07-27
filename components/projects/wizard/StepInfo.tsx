'use client'

import { Wand2, CalendarDays, AlertTriangle } from 'lucide-react'
import { StepHead, Field, Segmented, inputCls, Avatar } from '@/components/shared/formkit'
import type { Person, Priority, Visibility } from './types'

const addMonths = (n: number) => {
  const d = new Date(); d.setMonth(d.getMonth() + n)
  return d.toISOString().slice(0, 10)
}
const today = () => new Date().toISOString().slice(0, 10)

export type InfoState = {
  name: string; description: string; startDate: string; targetEnd: string
  managerId: string; priority: Priority; visibility: Visibility
}

export function StepInfo({
  state, patch, suggestedName, profiles, hasClient,
}: {
  state: InfoState
  patch: (p: Partial<InfoState>) => void
  suggestedName: string
  profiles: Person[]
  hasClient: boolean
}) {
  const offConvention = state.name.trim() !== suggestedName && !!suggestedName
  const badRange = !!state.startDate && !!state.targetEnd && state.targetEnd < state.startDate
  const pm = profiles.find(p => p.id === state.managerId)

  return (
    <div className="space-y-4">
      <StepHead title="Le informazioni principali" hint="Il nome segue la convention; puoi sovrascriverlo quando serve." />

      <Field label="Nome progetto">
        <div className="flex gap-2">
          <input value={state.name} onChange={e => patch({ name: e.target.value })} className={inputCls} />
          {offConvention && (
            <button type="button" onClick={() => patch({ name: suggestedName })}
              title={`Riallinea a: ${suggestedName}`}
              className="flex items-center gap-1.5 px-3 rounded-xl border border-border-interactive text-2xs font-semibold text-gold-text hover:bg-surface-hover shrink-0">
              <Wand2 className="w-3.5 h-3.5" />Convention
            </button>
          )}
        </div>
        {offConvention && (
          <span className="block text-2xs text-text-tertiary mt-1.5 truncate">Convention: {suggestedName}</span>
        )}
      </Field>

      <Field label="Descrizione" hint="obiettivo, perimetro, cosa NON include">
        <textarea value={state.description} onChange={e => patch({ description: e.target.value })} rows={3}
          className={`${inputCls} resize-none`} placeholder="Che problema risolve questo progetto?" />
      </Field>

      <div>
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          <span className="text-2xs font-semibold text-text-secondary">Periodo</span>
          <div className="flex gap-1">
            {([['1 mese', 1], ['3 mesi', 3], ['6 mesi', 6], ['1 anno', 12]] as const).map(([l, n]) => (
              <button key={l} type="button"
                onClick={() => patch({ startDate: state.startDate || today(), targetEnd: addMonths(n) })}
                className="px-2 py-0.5 rounded-md bg-surface-active text-2xs font-semibold text-text-secondary hover:text-text-primary">
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <input type="date" aria-label="Data inizio" value={state.startDate}
            onChange={e => patch({ startDate: e.target.value })} className={inputCls} />
          <input type="date" aria-label="Fine desiderata" value={state.targetEnd}
            onChange={e => patch({ targetEnd: e.target.value })} className={inputCls} />
        </div>
        {badRange && (
          <p className="flex items-center gap-1.5 text-2xs text-error mt-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />La fine precede l&apos;inizio.
          </p>
        )}
        {!state.startDate && (
          <p className="flex items-center gap-1.5 text-2xs text-text-tertiary mt-1.5">
            <CalendarDays className="w-3.5 h-3.5" />Senza date il progetto non compare nel calendario milestone.
          </p>
        )}
      </div>

      <Field label="Project Manager" hint="diventa membro e responsabile del progetto">
        <div className="flex items-center gap-2">
          {pm && <Avatar name={pm.full_name} url={pm.avatar_url} />}
          <select value={state.managerId} onChange={e => patch({ managerId: e.target.value })}
            className={inputCls} aria-label="Project Manager">
            <option value="">— nessuno —</option>
            {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}{p.app_role ? ` · ${p.app_role}` : ''}</option>)}
          </select>
        </div>
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Priorità">
          <Segmented ariaLabel="Priorità" value={state.priority} onChange={v => patch({ priority: v })}
            options={[{ value: 'alta', label: 'Alta' }, { value: 'media', label: 'Media' }, { value: 'bassa', label: 'Bassa' }]} />
        </Field>
        <Field label="Visibilità">
          {hasClient ? (
            <Segmented ariaLabel="Visibilità" value={state.visibility} onChange={v => patch({ visibility: v })}
              options={[{ value: 'internal', label: 'Interna' }, { value: 'client_visible', label: 'Visibile al cliente' }]} />
          ) : (
            <div className="px-3 py-1.5 rounded-xl bg-surface-active text-2xs text-text-tertiary">
              Interna — un progetto senza cliente non ha un portale in cui mostrarsi
            </div>
          )}
        </Field>
      </div>
    </div>
  )
}
