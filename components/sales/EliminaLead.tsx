'use client'

/**
 * §378 — la conferma prima di eliminare uno o più lead.
 *
 * Dice **cosa sparisce e cosa no**, perché sono le due domande che si fanno
 * con il dito sul bottone: sparisce la riga di CRM con la sua storia, non
 * sparisce il cliente di chi è già stato convertito — `client_id` è un
 * riferimento, non un possesso, e chi elimina una riga «Active Client»
 * pensando di ripulire il CRM non vuole toccare l'anagrafica.
 *
 * La riga sul foglio resta dov'è: qui si decide solo che non deve più
 * entrare. Vale la pena scriverlo, perché l'aspettativa naturale — «ho
 * eliminato, quindi il foglio è pulito» — è sbagliata, e la si scopre la
 * volta che si riapre il foglio per un'altra ragione.
 */

import { useEffect } from 'react'
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react'

export function EliminaLead({ nomi, inAnagrafica, pending, onAnnulla, onConferma }: {
  nomi: string[]
  /** quanti dei selezionati sono già collegati a un cliente */
  inAnagrafica: number
  pending: boolean
  onAnnulla: () => void
  onConferma: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onAnnulla() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onAnnulla])

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-scrim sm:p-4 animate-fade-in" onClick={onAnnulla}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-label="Conferma eliminazione dei lead"
        className="bg-surface border border-border rounded-t-2xl sm:rounded-2xl w-full max-w-md shadow-pop animate-slide-up pb-safe overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <span className="w-9 h-9 rounded-xl bg-error-dim flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4 text-error" />
          </span>
          <h2 className="text-base font-bold text-text-primary font-heading">
            {nomi.length === 1 ? 'Elimina il lead' : `Elimina ${nomi.length} lead`}
          </h2>
        </div>

        <div className="p-4 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {nomi.slice(0, 8).map((n, i) => (
              <span key={`${n}-${i}`} className="text-2xs font-semibold bg-background border border-border text-text-primary px-2 py-0.5 rounded">{n}</span>
            ))}
            {nomi.length > 8 && <span className="text-2xs text-text-secondary self-center">+{nomi.length - 8} altri</span>}
          </div>

          <div className="bg-error-dim border border-error/30 rounded-xl p-3">
            <p className="text-2xs font-bold text-error uppercase tracking-wider mb-1.5">Sparisce anche</p>
            <p className="text-xs text-text-primary">
              La storia della trattativa: attività, account owner e scheda di passaggio alla delivery.
            </p>
          </div>

          {inAnagrafica > 0 && (
            <p className="text-xs text-text-secondary">
              <span className="font-bold tabular text-text-primary">{inAnagrafica}</span>
              {inAnagrafica === 1 ? ' è già in anagrafica: il cliente resta' : ' sono già in anagrafica: i clienti restano'},
              si elimina solo la riga commerciale.
            </p>
          )}

          <p className="text-2xs text-text-tertiary">
            La riga sul foglio non viene toccata: viene solo segnata, così il giro dalle tre non la rimette.
            L&apos;azione è irreversibile e non passa dal cestino.
          </p>
        </div>

        <div className="flex items-center gap-3 px-4 py-3 border-t border-border">
          <button onClick={onAnnulla} disabled={pending}
            className="text-sm text-text-secondary hover:text-text-primary disabled:opacity-40 press">
            Annulla
          </button>
          <button onClick={onConferma} disabled={pending}
            className="ml-auto flex items-center gap-1.5 text-sm font-semibold bg-error-dim border border-error/40 text-error px-4 py-2 rounded-xl hover:bg-error/20 disabled:opacity-40 press">
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Elimina
          </button>
        </div>
      </div>
    </div>
  )
}
