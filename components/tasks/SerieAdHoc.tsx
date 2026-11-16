'use client'

import { useState } from 'react'
import { ChevronDown, Repeat } from 'lucide-react'
import { updateRecurring, deleteRecurring } from '@/app/actions/recurring'
import { RecurringRow, RecurringForm } from '@/components/projects/RecurringEditor'
import { nextOccurrence } from '@/lib/recurrence'
import { isPortalAccount } from '@/lib/permissions'
import type { SerieAdHocRow } from '@/lib/serie-ad-hoc'
import type { AssignablePerson } from './TaskDetailModal'

/**
 * §501 — Le serie ad hoc, dove le task ad hoc si leggono.
 *
 * Una ricorrente di progetto ha il suo pannello sulla corsia; una ad hoc non ha
 * una corsia, e una serie che non si vede non si può né correggere né fermare
 * (§469). Sta in fondo, chiusa e contata come le completate (§283): le
 * occorrenze sono già nell'elenco con la loro data, qui c'è la regola.
 */
export function SerieAdHoc({ serie, profiles, clientName, pending, act }: {
  serie: SerieAdHocRow[]
  profiles: AssignablePerson[]
  clientName: (id: string | null) => string
  pending: boolean
  act: (fn: () => Promise<unknown>, ok?: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  if (!serie.length) return null

  // §409 — un account del portale non riceve il nostro lavoro
  const interni = profiles.filter(p => !isPortalAccount(p))
  const oggi = new Date().toISOString().slice(0, 10)
  const prossime = serie.filter(s => s.active).map(s => nextOccurrence(s, oggi)).filter(Boolean) as string[]
  const prossima = prossime.sort()[0]

  return (
    <div className="mt-4 rounded-xl border border-border overflow-hidden">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        className="w-full flex items-center gap-2 px-4 py-2.5 bg-surface-hover/60 hover:bg-surface-hover text-left">
        <ChevronDown className={`w-3.5 h-3.5 text-text-tertiary transition-transform ${open ? '' : '-rotate-90'}`} />
        <Repeat className="w-3.5 h-3.5 text-success" />
        <span className="text-2xs font-bold text-text-secondary">Si ripetono · {serie.length}</span>
        <span className="text-2xs text-text-tertiary ml-auto">
          {prossima
            ? <>la prossima il {new Date(`${prossima}T00:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}</>
            : 'nessuna data in arrivo'}
        </span>
      </button>

      {open && (
        <div className="px-4 py-2">
          {serie.map(s => editing === s.id ? (
            <RecurringForm key={s.id} profiles={interni} pending={pending} visibilita={!!s.client_id}
              initial={{
                title: s.title, frequency: s.frequency, interval: s.interval, weekdays: s.weekdays ?? [],
                day_of_month: s.day_of_month, start_date: s.start_date, end_date: s.end_date,
                owner_id: s.owner_id, visibility: s.visibility,
              }}
              onCancel={() => setEditing(null)}
              onSave={v => { act(() => updateRecurring(s.id, v), 'Aggiornata'); setEditing(null) }} />
          ) : (
            <RecurringRow key={s.id} id={s.id} title={s.title} active={s.active}
              contesto={s.client_id ? clientName(s.client_id) : 'Nessun cliente'}
              rule={s} visibility={s.visibility} ownerId={s.owner_id}
              accent="text-success" Icon={Repeat}
              profiles={interni} canEdit={s.puoModificare} pending={pending}
              onOwner={v => act(() => updateRecurring(s.id, { owner_id: v }),
                v ? 'Assegnata: le prossime occorrenze sono sue' : 'Responsabile tolto')}
              onToggle={() => act(() => updateRecurring(s.id, { active: !s.active }), s.active ? 'Sospesa' : 'Riattivata')}
              onEdit={() => setEditing(s.id)}
              onDelete={() => { if (confirm(`Eliminare "${s.title}"? Le occorrenze già generate restano.`)) act(() => deleteRecurring(s.id), 'Eliminata') }} />
          ))}
        </div>
      )}
    </div>
  )
}
