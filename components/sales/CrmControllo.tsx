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
 *
 * §386 — i doppioni si mostrano **affiancati**, campo per campo, e con la
 * riga da tenere già indicata. Trovare il doppione era metà del lavoro:
 * l'altra metà è la domanda che si fa subito dopo con le due righe davanti,
 * «quale sovrascrive quale», e a occhio si sceglie quella in cima e si
 * scopre dopo che sull'altra c'erano le note della telefonata. Per questo
 * sotto il suggerimento c'è l'elenco di **cosa ricopiare prima di
 * eliminare**: è quello che rende sicuro l'accorpamento.
 */

import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, ArrowRight, CheckCircle2, Info, Merge, Star, Loader2 } from 'lucide-react'
import {
  controlla, confronta, daPortareSu, type RigaIgiene, type RigaConfronto,
} from '@/lib/sales-igiene'
import { unisciLead } from '@/app/actions/sales'
import { classiFase, etichettaFase } from '@/lib/sales-stages'
import type { RigaCrm } from './CrmTable'

export function CrmControllo({ righe, onApri, onFatto }: {
  righe: RigaCrm[]
  onApri: (id: string) => void
  /** dopo un'unione le righe non sono più quelle: si ricarica */
  onFatto: () => void
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
              {ril.chiave === 'doppioni'
                ? ril.gruppi.slice(0, 20).map((g, i) => (
                    <Affiancate key={`d-${i}`} ids={g.ids} perche={g.perche}
                      righe={righe as unknown as RigaConfronto[]} onApri={onApri} onFatto={onFatto} />
                  ))
                : ril.gruppi.slice(0, 40).map((g, i) => (
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
              {ril.chiave !== 'doppioni' && ril.gruppi.length > 40 && (
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

/**
 * §386 — due righe della stessa azienda, una accanto all'altra.
 *
 * Si mostrano **solo i campi in cui dicono cose diverse**: affiancare
 * ventitré righe uguali nasconde le tre che contano. La colonna consigliata
 * è marcata, e sotto c'è l'unica cosa che rende sicuro eliminare l'altra —
 * l'elenco di quello che c'è di là e qui no.
 */
function Affiancate({ ids, perche, righe, onApri, onFatto }: {
  ids: string[]
  perche: string
  righe: RigaConfronto[]
  onApri: (id: string) => void
  onFatto: () => void
}) {
  /* §387 — il suggerimento è un suggerimento: chi guarda può tenere l'altra,
     e in quel caso cambia tutto quello che si perde. La colonna scelta si
     cambia dalla testata, e l'elenco sotto si ricalcola. */
  const [scelto, setScelto] = useState<string | null>(null)
  const [conferma, setConferma] = useState(false)
  const [pending, start] = useTransition()

  const gruppo = ids.map(id => righe.find(r => r.id === id)).filter(Boolean) as RigaConfronto[]
  const c = confronta(gruppo)
  if (!c) return null

  const nome = (id: string) =>
    String(righe.find(r => r.id === id)?.company_name ?? '') || 'Senza nome'
  const colonne = c.ids
  const tieni = scelto ?? c.tieni
  const perdenti = colonne.filter(id => id !== tieni)
  /* Ricalcolato sul vincitore **vero**: se si tiene l'altra, quello che si
     perde è un altro elenco. Il server lo rifà comunque per conto suo. */
  const porta = daPortareSu(
    gruppo.find(r => r.id === tieni)!, gruppo.filter(r => r.id !== tieni))

  return (
    <div className="px-4 py-3">
      <p className="text-2xs text-text-tertiary">{perche}</p>

      <div className="mt-2 rounded-xl border border-border overflow-x-auto">
        <table className="w-full text-2xs">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left font-semibold text-text-tertiary px-2.5 py-2 w-32">Campo</th>
              {colonne.map(id => (
                <th key={id} className={`text-left px-2.5 py-2 min-w-[9rem] ${
                  id === tieni ? 'bg-success-dim' : ''}`}>
                  <button onClick={() => onApri(id)}
                    className="flex items-center gap-1 font-bold text-text-primary hover:underline">
                    {id === tieni && <Star className="w-3 h-3 text-success shrink-0" aria-hidden />}
                    <span className="truncate">{nome(id)}</span>
                  </button>
                  {id === tieni ? (
                    <span className="block font-semibold text-success">da tenere</span>
                  ) : (
                    <button onClick={() => { setScelto(id); setConferma(false) }} disabled={pending}
                      className="block font-semibold text-text-tertiary hover:text-text-primary hover:underline">
                      da eliminare · tieni questa
                    </button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {c.campi.map(f => (
              <tr key={f.campo}>
                <td className="px-2.5 py-1.5 text-text-tertiary align-top">{f.etichetta}</td>
                {/* `bg-success-dim` e non un'opacità: in questo progetto i
                    token sono `var(--color-*)` senza `<alpha-value>`, quindi
                    le classi con l'opacità non vengono generate (§379). */}
                {f.valori.map((v, i) => (
                  <td key={colonne[i]} className={`px-2.5 py-1.5 align-top ${
                    colonne[i] === tieni ? 'bg-success-dim' : ''} ${
                    v === null ? 'text-text-tertiary' : 'text-text-primary'}`}>
                    {v ?? '—'}
                  </td>
                ))}
              </tr>
            ))}
            {!c.campi.length && (
              <tr><td colSpan={colonne.length + 1} className="px-2.5 py-3 text-text-tertiary">
                Identiche in ogni campo: si può eliminare l&apos;altra senza perdere niente.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="flex items-start gap-1.5 text-2xs text-text-secondary mt-2">
        <Star className="w-3.5 h-3.5 text-success shrink-0 mt-px" aria-hidden />
        <span>
          {scelto
            ? <>Tieni <strong className="text-text-primary">{nome(tieni)}</strong>, scelta da te
                — il consiglio era «{nome(c.tieni)}».</>
            : <>Tieni <strong className="text-text-primary">{nome(c.tieni)}</strong>: {c.perche.join(' · ')}.</>}
        </span>
      </p>

      {/* La parte che rende sicuro eliminare: cosa c'è sull'altra e qui no.
          Senza questo elenco «tieni questa» è un consiglio che fa perdere
          dei dati, e se ne accorge qualcuno fra un mese. */}
      {/* §387 — non più «ricopia»: lo fa l'unione. Resta l'elenco, perché
          quello che passa da una riga all'altra va visto prima, non dopo. */}
      {porta.length > 0 && (
        <div className="mt-2 bg-warning-dim border border-warning/30 rounded-xl p-2.5">
          <p className="text-2xs font-bold text-warning uppercase tracking-wider mb-1">
            Unendo, passa sulla riga tenuta
          </p>
          <ul className="space-y-0.5">
            {porta.map(d => (
              <li key={d.campo} className="flex items-start gap-1.5 text-2xs text-text-primary">
                <ArrowRight className="w-3 h-3 text-text-tertiary shrink-0 mt-0.5" aria-hidden />
                <span><span className="text-text-tertiary">{d.etichetta}:</span> {d.valore}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* L'unione non si disfa, quindi la conferma dice **tutto** quello che
          succede — compreso quello che non si vede: la storia che si sposta e
          la riga del foglio, che senza un provvedimento farebbe tornare il
          doppione alle tre del mattino (§378). */}
      {conferma ? (
        <div className="mt-2 bg-surface-active border border-border-strong rounded-xl p-3">
          <p className="text-2xs font-bold text-text-primary">
            Unisci {perdenti.length === 1 ? 'la riga' : `le ${perdenti.length} righe`} in «{nome(tieni)}»
          </p>
          <ul className="mt-1.5 space-y-0.5 text-2xs text-text-secondary">
            <li>· {porta.length
              ? `${porta.length} campi vuoti si riempiono da ${perdenti.map(nome).join(', ')}`
              : 'nessun campo da copiare: la riga tenuta ha già tutto'}</li>
            <li>· niente di già scritto viene sovrascritto</li>
            <li>· attività, account owner, preventivi e scheda di passaggio si spostano qui</li>
            <li>· la riga del foglio passa alla riga tenuta, o viene murata: il giro
              notturno non rimette il doppione</li>
            <li className="text-error">· {perdenti.map(nome).join(', ')} spar{perdenti.length === 1 ? 'isce' : 'iscono'}, e non si torna indietro</li>
          </ul>
          <div className="flex items-center gap-3 mt-2.5">
            <button onClick={() => setConferma(false)} disabled={pending}
              className="text-2xs text-text-secondary hover:text-text-primary disabled:opacity-40">
              Annulla
            </button>
            <button disabled={pending}
              onClick={() => start(async () => {
                try {
                  const e = await unisciLead(tieni, perdenti)
                  toast.success(
                    `Unite in «${nome(tieni)}»`
                    + (e.portati.length ? ` · ${e.portati.length} campi copiati` : '')
                    + (e.spostati ? ` · ${e.spostati} collegamenti spostati` : '')
                    + (e.ereditaFoglio ? ' · riga del foglio ereditata' : '')
                    + (e.murati ? ` · ${e.murati} righe del foglio murate` : ''))
                  onFatto()
                } catch (err) { toast.error((err as Error).message) }
              })}
              className="ml-auto flex items-center gap-1.5 text-2xs font-semibold bg-gold text-on-gold px-3 py-1.5 rounded-lg shadow-soft press disabled:opacity-40">
              {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Merge className="w-3.5 h-3.5" />}
              Unisci
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setConferma(true)} disabled={pending}
          className="mt-2 flex items-center gap-1.5 text-2xs font-semibold text-gold-text border border-gold/30 px-3 py-1.5 rounded-xl hover:bg-gold-dim transition-colors disabled:opacity-40">
          <Merge className="w-3.5 h-3.5" />
          Unisci in «{nome(tieni)}»
        </button>
      )}
    </div>
  )
}
