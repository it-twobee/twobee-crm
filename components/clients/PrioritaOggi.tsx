'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Clock, TrendingDown, RefreshCw, ChevronRight, X } from 'lucide-react'
import { hasContracts } from '@/lib/clients'
import type { RiskResult } from '@/lib/risk'
import type { Client } from '@/lib/types/database'

interface Alert {
  clientId: string
  companyName: string
  type: 'contratto' | 'pagamento' | 'stato' | 'rischio'
  label: string
  detail: string
  urgency: 'alta' | 'media'
}

function buildAlerts(clients: Client[], billing: Set<string>, risks: Record<string, RiskResult>): Alert[] {
  const today = new Date()
  const alerts: Alert[] = []

  for (const c of clients) {
    // Contratto in scadenza entro 30 giorni
    // §177: solo chi ha un contratto può averlo in scadenza
    if (c.contract_end && hasContracts(c)) {
      const daysLeft = Math.round((new Date(c.contract_end).getTime() - today.getTime()) / 86400000)
      if (daysLeft <= 0) {
        alerts.push({ clientId: c.id, companyName: c.company_name, type: 'contratto', label: 'Contratto scaduto', detail: `Scaduto il ${new Date(c.contract_end).toLocaleDateString('it-IT')}`, urgency: 'alta' })
      } else if (daysLeft <= 30) {
        alerts.push({ clientId: c.id, companyName: c.company_name, type: 'contratto', label: `Contratto in scadenza`, detail: `${daysLeft} giorni rimasti`, urgency: daysLeft <= 7 ? 'alta' : 'media' })
      }
    }

    // Pagamento scaduto
    // §178: niente scaduto senza qualcosa da incassare
    if (c.payment_status === 'scaduto' && billing.has(c.id)) {
      alerts.push({ clientId: c.id, companyName: c.company_name, type: 'pagamento', label: 'Pagamento scaduto', detail: 'Fattura non saldata', urgency: 'alta' })
    }

    // Stato rosso
    if (c.status === 'rosso') {
      alerts.push({ clientId: c.id, companyName: c.company_name, type: 'stato', label: 'Cliente in stato critico', detail: 'Richiede attenzione immediata', urgency: 'alta' })
    } else if (c.status === 'giallo' && c.client_label === 'in_bilico') {
      alerts.push({ clientId: c.id, companyName: c.company_name, type: 'stato', label: 'Cliente in bilico', detail: 'Stato giallo + label in bilico', urgency: 'media' })
    }

    /* §197: il rischio arriva da `lib/risk.ts`, non da `clients.risk_score`.
       E il dettaglio non è «Monitorare»: è il segnale che pesa più di tutti,
       perché un avviso che non dice cosa guardare non fa fare niente. */
    const risk = risks[c.id]
    if (risk?.score != null && risk.score >= 60) {
      const worst = [...risk.factors].sort((a, b) => b.score - a.score)[0]
      alerts.push({
        clientId: c.id, companyName: c.company_name, type: 'rischio',
        label: `Rischio ${risk.score}/100${risk.trend === 'peggiora' ? ', in peggioramento' : ''}`,
        detail: worst?.msg ?? 'più segnali insieme',
        urgency: risk.score >= 75 ? 'alta' : 'media',
      })
    }
  }

  // Dedup: un solo alert per cliente (il più urgente)
  const seen = new Set<string>()
  const deduped: Alert[] = []
  // Alta urgency prima
  const sorted = [...alerts].sort((a, b) => (a.urgency === 'alta' ? -1 : 1) - (b.urgency === 'alta' ? -1 : 1))
  for (const a of sorted) {
    if (!seen.has(a.clientId)) { seen.add(a.clientId); deduped.push(a) }
  }

  return deduped.slice(0, 5)
}

const typeIcon: Record<Alert['type'], React.ReactNode> = {
  contratto: <RefreshCw className="w-3.5 h-3.5" />,
  pagamento: <Clock className="w-3.5 h-3.5" />,
  stato: <AlertTriangle className="w-3.5 h-3.5" />,
  rischio: <TrendingDown className="w-3.5 h-3.5" />,
}

const urgencyStyle: Record<Alert['urgency'], string> = {
  alta: 'border-error/30 bg-error/5 text-error',
  media: 'border-warning/30 bg-warning/5 text-warning',
}

export function PrioritaOggi({ clients, billing = new Set<string>(), risks = {} }: {
  clients: Client[]
  /** id dei clienti che hanno rate o righe di conto economico: senza, niente avvisi di pagamento */
  billing?: Set<string>
  /** §197: rischio calcolato dal server, per id cliente */
  risks?: Record<string, RiskResult>
}) {
  const [dismissed, setDismissed] = useState(false)
  const alerts = useMemo(
    () => buildAlerts(clients.filter(c => c.client_label !== 'perso' && c.client_label !== 'pending'), billing, risks),
    [clients, billing, risks])

  if (dismissed || alerts.length === 0) return null

  return (
    <div className="mb-5 rounded-xl border border-border bg-surface overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-error animate-pulse" />
          <span className="text-sm font-semibold text-text-primary">Priorità oggi</span>
          <span className="text-xs text-text-secondary">{alerts.length} {alerts.length === 1 ? 'cliente richiede attenzione' : 'clienti richiedono attenzione'}</span>
        </div>
        <button onClick={() => setDismissed(true)} className="text-text-secondary hover:text-text-primary transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="divide-y divide-border">
        {alerts.map((alert) => (
          <Link
            key={alert.clientId}
            href={`/clienti/${alert.clientId}`}
            className="flex items-center gap-3 px-4 py-3 hover:bg-overlay/3 transition-colors group"
          >
            <div className={`flex items-center justify-center w-7 h-7 rounded-lg border shrink-0 ${urgencyStyle[alert.urgency]}`}>
              {typeIcon[alert.type]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">{alert.companyName}</p>
              <p className="text-xs text-text-secondary truncate">{alert.label} · {alert.detail}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-text-tertiary group-hover:text-text-secondary transition-colors shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  )
}
