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

export type Momento = { chiave: string; testo: string }

/** per-persona e per-giorno: domani la chiave cambia e il serbatoio si riapre */
const chiaveVista = (giorno: string) => `twobee-momenti-${giorno}`

function lette(giorno: string): string[] {
  try {
    const raw = localStorage.getItem(chiaveVista(giorno))
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch { return [] }
}

function segna(giorno: string, chiavi: string[]) {
  try { localStorage.setItem(chiaveVista(giorno), JSON.stringify(chiavi)) } catch { /* private browsing */ }
}

export function MessaggiTwoBee({ momenti, giorno, ogniMinuti }: {
  momenti: Momento[]
  giorno: string
  ogniMinuti: number
}) {
  const [viste, setViste] = useState<string[] | null>(null)
  const [corrente, setCorrente] = useState<Momento | null>(null)

  // al montaggio, non prima: sul server `localStorage` non esiste e il primo
  // render deve combaciare con quello del browser
  useEffect(() => { setViste(lette(giorno)) }, [giorno])

  const mostraProssimo = useCallback(() => {
    setViste(prev => {
      const già = prev ?? []
      const next = momenti.find(m => !già.includes(m.chiave))
      if (!next) { setCorrente(null); return già }
      setCorrente(next)
      const aggiornate = [...già, next.chiave]
      segna(giorno, aggiornate)
      return aggiornate
    })
  }, [momenti, giorno])

  // uno all'apertura, poi uno ogni `ogniMinuti`
  useEffect(() => {
    if (viste === null) return
    mostraProssimo()
    const id = setInterval(mostraProssimo, ogniMinuti * 60_000)
    return () => clearInterval(id)
    // `viste` serve solo a sapere che la lettura iniziale è avvenuta
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viste === null, mostraProssimo, ogniMinuti])

  if (!corrente) return null

  const bastaPerOggi = () => {
    segna(giorno, momenti.map(m => m.chiave))
    setViste(momenti.map(m => m.chiave))
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
