'use client'

/**
 * §385 — l'area che guarda il commerciale e dice cosa non torna.
 *
 * Il controllo dei doppioni (§377) lavora **all'ingresso**, su un lead alla
 * volta: è la barriera giusta e non vede niente di quello che è già dentro.
 * I doppioni entrano lo stesso da tre porte — l'import CSV, il «aggiungi
 * comunque», e il giro dal foglio, che riconosce una riga dal suo
 * identificativo e non dal telefono. Qui si guarda la tabella intera.
 *
 * **Niente si corregge da qui.** Ogni rilievo dice cosa ha visto e su quali
 * righe, e le righe si aprono: la decisione resta di chi guarda, perché
 * unire due lead non si disfa e solo una persona sa se sono la stessa
 * azienda o due fratelli in due capannoni.
 *
 * Un pannello che mostra sempre qualcosa smette di essere letto dopo due
 * giorni. Per questo i controlli sono scritti per **tacere** quando non c'è
 * niente, e metà del gate prova proprio quello: righe che si somigliano e
 * non devono finire insieme.
 */

import { useMemo } from 'react'
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import { controlla, type RigaIgiene } from '@/lib/sales-igiene'
import { classiFase, etichettaFase } from '@/lib/sales-stages'
import type { RigaCrm } from './CrmTable'

export function CrmControllo({ righe, onApri }: {
  righe: RigaCrm[]
  onApri: (id: string) => void
}) {
  const oggi = new Date().toISOString().slice(0, 10)
  const rilievi = useMemo(
    () => controlla(righe as unknown as RigaIgiene[], oggi), [righe, oggi])

  const perId = useMemo(() => new Map(righe.map(r => [r.id, r])), [righe])

  if (!rilievi.length) {
    return (
      <div className="border border-border rounded-xl px-4 py-12 text-center">
        <CheckCircle2 className="w-6 h-6 text-success mx-auto" aria-hidden />
        <p className="text-sm font-semibold text-text-primary mt-2">Non c&apos;è niente da segnalare</p>
        <p className="text-2xs text-text-tertiary mt-1 max-w-md mx-auto">
          Nessun doppione, nessuna riga senza recapito, nessuna fase incoerente.
          Il controllo tace quando l&apos;archivio è a posto: se dicesse sempre
          qualcosa, dopo due giorni non lo aprirebbe più nessuno.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {rilievi.map(ril => {
        const grave = ril.peso === 'grave'
        return (
          <section key={ril.chiave}
            className={`border rounded-xl overflow-hidden ${grave ? 'border-error/40' : 'border-border'}`}>
            <header className={`flex items-start gap-2.5 px-4 py-3 border-b ${
              grave ? 'bg-error-dim border-error/30' : 'bg-surface border-border'}`}>
              {grave
                ? <AlertTriangle className="w-4 h-4 text-error shrink-0 mt-0.5" aria-hidden />
                : <Info className="w-4 h-4 text-warning shrink-0 mt-0.5" aria-hidden />}
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-text-primary">
                  {ril.titolo}
                  <span className="ml-2 text-2xs tabular font-semibold text-text-secondary">
                    {ril.gruppi.length}
                  </span>
                </h3>
                <p className="text-2xs text-text-secondary mt-0.5">{ril.spiega}</p>
              </div>
            </header>

            <div className="divide-y divide-border">
              {ril.gruppi.slice(0, 40).map((g, i) => (
                <div key={`${ril.chiave}-${i}`} className="px-4 py-2.5">
                  <p className="text-2xs text-text-tertiary">{g.perche}</p>
                  {/* Le righe si aprono: un rilievo che dice «c'è un problema»
                      e non porta dov'è costringe a cercarlo a mano, e in
                      trenta righe si sbaglia riga. */}
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {g.ids.map(id => {
                      const r = perId.get(id)
                      return (
                        <button key={id} onClick={() => onApri(id)}
                          className="flex items-center gap-1.5 text-2xs border border-border rounded-lg px-2 py-1
                                     hover:border-gold hover:bg-gold-dim transition-colors press">
                          <span className="font-semibold text-text-primary">
                            {r?.company_name || 'Senza nome'}
                          </span>
                          {r && (
                            <span className={`px-1.5 rounded-full ${classiFase(r.stage)}`}>
                              {etichettaFase(r.stage)}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
              {ril.gruppi.length > 40 && (
                <p className="px-4 py-2 text-2xs text-text-tertiary">
                  e altri {ril.gruppi.length - 40}: sistemane un po&apos; e ricarica.
                </p>
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}
