'use client'

import { useState } from 'react'
import { ChevronDown, RotateCcw, CheckCircle2 } from 'lucide-react'

/**
 * §283 — Le task completate, in una sezione che si apre.
 *
 * Spuntare «fatta» le faceva sparire, e non c'era modo di tornare indietro: nel
 * workspace la query stessa le escludeva, negli elenchi ad hoc il filtro di
 * partenza è «aperte». Una spunta per sbaglio — e succede, la casella è grande
 * quanto il dito — voleva dire riscrivere la task da capo, con la descrizione,
 * l'assegnatario e la scadenza persi.
 *
 * Tre scelte, e nessuna è estetica:
 *
 * **Chiusa di default, ma contata.** Il numero sul bordo dice che ci sono e non
 * occupa lo spazio di chi deve lavorare: una lista di cose fatte in mezzo alle
 * cose da fare è il modo più veloce di non vedere né le une né le altre.
 *
 * **La data di completamento sta su ogni riga**, non la scadenza: di una task
 * chiusa la domanda è «quando l'abbiamo finita», e la scadenza che aveva non
 * serve più a nessuno.
 *
 * **Quanto le resta da vivere si dichiara in testa.** Spariscono da sole dopo
 * sessanta giorni (migration 211): dirlo dopo, quando sono già sparite, sarebbe
 * come non dirlo — e questa sezione esiste proprio perché una cosa che sparisce
 * senza preavviso è una cosa persa.
 */
export function CompletedTasks({ items, onReopen, pending, days = 60 }: {
  items: { id: string; title: string; completedAt?: string | null; who?: string | null }[]
  onReopen: (id: string) => void
  pending?: boolean
  days?: number
}) {
  const [open, setOpen] = useState(false)
  if (!items.length) return null

  const giorno = (iso?: string | null) => {
    if (!iso) return 'data non registrata'
    const d = new Date(iso)
    return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })
  }
  /* Quanti giorni le restano: sotto la settimana si dice, perché è l'unico
     momento in cui uno potrebbe volerne riaprire una prima che se ne vada. */
  const restano = (iso?: string | null) => {
    if (!iso) return null
    const g = days - Math.floor((Date.now() - new Date(iso).getTime()) / 864e5)
    return g <= 7 ? g : null
  }
  const inScadenza = items.filter(i => (restano(i.completedAt) ?? 99) <= 7).length

  return (
    <div className="mt-4 rounded-xl border border-border overflow-hidden">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        className="w-full flex items-center gap-2 px-4 py-2.5 bg-surface-hover/60 hover:bg-surface-hover text-left">
        <ChevronDown className={`w-3.5 h-3.5 text-text-tertiary transition-transform ${open ? '' : '-rotate-90'}`} />
        <CheckCircle2 className="w-3.5 h-3.5 text-success" />
        <span className="text-2xs font-bold text-text-secondary">
          Completate · {items.length}
        </span>
        <span className="text-2xs text-text-tertiary ml-auto">
          si cancellano da sole {days} giorni dopo
          {inScadenza > 0 && (
            <span className="text-warning font-semibold"> · {inScadenza} entro la settimana</span>
          )}
        </span>
      </button>

      {open && (
        <ul className="divide-y divide-border/60">
          {items.map(i => {
            const g = restano(i.completedAt)
            return (
              <li key={i.id} className="flex items-baseline gap-3 px-4 py-2 hover:bg-surface-hover">
                <span className="text-2xs text-text-secondary flex-1 min-w-0 truncate line-through decoration-text-tertiary/50">
                  {i.title}
                </span>
                {i.who && <span className="text-2xs text-text-tertiary shrink-0 truncate max-w-[120px]">{i.who}</span>}
                <span className="text-2xs text-text-tertiary shrink-0">
                  {giorno(i.completedAt)}
                  {g != null && <span className="text-warning"> · restano {g > 0 ? `${g} giorni` : 'poche ore'}</span>}
                </span>
                <button onClick={() => onReopen(i.id)} disabled={pending}
                  className="flex items-center gap-1 text-2xs font-semibold text-gold-text hover:underline shrink-0 disabled:opacity-40">
                  <RotateCcw className="w-3 h-3" />riapri
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
