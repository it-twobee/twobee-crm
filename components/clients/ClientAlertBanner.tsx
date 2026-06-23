'use client'

import { useMemo } from 'react'
import { AlertTriangle, Clock, RefreshCw, TrendingDown } from 'lucide-react'
import type { Client, Invoice } from '@/lib/types/database'

interface Alert {
  type: 'contratto' | 'pagamento' | 'stato' | 'rischio'
  message: string
  urgency: 'alta' | 'media'
}

function buildClientAlerts(client: Client, invoices: Invoice[]): Alert[] {
  const alerts: Alert[] = []
  const today = new Date()

  if (client.contract_end) {
    const daysLeft = Math.round((new Date(client.contract_end).getTime() - today.getTime()) / 86400000)
    if (daysLeft <= 0) {
      alerts.push({ type: 'contratto', message: `Contratto scaduto il ${new Date(client.contract_end).toLocaleDateString('it-IT')} — rinnova subito`, urgency: 'alta' })
    } else if (daysLeft <= 30) {
      alerts.push({ type: 'contratto', message: `Contratto in scadenza tra ${daysLeft} giorni (${new Date(client.contract_end).toLocaleDateString('it-IT')})`, urgency: daysLeft <= 7 ? 'alta' : 'media' })
    }
  }

  const overdueInvoices = invoices.filter(i => i.status === 'in_ritardo' || (i.status === 'inviata' && i.due_date && new Date(i.due_date) < today))
  if (overdueInvoices.length > 0) {
    const total = overdueInvoices.reduce((s, i) => s + i.amount, 0)
    alerts.push({ type: 'pagamento', message: `${overdueInvoices.length} fattura${overdueInvoices.length > 1 ? 'e' : ''} in ritardo — totale €${total.toLocaleString('it-IT')}`, urgency: 'alta' })
  } else if (client.payment_status === 'scaduto') {
    alerts.push({ type: 'pagamento', message: 'Pagamento segnato come scaduto — verifica lo stato fatture', urgency: 'alta' })
  }

  if (client.status === 'rosso') {
    alerts.push({ type: 'stato', message: 'Cliente in stato critico — verifica la situazione e aggiorna le note', urgency: 'alta' })
  }

  if (client.risk_score != null && client.risk_score >= 60) {
    const trend = client.risk_trend === 'peggiora' ? ' e in peggioramento' : ''
    alerts.push({ type: 'rischio', message: `AI Risk Score alto: ${client.risk_score}/100${trend}`, urgency: client.risk_score >= 75 ? 'alta' : 'media' })
  }

  return alerts
}

const typeIcon: Record<Alert['type'], React.ReactNode> = {
  contratto: <RefreshCw className="w-4 h-4 shrink-0 mt-0.5" />,
  pagamento: <Clock className="w-4 h-4 shrink-0 mt-0.5" />,
  stato: <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />,
  rischio: <TrendingDown className="w-4 h-4 shrink-0 mt-0.5" />,
}

const urgencyStyle: Record<Alert['urgency'], string> = {
  alta: 'border-error/40 bg-error/8 text-error',
  media: 'border-warning/40 bg-warning/8 text-warning',
}

interface Props {
  client: Client
  invoices: Invoice[]
}

export function ClientAlertBanner({ client, invoices }: Props) {
  const alerts = useMemo(() => buildClientAlerts(client, invoices), [client, invoices])
  if (alerts.length === 0) return null

  return (
    <div className="mx-6 mt-4 flex flex-col gap-2">
      {alerts.map((alert, i) => (
        <div key={i} className={`flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg border text-sm font-medium ${urgencyStyle[alert.urgency]}`}>
          {typeIcon[alert.type]}
          <span>{alert.message}</span>
        </div>
      ))}
    </div>
  )
}
