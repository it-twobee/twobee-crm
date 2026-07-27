'use client'

import Link from 'next/link'
import { Flag, CalendarCheck } from 'lucide-react'

export type DeliveryRow = {
  id: string
  title: string
  project: string
  client: string
  dueDate: string
  href: string
}

const today = () => new Date().toISOString().slice(0, 10)
const rel = (iso: string) => {
  const d = Math.round((new Date(iso + 'T00:00:00').getTime() - new Date(today() + 'T00:00:00').getTime()) / 86400000)
  if (d < 0) return { text: `${-d}g fa`, tone: 'text-error', dot: 'bg-error' }
  if (d === 0) return { text: 'oggi', tone: 'text-warning', dot: 'bg-warning' }
  if (d === 1) return { text: 'domani', tone: 'text-warning', dot: 'bg-warning' }
  if (d <= 7) return { text: `tra ${d}g`, tone: 'text-warning', dot: 'bg-warning' }
  if (d <= 30) return { text: `tra ${d}g`, tone: 'text-info', dot: 'bg-info' }
  return { text: iso.slice(5), tone: 'text-text-tertiary', dot: 'bg-text-tertiary' }
}

/** Le prossime consegne del portafoglio, scadute in cima. */
export function NextDeliveries({ rows }: { rows: DeliveryRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 p-6 text-center">
        <CalendarCheck className="w-7 h-7 text-text-tertiary" />
        <p className="text-2xs text-text-tertiary">Nessuna milestone datata nei progetti in corso.</p>
        <Link href="/progetti" className="text-2xs font-semibold text-gold-text">Apri i progetti</Link>
      </div>
    )
  }
  return (
    <div className="p-2 space-y-0.5">
      {rows.map(r => {
        const t = rel(r.dueDate)
        return (
          <Link key={r.id} href={r.href}
            className="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-surface-hover transition-colors group">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.dot}`} aria-hidden />
            <Flag className="w-3.5 h-3.5 text-info shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-text-primary truncate">{r.title}</span>
              <span className="block text-2xs text-text-tertiary truncate">{r.client} · {r.project}</span>
            </span>
            <span className={`text-2xs font-semibold tabular shrink-0 ${t.tone}`}>{t.text}</span>
          </Link>
        )
      })}
    </div>
  )
}
