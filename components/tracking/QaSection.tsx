'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { RefreshCw } from 'lucide-react'
import { getQaForClient, runQaClient } from '@/app/actions/tracking-qa'
import type { QaCheckView } from '@/lib/tracking/qa'
import type { TrackingQaRun } from '@/lib/types/database'
import { Card, GoldButton, QaChip, fmtDate } from './ui'

/**
 * Il blocco mostra l'ultimo esito, non una verifica dal vivo: dopo aver
 * cambiato Property ID, container o Pixel va rilanciato, altrimenti resta
 * fermo al risultato precedente.
 */
export function QaSection({ clientId, onChanged }: { clientId: string; onChanged: () => void }) {
  const [checks, setChecks] = useState<QaCheckView[] | null>(null)
  const [last, setLast] = useState<TrackingQaRun | null>(null)
  const [pending, start] = useTransition()

  const reload = useCallback(async () => {
    const res = await getQaForClient(clientId)
    if (!res.ok) return
    setChecks(res.data.checks)
    setLast(res.data.lastRun)
  }, [clientId])

  useEffect(() => { reload() }, [reload])

  const recheck = () => start(async () => {
    const res = await runQaClient(clientId)
    if (!res.ok) { toast.error(res.error); return }
    setChecks(res.data.checks)
    toast[res.data.problems ? 'warning' : 'success'](res.data.problems ? `${res.data.problems} problemi` : 'Tutto verificato')
    onChanged()
  })

  const never = checks?.every(c => c.status === null)

  return (
    <Card title="Controllo giornaliero"
      hint={last ? `Ultimo giro ${fmtDate(last.finished_at ?? last.started_at)} · ${last.clients} clienti, ${last.problems} problemi` : 'Ogni giorno alle 07:00, oppure a mano.'}
      aside={<GoldButton small onClick={recheck} pending={pending}><RefreshCw className="w-3.5 h-3.5" /> Ricontrolla</GoldButton>}>
      {!checks ? null : (
        <ul className="divide-y divide-border">
          {checks.map(c => (
            <li key={c.key} className="py-2.5 flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4">
              <div className="sm:w-48 shrink-0 flex items-center gap-2">
                <QaChip value={c.status} />
                <span className="text-sm font-semibold text-text-primary">{c.label}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-text-secondary break-words">{c.detail}</p>
                <p className="text-2xs text-text-tertiary">{c.checkedAt ? fmtDate(c.checkedAt) : `serve: ${c.needs}`}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {never && <p className="text-2xs text-text-tertiary mt-2">Mai controllato: lancia «Ricontrolla» dopo aver compilato la configurazione.</p>}
    </Card>
  )
}
