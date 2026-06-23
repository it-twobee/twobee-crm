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
  critico:    { color: '#EF4444', bg: '#EF444415', border: '#EF444430' },
  attenzione: { color: '#F5C800', bg: '#F5C80015', border: '#F5C80030' },
  info:       { color: '#3B82F6', bg: '#3B82F615', border: '#3B82F630' },
}

const ICONS = {
  invoice: <FileText className="w-3.5 h-3.5" />,
  kpi:     <TrendingDown className="w-3.5 h-3.5" />,
  ticket:  <Ticket className="w-3.5 h-3.5" />,
  client:  <AlertTriangle className="w-3.5 h-3.5" />,
  task:    <Clock className="w-3.5 h-3.5" />,
}

export function AlertCenter({ alerts: initial }: Props) {
  const [alerts, setAlerts] = useState(initial)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const visible = alerts.filter(a => !dismissed.has(a.id))
  const dismiss = (id: string) => setDismissed(p => { const n = new Set(p); n.add(id); return n })

  return (
    <div className="bg-surface border border-[#2A2A2A] rounded-xl p-5 h-full overflow-auto">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <p className="text-xs font-bold text-text-secondary uppercase tracking-widest">Alert</p>
          {visible.length > 0 && (
            <span className="text-[10px] font-black bg-error/20 text-error px-2 py-0.5 rounded-full">
              {visible.length}
            </span>
          )}
        </div>
        {visible.length > 0 && (
          <button onClick={() => setDismissed(new Set(alerts.map(a => a.id)))}
            className="text-[10px] text-text-secondary hover:text-white transition-colors">
            Ignora tutti
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="flex items-center gap-3 py-3 text-success">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <div>
            <p className="text-sm font-bold">Tutto sotto controllo</p>
            <p className="text-xs text-text-secondary mt-0.5">Nessuna azione urgente richiesta</p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map(alert => {
            const s = SEVERITY[alert.severity]
            return (
              <div key={alert.id} className="flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors group"
                style={{ background: s.bg, border: `1px solid ${s.border}` }}>
                <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5"
                  style={{ background: s.color + '20', color: s.color }}>
                  {ICONS[alert.icon]}
                </div>
                <Link href={alert.href} className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-white leading-snug">{alert.title}</p>
                  <p className="text-[10px] text-text-secondary mt-0.5 leading-snug">{alert.detail}</p>
                  {alert.time && <p className="text-[9px] text-[#444] mt-1">{alert.time}</p>}
                </Link>
                <button onClick={() => dismiss(alert.id)}
                  className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-[#444] hover:text-text-secondary mt-0.5">
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
