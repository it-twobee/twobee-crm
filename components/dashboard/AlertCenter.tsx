'use client'

import { useState } from 'react'
import Link from 'next/link'
import { X, AlertTriangle, FileText, Ticket, TrendingDown, Clock, CheckCircle2 } from 'lucide-react'

export type AlertSeverity = 'critico' | 'attenzione' | 'info'

export interface DashAlert {
  id: string
  severity: AlertSeverity
  icon: 'invoice' | 'kpi' | 'ticket' | 'client' | 'task'
  title: string
  detail: string
  href: string
  time?: string
}

interface Props {
  alerts: DashAlert[]
}

const SEVERITY: Record<AlertSeverity, { color: string; bg: string; border: string }> = {
  critico:    { color: 'var(--color-error)', bg: 'rgba(239,68,68,0.06)', border: 'rgba(239,68,68,0.12)' },
  attenzione: { color: 'var(--color-gold-text)', bg: 'var(--color-gold-dim)', border: 'var(--color-gold-dim)' },
  info:       { color: 'var(--color-info)', bg: 'rgba(83,189,235,0.06)', border: 'rgba(83,189,235,0.12)' },
}

const ICONS = {
  invoice: <FileText className="w-3.5 h-3.5" />,
  kpi:     <TrendingDown className="w-3.5 h-3.5" />,
  ticket:  <Ticket className="w-3.5 h-3.5" />,
  client:  <AlertTriangle className="w-3.5 h-3.5" />,
  task:    <Clock className="w-3.5 h-3.5" />,
}

export function AlertCenter({ alerts: initial }: Props) {
  const [alerts] = useState(initial)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const visible = alerts.filter(a => !dismissed.has(a.id))
  const dismiss = (id: string) => setDismissed(p => { const n = new Set(p); n.add(id); return n })

  return (
    <div className="p-5 h-full overflow-auto">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold text-overlay/30 uppercase tracking-widest">Alert</p>
          {visible.length > 0 && (
            <span className="text-2xs font-black bg-error/10 text-error px-2 py-0.5 rounded-full">
              {visible.length}
            </span>
          )}
        </div>
        {visible.length > 0 && (
          <button onClick={() => setDismissed(new Set(alerts.map(a => a.id)))}
            className="text-2xs text-overlay/30 hover:text-overlay/60 transition-colors">
            Ignora tutti
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="flex items-center gap-3 py-3 text-success">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <div>
            <p className="text-sm font-bold">Tutto sotto controllo</p>
            <p className="text-xs text-overlay/30 mt-0.5">Nessuna azione urgente richiesta</p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map(alert => {
            const s = SEVERITY[alert.severity]
            return (
              <div key={alert.id} className="flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors group"
                style={{ background: s.bg, border: `1px solid ${s.border}` }}>
                <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                  style={{ background: `color-mix(in srgb, ${s.color} 8%, transparent)`, color: s.color }}>
                  {ICONS[alert.icon]}
                </div>
                <Link href={alert.href} className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-overlay/90 leading-snug">{alert.title}</p>
                  <p className="text-2xs text-overlay/30 mt-0.5 leading-snug">{alert.detail}</p>
                  {alert.time && <p className="text-2xs text-overlay/20 mt-1">{alert.time}</p>}
                </Link>
                <button onClick={() => dismiss(alert.id)}
                  className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-overlay/15 hover:text-overlay/40 mt-0.5">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
