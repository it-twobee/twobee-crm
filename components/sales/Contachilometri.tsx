'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Clock, Flag, Pause, TrendingDown } from 'lucide-react'
import { coloreLivello, type Vicinanza } from '@/lib/sales-vicinanza'
import { Popover } from '@/components/shared/Popover'

/**
 * §465 — il contachilometri: quanto il lead è vicino a diventare cliente.
 *
 * Un arco di 180° con il gradiente rosso → giallo → verde **fisso lungo
 * l'arco** (il colore in punta dice dove sei, non una tinta unica), tacche ogni
 * 25, una manopola che corre sull'arco e un numero digitale al centro. All'apertura
 * l'arco si riempie fino al livello: un cruscotto che si muove si nota, uno
 * fermo si legge come un'etichetta. `prefers-reduced-motion` lo ferma.
 *
 * Il clic apre il perché — fase, recenza, cosa manca alla prossima — perché
 * un numero che non si spiega non si crede. Colori: solo token del tema, mai un
 * hex (il tema chiaro li rende illeggibili). Grigio = nessuna corsa in atto.
 */

const R = 22, CX = 28, CY = 28
const ARCO = `M${CX - R} ${CY} A${R} ${R} 0 0 1 ${CX + R} ${CY}`
const TACCHE = [0, 25, 50, 75, 100]

function punto(livello: number, raggio: number) {
  const a = (livello / 100) * Math.PI
  return { x: CX - raggio * Math.cos(a), y: CY - raggio * Math.sin(a) }
}

