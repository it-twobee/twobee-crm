'use client'

/**
 * §426 — il chip della fase è un bottone, ovunque sia.
 *
 * Prima si cambiava fase in due posti: la cella dell'elenco larga (un `select`
 * nativo) e la scheda. Ovunque altro il chip era un'etichetta, e chi lo
 * cliccava non otteneva niente — il gesto è così ovvio che la gente lo fa
 * comunque, e non succede niente per tre volte prima di smettere di provarci.
 *
 * Perché non un `<select>` nativo:
 * - **il colore non si vede**. In un menu di sistema le voci sono testo nero su
 *   bianco, e il colore è metà dell'informazione di una fase;
 * - **il ruolo non si vede**. «Cliente acquisito» e «Perso» chiudono la
 *   trattativa, «Pending» la sospende: sono tre cose diverse che in un elenco
 *   piatto sembrano tre voci uguali;
 * - **su iOS diventa una ruota** a tutto schermo, che per otto voci è un
 *   sipario sproporzionato.
 *
 * **Sta in un portale**, e non è un vezzo: il contenitore dell'elenco ha
 * `overflow-hidden` per arrotondare gli angoli, e un menu in posizione assoluta
 * lì dentro verrebbe tagliato a metà sulle ultime righe. Il portale lo tira
 * fuori dal flusso e la posizione si calcola dal rettangolo del bottone, con il
 * ribaltamento verso l'alto quando sotto non c'è spazio.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'
import { CLASSI_TINTA, ETICHETTA_GRUPPO, GRUPPI, gruppoDi, type Fase } from '@/lib/sales-stages'
import { useFasi } from './FasiContext'

type Props = {
  valore: string | null | undefined
  onScegli: (chiave: string) => void
  disabilitato?: boolean
  /** l'etichetta accessibile: «Fase di Rossi srl» dice quale riga si sta cambiando */
  etichetta?: string
  className?: string
}

const ALTEZZA_MENU = 340

