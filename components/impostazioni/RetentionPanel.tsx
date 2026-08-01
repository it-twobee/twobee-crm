'use client'

import { useState, useTransition } from 'react'
import { Timer, Loader2, AlertTriangle, Check, Trash2, Database } from 'lucide-react'
import { toast } from 'sonner'
import { setRetentionDays, purgeActivityLog, type RetentionStatus } from '@/app/actions/activity'

const PRESETS = [7, 20, 30, 90, 0]
const label = (d: number) => d === 0 ? 'Per sempre' : `${d} giorni`

/**
 * Per quanto tempo resta una modifica.
 *
 * Il conto è per riga: una voce nasce con la modifica e muore N giorni dopo
 * *quella* modifica — scriverne una nuova non allunga la vita alle vecchie.
 * Il pannello dice tre cose e nessuna è decorativa: quanto dura, se qualcuno
 * sta davvero cancellando, e quante righe se ne vanno entro domani.
 */
export function RetentionPanel({ status, onChanged }: {
  status: RetentionStatus
  onChanged: () => void
}) {
  const [days, setDays] = useState(status.retentionDays)
  const [pending, start] = useTransition()

  if (status.missing) {
    return (
      <div className="flex items-start gap-2.5 rounded-2xl border border-warning/30 bg-warning-dim p-3.5">
        <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <p className="text-xs font-bold text-text-primary">La cronologia non scade</p>
          <p className="text-2xs text-text-secondary mt-0.5">
            Esegui <code className="bg-surface px-1.5 py-0.5 rounded border border-border">supabase/migrations/180_activity_retention.sql</code>{' '}
            per attivare la conservazione a tempo. Finché manca, le righe restano per sempre.
          </p>
        </div>
      </div>
    )
  }

  const apply = (d: number) => start(async () => {
    try {
      await setRetentionDays(d)
      setDays(d)
      toast.success(d === 0 ? 'La cronologia non verrà più cancellata' : `Conservazione: ${d} giorni`)
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore')
    }
  })

  const purge = () => start(async () => {
    try {
      const n = await purgeActivityLog()
      toast.success(n === 0 ? 'Niente da cancellare' : `${n} voci scadute eliminate`)
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore')
    }
  })

  return (
    <div className="bg-surface border border-border rounded-2xl p-3.5 space-y-2.5">
      <div className="flex items-start gap-2 flex-wrap">
        <Timer className="w-3.5 h-3.5 text-text-secondary mt-0.5 shrink-0" aria-hidden="true" />
        <div className="flex-1 min-w-[220px]">
          <p className="text-2xs font-bold text-text-secondary uppercase tracking-wider">Quanto resta una modifica</p>
          <p className="text-2xs text-text-tertiary mt-0.5">
            {days === 0
              ? 'Nessuna scadenza: ogni voce resta finché non la si elimina a mano.'
              : `Ogni voce si cancella ${days} giorni dopo la modifica che l'ha generata. Passata la finestra non è più ripristinabile.`}
          </p>
        </div>
        {days > 0 && (
          <button onClick={purge} disabled={pending}
            className="flex items-center gap-1.5 text-2xs font-semibold text-text-secondary hover:text-error border border-border rounded-lg px-2.5 py-1.5 disabled:opacity-40 press">
            {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
            Pulisci ora
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map(d => (
          <button key={d} onClick={() => apply(d)} disabled={pending}
            className={`text-2xs font-semibold px-2.5 py-1 rounded-lg border transition-colors disabled:opacity-40 ${
              days === d ? 'bg-gold-dim border-gold/40 text-gold-text' : 'bg-background border-border text-text-secondary hover:text-text-primary'}`}>
            {days === d && <Check className="w-3 h-3 inline mr-1" />}{label(d)}
          </button>
        ))}
      </div>

      {days > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs pt-0.5 border-t border-border">
          {/* Se il giro notturno non esiste la finestra non è una regola, è un
              proposito: dirlo qui evita di credere che qualcosa sia già sparito. */}
          {status.scheduled ? (
            <span className="text-text-tertiary flex items-center gap-1 pt-2">
              <Database className="w-3 h-3" aria-hidden="true" /> Giro notturno attivo, 03:40
            </span>
          ) : (
            <span className="text-warning flex items-center gap-1 pt-2">
              <AlertTriangle className="w-3 h-3" aria-hidden="true" />
              pg_cron non attivo: la pulizia va lanciata a mano
            </span>
          )}
          {status.expiringSoon > 0 && (
            <span className="text-warning pt-2">
              {status.expiringSoon.toLocaleString('it-IT')} voci spariscono entro domani
            </span>
          )}
          {status.lastPurgeAt && (
            <span className="text-text-tertiary pt-2">
              Ultima pulizia {new Date(status.lastPurgeAt).toLocaleString('it-IT', {
                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              {' · '}{status.lastPurgeRows.toLocaleString('it-IT')} eliminate
            </span>
          )}
        </div>
      )}
    </div>
  )
}
