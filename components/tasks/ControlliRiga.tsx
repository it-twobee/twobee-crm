'use client'

/**
 * §445 — i tre campi che si cambiano dalla riga di una task: scadenza, stato,
 * assegnatario.
 *
 * Prima erano un `<input type="date">` e un `<select>` che esistevano solo con
 * il mouse sulla riga (`group-hover`): il calendario e l'elenco del browser si
 * aprono **fuori** dalla riga, quindi appena il puntatore ci andava sopra
 * l'hover finiva, il campo spariva e con lui il calendario — non si riusciva a
 * scegliere una data. E lo stato si leggeva e basta: per cambiarlo si apriva la
 * task. Adesso sono bottoni sempre presenti che aprono un riquadro loro
 * (`Popover`, in un portale), che resta aperto finché non si sceglie.
 */

import { useRef, useState } from 'react'
import { Check, CalendarDays, X } from 'lucide-react'
import type { TaskStatusV2 } from '@/lib/types/database'
import { Popover } from '@/components/shared/Popover'
import { MiniCalendario } from '@/components/shared/MiniCalendario'
import { Avatar } from '@/components/shared/formkit'
import { COLUMNS, STATUS_LABEL, TASK_CHIP, addDays, nextMonday, relDays, today, type Person } from './task-ui'

const voce = 'w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-text-primary hover:bg-surface-hover'

/** la scadenza: «3g fa», «oggi», «09-30»; un clic apre le scelte rapide e il mese */
export function ScegliData({ valore, onScegli, disabilitato, etichetta = 'Scadenza', tono }: {
  valore: string | null
  onScegli: (d: string | null) => void
  disabilitato?: boolean
  etichetta?: string
  /** il colore del testo quando non è aperto: lo decide chi conosce lo stato */
  tono?: string
}) {
  const [aperto, setAperto] = useState(false)
  const bottone = useRef<HTMLButtonElement>(null)
  const rel = valore ? relDays(valore) : null
  const scegli = (d: string | null) => { setAperto(false); if (d !== valore) onScegli(d) }
  const rapide: [string, string][] = [['Oggi', today()], ['Domani', addDays(1)], ['Lunedì', nextMonday()], ['Tra una settimana', addDays(7)]]
  return (
    <>
      <button ref={bottone} type="button" disabled={disabilitato} onClick={() => setAperto(v => !v)} aria-expanded={aperto}
        aria-label={`${etichetta}: ${valore ?? 'nessuna'}. Cambia`}
        className={`inline-flex items-center gap-1 text-2xs tabular rounded-lg px-1 py-0.5 -mx-1 hover:bg-surface-active disabled:hover:bg-transparent ${tono ?? rel?.tone ?? 'text-text-tertiary'}`}>
        {rel?.text ?? (valore ? valore.slice(5) : <span className="text-text-tertiary">—</span>)}
      </button>
      <Popover ancora={bottone} aperto={aperto} onChiudi={() => setAperto(false)} etichetta={etichetta} larghezza={290}>
        <div className="p-3 space-y-2.5">
          <div className="flex flex-wrap gap-1">
            {rapide.map(([e, d]) => (
              <button key={e} type="button" onClick={() => scegli(d)}
                className={`text-2xs px-2 py-1 rounded-lg border ${valore === d ? 'border-gold/40 bg-gold-dim text-gold-text font-semibold' : 'border-border text-text-secondary hover:text-text-primary hover:bg-surface-hover'}`}>
                {e}
              </button>
            ))}
            {valore && (
              <button type="button" onClick={() => scegli(null)} className="inline-flex items-center gap-1 text-2xs px-2 py-1 rounded-lg text-text-tertiary hover:text-error">
                <X className="w-3 h-3" />Togli
              </button>
            )}
          </div>
          <MiniCalendario valore={valore ?? today()} oggi={today()} onScegli={scegli} etichetta={etichetta} />
          <p className="flex items-center gap-1 text-2xs text-text-tertiary"><CalendarDays className="w-3 h-3" />
            {valore ? `Adesso: ${valore.slice(8)}/${valore.slice(5, 7)}/${valore.slice(0, 4)}` : 'Nessuna scadenza'}</p>
        </div>
      </Popover>
    </>
  )
}