export function MenuFase({ valore, onScegli, disabilitato, etichetta, className = '' }: Props) {
  const { FASI, faseDi, classiFase, etichettaFase } = useFasi()
  const [aperto, setAperto] = useState(false)
  const [evidenziata, setEvidenziata] = useState(0)
  const [posizione, setPosizione] = useState<{ top: number; left: number; sopra: boolean } | null>(null)
  const bottone = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)

  const scelte = FASI
  const indiceCorrente = Math.max(0, scelte.findIndex(f => f.chiave === valore))

  useLayoutEffect(() => {
    if (!aperto || !bottone.current) return
    const r = bottone.current.getBoundingClientRect()
    const sotto = window.innerHeight - r.bottom
    const sopra = sotto < ALTEZZA_MENU && r.top > sotto
    setPosizione({
      top: sopra ? r.top : r.bottom + 4,
      left: Math.min(r.left, window.innerWidth - 268),
      sopra,
    })
    setEvidenziata(indiceCorrente)
  }, [aperto, indiceCorrente])

  useEffect(() => {
    if (!aperto) return
    const fuori = (e: MouseEvent) => {
      if (menu.current?.contains(e.target as Node) || bottone.current?.contains(e.target as Node)) return
      setAperto(false)
    }
    /* Chiude anche quando la pagina scorre: un menu ancorato a un rettangolo
       calcolato una volta resterebbe dov'era mentre la riga scivola via.
       §445 — ma non quando scorre **lui**: il listener è in capture su
       `window`, quindi riceve anche lo scroll della lista del menu, e al primo
       scatto di rotella lo chiudeva — sembrava che la lista non scorresse. */
    const viaConLoScroll = (e: Event) => {
      if (e.target instanceof Node && menu.current?.contains(e.target)) return
      setAperto(false)
    }
    document.addEventListener('mousedown', fuori)
    window.addEventListener('scroll', viaConLoScroll, true)
    window.addEventListener('resize', viaConLoScroll)
    return () => {
      document.removeEventListener('mousedown', fuori)
      window.removeEventListener('scroll', viaConLoScroll, true)
      window.removeEventListener('resize', viaConLoScroll)
    }
  }, [aperto])

  const scegli = (chiave: string) => {
    setAperto(false)
    bottone.current?.focus()
    if (chiave !== valore) onScegli(chiave)
  }

  const tasti = (e: React.KeyboardEvent) => {
    if (!aperto) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') { e.preventDefault(); setAperto(true) }
      return
    }
    if (e.key === 'Escape') { e.preventDefault(); setAperto(false); bottone.current?.focus(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setEvidenziata(i => Math.min(i + 1, scelte.length - 1)); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); setEvidenziata(i => Math.max(i - 1, 0)); return }
    if (e.key === 'Home') { e.preventDefault(); setEvidenziata(0); return }
    if (e.key === 'End') { e.preventDefault(); setEvidenziata(scelte.length - 1); return }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      const f = scelte[evidenziata]
      if (f) scegli(f.chiave)
    }
  }

  const corrente = faseDi(valore)

  return (
    <>
      <button
        ref={bottone}
        type="button"
        disabled={disabilitato}
        aria-haspopup="listbox"
        aria-expanded={aperto}
        aria-label={etichetta ? `${etichetta}: ${etichettaFase(valore)}` : undefined}
        onClick={e => { e.stopPropagation(); setAperto(a => !a) }}
        onKeyDown={tasti}
        className={`group/fase inline-flex items-center gap-1 max-w-full px-2 py-0.5 rounded-full text-2xs font-semibold
          transition-opacity disabled:opacity-60 disabled:cursor-default ${classiFase(valore)} ${className}`}>
        <span className="truncate">{etichettaFase(valore)}</span>
        {!disabilitato && (
          /* La freccia c'è sempre ma quasi trasparente: farla comparire
             all'hover sposterebbe il testo di tre pixel su ogni riga. */
          <ChevronDown className="w-3 h-3 shrink-0 opacity-40 group-hover/fase:opacity-100 transition-opacity" />
        )}
      </button>

      {aperto && posizione && typeof document !== 'undefined' && createPortal(
        <div
          ref={menu}
          role="listbox"
          aria-label="Scegli la fase"
          tabIndex={-1}
          onKeyDown={tasti}
          style={{
            top: posizione.sopra ? undefined : posizione.top,
            bottom: posizione.sopra ? window.innerHeight - posizione.top + 4 : undefined,
            left: posizione.left,
          }}
          className="fixed z-50 w-64 max-h-[340px] overflow-y-auto bg-surface border border-border-strong rounded-xl shadow-2xl py-1">
          {GRUPPI.map(g => {
            const del = scelte.filter(f => gruppoDi(f) === g)
            if (!del.length) return null
            return (
              <div key={g}>
                <p className="px-3 pt-2 pb-1 text-2xs font-bold text-text-tertiary uppercase tracking-wider">
                  {ETICHETTA_GRUPPO[g]}
                </p>
                {del.map(f => {
                  const i = scelte.indexOf(f)
                  const scelta = f.chiave === valore
                  return (
                    <div
                      key={f.chiave}
                      role="option"
                      aria-selected={scelta}
                      onMouseEnter={() => setEvidenziata(i)}
                      onClick={e => { e.stopPropagation(); scegli(f.chiave) }}
                      className={`flex items-start gap-2 px-3 py-1.5 cursor-pointer ${
                        i === evidenziata ? 'bg-surface-hover' : ''}`}>
                      <span className={`mt-px px-2 py-0.5 rounded-full text-2xs font-semibold shrink-0 ${CLASSI_TINTA[f.tinta]}`}>
                        {f.etichetta}
                      </span>
                      {scelta && <Check className="w-3.5 h-3.5 text-gold-text shrink-0 ml-auto mt-0.5" />}
                    </div>
                  )
                })}
              </div>
            )
          })}
          {corrente && !corrente.attiva && (
            /* Una fase ritirata resta scritta sulla riga ma non è fra le
               scelte: senza questa nota il menu sembrerebbe non avere niente
               di selezionato. */
            <p className="px-3 py-2 mt-1 border-t border-border text-2xs text-text-tertiary">
              Adesso è in «{corrente.etichetta}», una fase ritirata: scegliendone un&apos;altra non ci torna più.
            </p>
          )}
        </div>,
        document.body,
      )}
    </>
  )
}
