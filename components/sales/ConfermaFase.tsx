'use client'

/**
 * §379 — la conferma prima di spostare una scheda di fase.
 *
 * Nel resto del prodotto una modifica non distruttiva si salva e basta, e
 * qui si chiede lo stesso: il trascinamento è l'unico gesto dell'intero
 * gestionale che **cambia un dato passando sopra a qualcosa**. Un clic
 * mancato su un elenco non fa niente; un trascinamento mancato sposta una
 * trattativa in un'altra fase, e chi lo ha fatto spesso non se ne accorge —
 * la scheda è sparita da dove la guardava. La conferma dice da dove a dove,
 * che è l'unica informazione che rende l'errore evidente prima e non dopo.
 *
 * Il caso che merita una riga in più è `Active Client`: su Notion è la
 * casella di chi è diventato cliente, e qui dentro «cliente» vuol dire una
 * riga d'anagrafica con dei contratti sotto. Spostare la scheda non la crea
 * — per quello c'è «Lead convertito», che apre il modale vero (§368) — e
 * senza dirlo si finirebbe con una pipeline che dichiara clienti che in
 * anagrafica non esistono.
 */

import { useEffect } from 'react'
import { ArrowRight, Loader2 } from 'lucide-react'
import { useFasi } from './FasiContext'

export function ConfermaFase({ azienda, da, a, creaCliente, pending, onAnnulla, onConferma }: {
  azienda: string
  da: string
  a: string
  /** la destinazione è «Active Client» e il lead non è ancora in anagrafica */
  creaCliente: boolean
  pending: boolean
  onAnnulla: () => void
  onConferma: () => void
}) {
  const { classiFase, etichettaFase } = useFasi()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onAnnulla() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onAnnulla])

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-scrim sm:p-4 animate-fade-in" onClick={onAnnulla}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-label="Conferma il cambio di fase"
        className="bg-surface border border-border rounded-t-2xl sm:rounded-2xl w-full max-w-md shadow-pop animate-slide-up pb-safe overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-base font-bold text-text-primary font-heading">Sposta il lead</h2>
          <p className="text-xs text-text-secondary truncate mt-0.5">{azienda}</p>
        </div>

        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-2xs font-semibold px-2 py-0.5 rounded-full ${classiFase(da)}`}>
              {etichettaFase(da)}
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-text-tertiary shrink-0" aria-hidden />
            <span className={`text-2xs font-semibold px-2 py-0.5 rounded-full ${classiFase(a)}`}>
              {etichettaFase(a)}
            </span>
          </div>

          {creaCliente && (
            <p className="text-xs text-text-secondary bg-surface-active border border-border rounded-xl p-3">
              Spostare qui <strong className="text-text-primary">non crea il cliente</strong> in anagrafica:
              per quello c&apos;è «Lead convertito» nella scheda, che apre il modale vero.
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 px-4 py-3 border-t border-border">
          <button onClick={onAnnulla} disabled={pending}
            className="text-sm text-text-secondary hover:text-text-primary disabled:opacity-40 press">
            Annulla
          </button>
          <button onClick={onConferma} disabled={pending}
            className="ml-auto flex items-center gap-1.5 text-sm font-semibold bg-gold text-on-gold px-4 py-2 rounded-xl shadow-soft press disabled:opacity-40">
            {pending && <Loader2 className="w-4 h-4 animate-spin" />}
            Sposta
          </button>
        </div>
      </div>
    </div>
  )
}