/** lo stato: il chip è il bottone, come la fase nel commerciale */
export function MenuStato({ valore, onScegli, disabilitato, className = '' }: {
  valore: TaskStatusV2
  onScegli: (s: TaskStatusV2) => void
  disabilitato?: boolean
  className?: string
}) {
  const [aperto, setAperto] = useState(false)
  const bottone = useRef<HTMLButtonElement>(null)
  const scegli = (s: TaskStatusV2) => { setAperto(false); bottone.current?.focus(); if (s !== valore) onScegli(s) }
  return (
    <>
      <button ref={bottone} type="button" disabled={disabilitato} onClick={() => setAperto(v => !v)}
        aria-haspopup="listbox" aria-expanded={aperto} aria-label={`Stato: ${STATUS_LABEL[valore] ?? valore}. Cambia`}
        className={`inline-flex items-center justify-center text-2xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap transition-opacity disabled:cursor-default ${TASK_CHIP[valore] ?? ''} ${disabilitato ? '' : 'hover:opacity-80'} ${className}`}>
        {STATUS_LABEL[valore] ?? valore}
      </button>
      <Popover ancora={bottone} aperto={aperto} onChiudi={() => setAperto(false)} etichetta="Cambia stato" larghezza={200}>
        <div role="listbox" aria-label="Stato" className="py-1">
          {COLUMNS.map(c => (
            <button key={c.key} type="button" role="option" aria-selected={c.key === valore} onClick={() => scegli(c.key)} className={voce}>
              <span className={`text-2xs font-semibold px-2 py-0.5 rounded-full ${TASK_CHIP[c.key]}`}>{c.label}</span>
              {c.key === valore && <Check className="w-3.5 h-3.5 text-gold-text ml-auto" />}
            </button>
          ))}
        </div>
      </Popover>
    </>
  )
}

/** l'assegnatario: nome e avatar, un clic apre l'elenco con la ricerca */
export function ScegliPersona({ valore, persone, onScegli, disabilitato, vuoto = 'non assegnata' }: {
  valore: string | null
  persone: Person[]
  onScegli: (id: string | null) => void
  disabilitato?: boolean
  vuoto?: string
}) {
  const [aperto, setAperto] = useState(false)
  const [q, setQ] = useState('')
  const bottone = useRef<HTMLButtonElement>(null)
  const chi = persone.find(p => p.id === valore) ?? null
  const scegli = (id: string | null) => { setAperto(false); setQ(''); if (id !== valore) onScegli(id) }
  const trovate = persone.filter(p => !q || p.full_name.toLowerCase().includes(q.toLowerCase()))
  return (
    <>
      <button ref={bottone} type="button" disabled={disabilitato} onClick={() => setAperto(v => !v)} aria-expanded={aperto}
        aria-label={`Assegnatario: ${chi?.full_name ?? 'nessuno'}. Cambia`}
        className="flex items-center gap-1.5 min-w-0 rounded-lg px-1 py-0.5 -mx-1 hover:bg-surface-active disabled:hover:bg-transparent text-left">
        {chi
          ? <><Avatar name={chi.full_name} url={chi.avatar_url} size={22} /><span className="text-2xs text-text-secondary truncate">{chi.full_name}</span></>
          : <span className="text-2xs text-warning">{vuoto}</span>}
      </button>
      <Popover ancora={bottone} aperto={aperto} onChiudi={() => { setAperto(false); setQ('') }} etichetta="Assegna" larghezza={240}>
        <div className="py-1">
          {persone.length > 8 && (
            <div className="px-2 py-1.5 border-b border-border">
              <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Cerca" aria-label="Cerca una persona"
                className="w-full bg-background border border-border-interactive rounded-lg px-2 py-1 text-xs text-text-primary" />
            </div>
          )}
          <button type="button" onClick={() => scegli(null)} className={`${voce} text-text-secondary`}>
            Nessuno{!valore && <Check className="w-3.5 h-3.5 text-gold-text ml-auto" />}
          </button>
          {trovate.map(p => (
            <button key={p.id} type="button" onClick={() => scegli(p.id)} className={voce}>
              <Avatar name={p.full_name} url={p.avatar_url} size={20} />
              <span className="truncate">{p.full_name}</span>
              {p.id === valore && <Check className="w-3.5 h-3.5 text-gold-text ml-auto" />}
            </button>
          ))}
        </div>
      </Popover>
    </>
  )
}
