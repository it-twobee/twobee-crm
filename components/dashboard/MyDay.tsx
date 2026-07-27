'use client'

import Link from 'next/link'
import { CheckSquare, PartyPopper, Repeat } from 'lucide-react'

export type MyDayRow = {
  id: string
  title: string
  dueDate: string | null
  priority: string
  where: string
  recurring: boolean
}

const PRIO_DOT: Record<string, string> = { alta: 'bg-error', media: 'bg-warning', bassa: 'bg-text-tertiary' }
const today = () => new Date().toISOString().slice(0, 10)
const rel = (iso: string | null) => {
  if (!iso) return { text: 'senza data', tone: 'text-text-tertiary' }
  const d = Math.round((new Date(iso + 'T00:00:00').getTime() - new Date(today() + 'T00:00:00').getTime()) / 86400000)
  if (d < 0) return { text: `${-d}g fa`, tone: 'text-error' }
  if (d === 0) return { text: 'oggi', tone: 'text-warning' }
  if (d === 1) return { text: 'domani', tone: 'text-warning' }
  return { text: `tra ${d}g`, tone: 'text-text-secondary' }
}

/** Le mie task che scadono adesso: il ponte fra dashboard e "Le mie attività". */
export function MyDay({ rows, overdue }: { rows: MyDayRow[]; overdue: number }) {
  if (rows.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 p-6 text-center">
        <PartyPopper className="w-7 h-7 text-success" />
        <p className="text-2xs text-text-tertiary">Niente in scadenza per te. Giornata pulita.</p>
        <Link href="/le-mie-attivita" className="text-2xs font-semibold text-gold-text">Vedi tutte le tue attività</Link>
      </div>
    )
  }
  return (
    <div className="flex flex-col h-full">
      {overdue > 0 && (
        <Link href="/le-mie-attivita"
          className="flex items-center gap-2 mx-2 mt-2 px-2.5 py-2 rounded-xl bg-error-dim hover:opacity-90 transition-opacity">
          <span className="text-sm font-black tabular text-error">{overdue}</span>
          <span className="text-2xs font-semibold text-error">in ritardo — recuperale per prime</span>
        </Link>
      )}
      <div className="p-2 space-y-0.5 flex-1">
        {rows.map(r => {
          const t = rel(r.dueDate)
          return (
            <Link key={r.id} href="/le-mie-attivita"
              className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl hover:bg-surface-hover transition-colors">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${PRIO_DOT[r.priority] ?? 'bg-text-tertiary'}`} />
              {r.recurring
                ? <Repeat className="w-3.5 h-3.5 text-success shrink-0" />
                : <CheckSquare className="w-3.5 h-3.5 text-text-tertiary shrink-0" />}
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-text-primary truncate">{r.title}</span>
                <span className="block text-2xs text-text-tertiary truncate">{r.where}</span>
              </span>
              <span className={`text-2xs font-semibold tabular shrink-0 ${t.tone}`}>{t.text}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
