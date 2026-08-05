'use client'

import { useMemo } from 'react'
import { AlertTriangle, Clock, RefreshCw, TrendingDown } from 'lucide-react'
import { hasContracts } from '@/lib/clients'
import type { RiskResult } from '@/lib/risk'
import type { Client } from '@/lib/types/database'

interface Alert {
  type: 'contratto' | 'pagamento' | 'stato' | 'rischio'
  message: string
  urgency: 'alta' | 'media'
}

function buildClientAlerts(client: Client, hideEconomics: boolean, hasBilling: boolean, risk?: RiskResult): Alert[] {
  const alerts: Alert[] = []
  const today = new Date()

  // §177: senza contratti non c'è niente da rinnovare. Le date in anagrafica
  // sono un residuo storico e non devono generare scadenze inventate.
  if (client.contract_end && hasContracts(client)) {
    const daysLeft = Math.round((new Date(client.contract_end).getTime() - today.getTime()) / 86400000)
    if (daysLeft <= 0) {
      alerts.push({ type: 'contratto', message: `Contratto scaduto il ${new Date(client.contract_end).toLocaleDateString('it-IT')} — rinnova subito`, urgency: 'alta' })
    } else if (daysLeft <= 30) {
      alerts.push({ type: 'contratto', message: `Contratto in scadenza tra ${daysLeft} giorni (${new Date(client.contract_end).toLocaleDateString('it-IT')})`, urgency: daysLeft <= 7 ? 'alta' : 'media' })
    }
  }

  /* §178: un pagamento può essere scaduto solo se esiste qualcosa da pagare —
     una rata di contratto o una riga di conto economico. Senza, il valore in
     colonna è un residuo storico e l'avviso manda a cercare una fattura che
     nessuno ha mai emesso. */
  if (!hideEconomics && hasBilling && client.payment_status === 'scaduto') {
    alerts.push({ type: 'pagamento', message: 'Pagamento segnato come scaduto — verifica lo stato fatture', urgency: 'alta' })
  }

  if (client.status === 'rosso') {
    alerts.push({ type: 'stato', message: 'Cliente in stato critico — verifica la situazione e aggiorna le note', urgency: 'alta' })
  }

  /* §197: dal motore, non dalla colonna. E l'avviso porta con sé i segnali che
     lo hanno acceso: «rischio alto» senza il perché non dice cosa fare. */
  if (risk?.score != null && risk.score >= 60) {
    const trend = risk.trend === 'peggiora' ? ' e in peggioramento' : ''
    const why = risk.factors.filter(f => f.score > 0).sort((a, b) => b.score - a.score).map(f => f.msg).join(' · ')
    alerts.push({
      type: 'rischio',
      message: `Rischio ${risk.score}/100${trend}${why ? ` — ${why}` : ''}`,
      urgency: risk.score >= 75 ? 'alta' : 'media',
    })
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
  hideEconomics?: boolean
  /** rate o righe di conto economico: senza, lo stato pagamenti non esiste */
  hasBilling?: boolean
  /** §197: rischio calcolato dal server */
  risk?: RiskResult
}

export function ClientAlertBanner({ client, hideEconomics = false, hasBilling = false, risk }: Props) {
  const alerts = useMemo(
    () => buildClientAlerts(client, hideEconomics, hasBilling, risk), [client, hideEconomics, hasBilling, risk])
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