export function Contachilometri({ v, className = '' }: { v: Vicinanza; className?: string }) {
  const id = useId().replace(/:/g, '')
  const [mostrato, setMostrato] = useState(0)
  const [aperto, setAperto] = useState(false)
  const ancora = useRef<HTMLButtonElement>(null)

  /* parte da zero e sale: la transizione CSS fa il resto. Due frame, o il
     browser vede già il valore finale e non anima niente. */
  useEffect(() => {
    const f = requestAnimationFrame(() => requestAnimationFrame(() => setMostrato(v.livello)))
    return () => cancelAnimationFrame(f)
  }, [v.livello])

  const grigio = v.tono === 'perso' || v.tono === 'fermo'
  const colore = grigio ? 'var(--color-text-tertiary)' : coloreLivello(v.livello)
  const stantio = v.tono === 'vivo' && v.giorniFermo !== null && v.giorniFermo > 14
  const persi = v.tono === 'vivo' ? v.base - v.livello : 0
  const etichetta = v.tono === 'vinto' ? 'Cliente acquisito'
    : v.tono === 'perso' ? 'Perso'
    : v.tono === 'fermo' ? 'In pausa'
    : `${v.livello}%`
  const moto = 'transition-all duration-700 ease-out motion-reduce:transition-none'

  return (
    <>
      <button ref={ancora} type="button" onClick={() => setAperto(a => !a)} aria-expanded={aperto} aria-haspopup="dialog"
        aria-label={`Vicinanza a diventare cliente: ${etichetta}. Mostra il calcolo`}
        className={`relative shrink-0 rounded-lg p-0.5 hover:bg-surface-hover transition-colors ${className}`}>
        <svg viewBox="0 0 56 34" width="56" height="34" aria-hidden className="block overflow-visible">
          <defs>
            <linearGradient id={`g${id}`} gradientUnits="userSpaceOnUse" x1={CX - R} y1="0" x2={CX + R} y2="0">
              <stop offset="0" style={{ stopColor: 'var(--color-error)' }} />
              <stop offset="0.5" style={{ stopColor: 'var(--color-warning)' }} />
              <stop offset="1" style={{ stopColor: 'var(--color-success)' }} />
            </linearGradient>
          </defs>
          {TACCHE.map(t => {
            const a = punto(t, R + 5.5), b = punto(t, R + 8)
            return <line key={t} x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth="1.5" strokeLinecap="round"
              style={{ stroke: 'var(--color-border-strong)' }} />
          })}
          <path d={ARCO} fill="none" strokeWidth="5" strokeLinecap="round" style={{ stroke: 'var(--color-border)' }} />
          <path d={ARCO} fill="none" strokeWidth="5" strokeLinecap="round" pathLength={100}
            strokeDasharray={`${Math.max(mostrato, 0.001)} 100`}
            className={moto}
            style={{ stroke: grigio ? 'var(--color-text-tertiary)' : `url(#g${id})`, opacity: v.livello === 0 ? 0 : 1,
              filter: grigio ? undefined : `drop-shadow(0 0 3px color-mix(in srgb, ${colore} 55%, transparent))` }} />
          {v.livello > 0 && (
            <g className={moto} style={{ transform: `rotate(${mostrato * 1.8}deg)`, transformOrigin: `${CX}px ${CY}px` }}>
              <circle cx={CX - R} cy={CY} r="3.4" style={{ fill: 'var(--color-background)', stroke: colore }} strokeWidth="1.8" />
            </g>
          )}
        </svg>
        <span className="absolute inset-x-0 bottom-0.5 text-center text-2xs font-black leading-none tabular tracking-tight text-text-primary"
          style={{ color: grigio ? undefined : colore }}>
          {v.tono === 'vinto' ? '100' : v.tono === 'perso' ? '—' : v.tono === 'fermo' ? <Pause className="w-3 h-3 inline text-text-secondary" aria-hidden /> : v.livello}
        </span>
        {stantio && (
          <span aria-hidden className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-surface border border-border flex items-center justify-center">
            <Clock className="w-2.5 h-2.5 text-warning" />
          </span>
        )}
      </button>

      <Popover ancora={ancora} aperto={aperto} onChiudi={() => setAperto(false)} larghezza={280} etichetta="Come si calcola la vicinanza">
        <div className="p-3 space-y-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-xs font-semibold text-text-primary">Vicinanza a diventare cliente</span>
            <span className="text-lg font-black tabular" style={{ color: grigio ? 'var(--color-text-secondary)' : colore }}>{etichetta}</span>
          </div>
          {v.tono === 'vivo' && (
            <ul className="space-y-1.5 text-2xs text-text-secondary">
              <li className="flex items-start gap-2"><Flag className="w-3.5 h-3.5 mt-px shrink-0 text-text-tertiary" aria-hidden />
                <span>Fase <span className="font-semibold text-text-primary">{v.faseEtichetta}</span>: base {v.base}%</span></li>
              <li className="flex items-start gap-2">
                {persi > 0
                  ? <TrendingDown className="w-3.5 h-3.5 mt-px shrink-0 text-warning" aria-hidden />
                  : <Clock className="w-3.5 h-3.5 mt-px shrink-0 text-text-tertiary" aria-hidden />}
                <span>
                  {v.giorniFermo === null ? 'Nessun contatto registrato' : v.giorniFermo === 0 ? 'Sentito oggi' : `Fermo da ${v.giorniFermo} ${v.giorniFermo === 1 ? 'giorno' : 'giorni'}`}
                  {persi > 0 ? <span className="text-warning"> · −{persi} punti</span> : <span className="text-text-tertiary"> · nessuna perdita</span>}
                </span>
              </li>
              {v.prossima && <li className="text-text-tertiary pl-5">Prossimo passo: <span className="text-text-secondary">{v.prossima}</span></li>}
              {persi > 0 && <li className="text-text-tertiary pl-5">Un contatto registrato oggi lo riporta a {v.base}%.</li>}
            </ul>
          )}
          {v.tono === 'fermo' && <p className="text-2xs text-text-secondary">In pausa: non si sa a che punto era, quindi il livello è fisso e non conta.</p>}
          {v.tono === 'perso' && <p className="text-2xs text-text-secondary">Trattativa chiusa senza esito.</p>}
          {v.tono === 'vinto' && <p className="text-2xs text-text-secondary">È diventato cliente.</p>}
          <p className="text-2xs text-text-tertiary border-t border-border pt-2">
            Conta la fase e quanto è passato dall’ultimo contatto: da 7 a 45 giorni perde fino alla metà.
          </p>
        </div>
      </Popover>
    </>
  )
}
