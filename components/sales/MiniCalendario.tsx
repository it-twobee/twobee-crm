'use client'

/**
 * §438 — un mese da scegliere a colpo d'occhio.
 *
 * Il selettore nativo cambia faccia a ogni browser, su Safari è una rotella e
 * non dice che giorno della settimana è: chi fissa un contatto pensa «giovedì»,
 * non «il 25». Qui il mese si vede intero, la settimana parte dal lunedì, oggi
 * è segnato, e i giorni fuori dal lecito (un contatto già fatto non sta nel
 * futuro, un follow-up non sta nel passato) sono spenti invece che assenti.
 *
 * Da tastiera: le frecce spostano di un giorno o di una settimana, PagSu/PagGiù
 * di un mese, Invio sceglie. Un solo giorno è raggiungibile col Tab, gli altri
 * con le frecce: trentuno tab per attraversare un mese non sono un selettore.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']
const SETTIMANA = ['L', 'M', 'M', 'G', 'V', 'S', 'D']
const NOMI_GIORNO = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato']

const iso = (a: number, m: number, g: number) => `${a}-${String(m + 1).padStart(2, '0')}-${String(g).padStart(2, '0')}`
const daIso = (s: string) => { const [a, m, g] = s.split('-').map(Number); return { a, m: m - 1, g } }
const sposta = (s: string, giorni: number) => {
  const { a, m, g } = daIso(s)
  const d = new Date(Date.UTC(a, m, g + giorni))
  return iso(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}
const spostaMese = (s: string, mesi: number) => {
  const { a, m, g } = daIso(s)
  const ultimo = new Date(Date.UTC(a, m + mesi + 1, 0)).getUTCDate()
  const d = new Date(Date.UTC(a, m + mesi, Math.min(g, ultimo)))
  return iso(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

export function MiniCalendario({ valore, oggi, onScegli, min, max, segnati, etichetta = 'Scegli il giorno' }: {
  /** YYYY-MM-DD */
  valore: string
  /** YYYY-MM-DD, già nel fuso giusto: il calendario non indovina dove sei */
  oggi: string
  onScegli: (giorno: string) => void
  min?: string
  max?: string
  /** i giorni con qualcosa sopra: un puntino, non un colore di fondo */
  segnati?: Set<string>
  etichetta?: string
}) {
  const [fuoco, setFuoco] = useState(valore)
  const griglia = useRef<HTMLDivElement>(null)
  const daFocalizzare = useRef(false)
  useEffect(() => { setFuoco(valore) }, [valore])

  const { a, m } = daIso(fuoco)
  const giorni = useMemo(() => {
    const primo = (new Date(Date.UTC(a, m, 1)).getUTCDay() + 6) % 7
    const n = new Date(Date.UTC(a, m + 1, 0)).getUTCDate()
    return [...Array(primo).fill(null), ...Array.from({ length: n }, (_, i) => iso(a, m, i + 1))] as (string | null)[]
  }, [a, m])

  const fuori = (g: string) => (!!min && g < min) || (!!max && g > max)
  const vai = (g: string) => {
    if (min && g < min) g = min
    if (max && g > max) g = max
    daFocalizzare.current = true
    setFuoco(g)
  }
  useEffect(() => {
    if (!daFocalizzare.current) return
    daFocalizzare.current = false
    griglia.current?.querySelector<HTMLButtonElement>(`[data-giorno="${fuoco}"]`)?.focus()
  }, [fuoco])

  const tasto = (e: React.KeyboardEvent) => {
    const passi: Record<string, () => string> = {
      ArrowLeft: () => sposta(fuoco, -1), ArrowRight: () => sposta(fuoco, 1),
      ArrowUp: () => sposta(fuoco, -7), ArrowDown: () => sposta(fuoco, 7),
      PageUp: () => spostaMese(fuoco, -1), PageDown: () => spostaMese(fuoco, 1),
      Home: () => sposta(fuoco, -((new Date(`${fuoco}T12:00:00Z`).getUTCDay() + 6) % 7)),
      End: () => sposta(fuoco, 6 - ((new Date(`${fuoco}T12:00:00Z`).getUTCDay() + 6) % 7)),
    }
    if (passi[e.key]) { e.preventDefault(); vai(passi[e.key]()) }
  }

  const primoDelMese = iso(a, m, 1)
  const ultimoDelMese = iso(a, m, new Date(Date.UTC(a, m + 1, 0)).getUTCDate())

  return (
    <div className="w-full max-w-[17rem] select-none">
      <div className="flex items-center justify-between mb-1.5">
        <button type="button" onClick={() => vai(spostaMese(fuoco, -1))}
          disabled={!!min && primoDelMese <= min} aria-label="Mese precedente"
          className="p-1 rounded-lg text-text-secondary hover:bg-surface-hover hover:text-text-primary disabled:opacity-30">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-xs font-semibold text-text-primary" aria-live="polite">{MESI[m]} {a}</span>
        <button type="button" onClick={() => vai(spostaMese(fuoco, 1))}
          disabled={!!max && ultimoDelMese >= max} aria-label="Mese successivo"
          className="p-1 rounded-lg text-text-secondary hover:bg-surface-hover hover:text-text-primary disabled:opacity-30">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center" aria-hidden>
        {SETTIMANA.map((s, i) => <span key={i} className="text-2xs text-text-tertiary py-0.5">{s}</span>)}
      </div>
      <div ref={griglia} role="grid" aria-label={etichetta} onKeyDown={tasto} className="grid grid-cols-7 gap-0.5">
        {giorni.map((g, i) => {
          if (!g) return <span key={`v${i}`} />
          const scelto = g === valore
          const eOggi = g === oggi
          const spento = fuori(g)
          const dow = new Date(`${g}T12:00:00Z`).getUTCDay()
          return (
            <button key={g} type="button" data-giorno={g} role="gridcell"
              tabIndex={g === fuoco ? 0 : -1}
              aria-selected={scelto}
              aria-current={eOggi ? 'date' : undefined}
              aria-label={`${NOMI_GIORNO[dow]} ${Number(g.slice(8))} ${MESI[m].toLowerCase()}${eOggi ? ', oggi' : ''}`}
              disabled={spento}
              onClick={() => onScegli(g)}
              className={`relative h-8 rounded-lg text-xs tabular transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                scelto ? 'bg-gold text-on-gold font-semibold'
                  : eOggi ? 'text-gold-text font-semibold ring-1 ring-inset ring-gold/50 hover:bg-surface-hover'
                  : dow === 0 || dow === 6 ? 'text-text-tertiary hover:bg-surface-hover'
                  : 'text-text-primary hover:bg-surface-hover'}`}>
              {Number(g.slice(8))}
              {segnati?.has(g) && !scelto && (
                <span aria-hidden className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-gold-text" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
