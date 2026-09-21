'use client'

/**
 * §366 — il riquadro in alto a destra: all'apertura e ogni venti minuti.
 *
 * Tre decisioni che lo rendono sopportabile, perché un popup ogni venti minuti
 * senza queste è la funzione che si disattiva il terzo giorno:
 *
 * - **il serbatoio finisce.** I messaggi del giorno sono dieci, non si
 *   ripetono, e quando sono esauriti non compare più niente. Riciclarli
 *   sarebbe peggio del silenzio: la seconda volta che leggi la stessa battuta
 *   smetti di leggerle tutte;
 * - **chiudere conta.** La X salta al prossimo, «basta per oggi» spegne tutto
 *   fino a domani. Un riquadro che riappare uguale dopo che l'hai chiuso non
 *   sta chiedendo, sta insistendo;
 * - **quello che hai già visto resta visto**, anche cambiando pagina o
 *   ricaricando. È in `localStorage` perché è una comodità di chi guarda, non
 *   un dato: se il browser lo perde, il peggio che succede è rivedere un
 *   messaggio.
 *
 * Non c'è nessuna chiamata al modello qui dentro: le righe arrivano già scritte
 * e già verificate dal server. Un popup che aspetta una risposta di rete è un
 * popup che compare quando non te lo aspetti più.
 */

import { useState, useEffect, useCallback } from 'react'
import { X, Sparkles } from 'lucide-react'
import { prossimoMomento } from '@/lib/popup-copy'

export type Momento = { chiave: string; testo: string }

/**
 * Quello che il browser ricorda: cosa hai già visto e **quando**.
 *
 * Il «quando» è la parte che conta. Senza, ogni apertura del portale mostrava
 * un messaggio — dieci pagine aperte in mezz'ora e il serbatoio del giorno era
 * finito prima di pranzo. Con il timestamp, l'orologio va per conto suo: se
 * l'ora non è passata non compare niente, per quante volte tu apra il tool.
 */
type Stato = { viste: string[]; ultimo: number }

const chiaveVista = (giorno: string) => `twobee-momenti-${giorno}`

function leggi(giorno: string): Stato {
  try {
    const raw = localStorage.getItem(chiaveVista(giorno))
    if (!raw) return { viste: [], ultimo: 0 }
    const v = JSON.parse(raw) as Partial<Stato>
    return { viste: Array.isArray(v.viste) ? v.viste : [], ultimo: typeof v.ultimo === 'number' ? v.ultimo : 0 }
  } catch { return { viste: [], ultimo: 0 } }
}

function salva(giorno: string, s: Stato) {
  try { localStorage.setItem(chiaveVista(giorno), JSON.stringify(s)) } catch { /* private browsing */ }
}

/** ogni minuto: la scheda lasciata aperta deve accorgersi dell'ora che scocca */
const BATTITO_MS = 60_000

export function MessaggiTwoBee({ momenti, giorno, ogniMinuti }: {
  momenti: Momento[]
  giorno: string
  ogniMinuti: number
}) {
  const [pronto, setPronto] = useState(false)
  const [corrente, setCorrente] = useState<Momento | null>(null)

  // al montaggio, non prima: sul server `localStorage` non esiste e il primo
  // render deve combaciare con quello del browser
  useEffect(() => { setPronto(true) }, [])

  /**
   * Fa comparire il prossimo **solo se l'ora è passata**.
   *
   * Lo stato si rilegge da `localStorage` a ogni colpo invece di tenerlo in
   * React, e sono due problemi risolti con la stessa riga: due schede aperte
   * condividono l'orologio — altrimenti ognuna avrebbe il suo e ne uscirebbero
   * due — e non si scrive dentro l'aggiornamento di un altro stato, che in
   * sviluppo React esegue due volte e brucerebbe due messaggi al posto di uno.
   *
   * Le ore in cui il portale era chiuso non si recuperano: chi torna dopo tre
   * ore trova **un** messaggio, non tre. I due che ha saltato non li ha persi,
   * semplicemente non sono mai esistiti.
   */
  const forse = useCallback(() => {
    const s = leggi(giorno)
    const next = prossimoMomento(momenti, s, Date.now(), ogniMinuti)
    if (!next) return
    salva(giorno, { viste: [...s.viste, next.chiave], ultimo: Date.now() })
    setCorrente(next)
  }, [momenti, giorno, ogniMinuti])

  useEffect(() => {
    if (!pronto) return
    forse()
    const id = setInterval(forse, BATTITO_MS)
    return () => clearInterval(id)
  }, [pronto, forse])

  if (!corrente) return null

  /* Chiudere non rimette indietro l'orologio: il messaggio è stato mostrato,
     e la prossima ora si conta da quando è comparso, non da quando l'hai
     tolto di mezzo. */
  const bastaPerOggi = () => {
    salva(giorno, { viste: momenti.map(m => m.chiave), ultimo: Date.now() })
    setCorrente(null)
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-16 right-4 z-50 w-[min(22rem,calc(100vw-2rem))] bg-surface border border-border-strong rounded-2xl shadow-soft p-4"
    >
      <div className="flex items-start gap-2.5">
        <Sparkles className="w-4 h-4 text-gold-text mt-0.5 shrink-0" aria-hidden />
        <p className="flex-1 text-sm text-text-primary leading-snug">{corrente.testo}</p>
        <button
          onClick={() => setCorrente(null)}
          aria-label="Chiudi il messaggio"
          className="text-text-tertiary hover:text-text-primary shrink-0 -mt-0.5 -mr-1 p-1"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <button
        onClick={bastaPerOggi}
        className="mt-2 ml-6 text-2xs text-text-tertiary hover:text-text-secondary underline underline-offset-2"
      >
        Basta per oggi
      </button>
    </div>
  )
}
