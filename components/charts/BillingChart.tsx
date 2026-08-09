'use client'

import { useState } from 'react'
import { BarChart3, LineChart } from 'lucide-react'
import { eur } from '@/lib/money'
import type { BillingPoint } from '@/lib/invoices'

/**
 * §278 — Il fatturato del mese: emesso, incassato, in attesa, previsto.
 *
 * Una domanda sola con quattro numeri, e finché stavano in quattro riquadri
 * separati la risposta bisognava comporla a mente. Qui è una forma sola.
 *
 * **L'altezza della barra è il fatturato netto** — emesso meno le note di
 * credito — e dentro si divide in due: pieno = **rientrato**, smorzato = **in
 * attesa**. È la stessa convenzione delle altre barre dell'economics, e sono le
 * uniche tre grandezze che servono a rispondere alla domanda.
 *
 * §279/§280 — **lo stornato non è credito in attesa, e non sta nel grafico.**
 * Una fattura annullata non è un incasso che deve ancora arrivare, è un incasso
 * che non arriverà mai: contarla fra gli attesi fa inseguire soldi che nessuno
 * deve, disegnarla come terza parte alza una barra che il fatturato non ha.
 * Resta nel numero — il netto è già al netto — e nel riquadro del mese, dove
 * serve a spiegare perché quel mese vale meno di quanto è stato emesso.
 *
 * **Il previsionale ha un'altra forma**, tratteggiata: un mese futuro non ha
 * documenti, ha rate firmate. Disegnarlo pieno accanto allo storico lo farebbe
 * leggere come un fatto, ed è il modo più facile di prendere una previsione per
 * un incasso.
 *
 * **Due letture, un dato solo.** Le barre rispondono a «quanto in ciascun mese»,
 * la linea a «come si sta muovendo». Sono la stessa serie: il selettore cambia
 * la forma, mai i numeri — un grafico che cambia i totali quando cambi vista è
 * un grafico di cui non ci si fida più.
 *
 * **Il pallino porta il numero.** Passandoci sopra si legge il mese per esteso
 * con i quattro valori; l'asse resta pulito. Dal grafico si prende la direzione,
 * dal numero la decisione — quindi il numero deve esserci, non essere dedotto
 * dal pixel.
 */
export function BillingChart({ data, today, height = 240 }: {
  data: BillingPoint[]
  today: string
  height?: number
}) {
  const [mode, setMode] = useState<'barre' | 'linea'>('barre')
  const [hover, setHover] = useState<number | null>(null)
  if (!data.length) return null

  const W = 960
  const H = height
  const padL = 6, padR = 6, padT = 16, padB = 30
  /* L'altezza è il **netto**: quello che è stato stornato non è fatturato, e
     nella barra non ci sta. */
  const valOf = (d: BillingPoint) => (d.future ? d.forecast : d.issued)
  const max = Math.max(...data.map(d => Math.max(d.issued, d.forecast)), 1)
  /* Lo zero si vede sempre: un grafico che parte da un minimo scelto esagera le
     differenze, ed è il modo più comune di mentire con un grafico onesto. */
  const y = (v: number) => padT + (1 - v / max) * (H - padT - padB)
  const slot = (W - padL - padR) / data.length
  const cx = (i: number) => padL + slot * i + slot / 2
  const barW = Math.min(38, slot * 0.5)
  const zeroY = y(0)

  const path = (pts: { x: number; y: number }[]) =>
    pts.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ')
  const storia = data.map((d, i) => ({ x: cx(i), y: y(d.issued), i })).filter(p => !data[p.i].future)
  const futuro = data.map((d, i) => ({ x: cx(i), y: y(d.forecast), i })).filter(p => data[p.i].future)
  /* La linea del previsionale attacca all'ultimo mese vero, o partirebbe per
     aria: il passaggio fra storia e previsione è il punto che si guarda. */
  const ponte = storia.length && futuro.length ? [storia[storia.length - 1], futuro[0]] : []
  const incassata = data.map((d, i) => ({ x: cx(i), y: y(d.collected), i })).filter(p => !data[p.i].future)

  const h = hover != null ? data[hover] : null
  const mesi = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']
  const label = (m: string) => `${mesi[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`
  const esteso = (m: string) => {
    const M = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
      'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']
    return `${M[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`
  }
  const nowM = `${today.slice(0, 7)}-01`

  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
        <p className="text-2xs text-text-tertiary max-w-lg">
          L&apos;altezza è il <strong className="text-text-secondary">fatturato netto</strong>, al netto
          delle note di credito: la parte piena è rientrata, quella smorzata è ancora attesa.
          Il tratteggio da{' '}
          {esteso(nowM).split(' ')[0]} in poi è quello che i contratti firmati dicono di emettere.
        </p>
        <div className="flex bg-surface-active rounded-xl p-0.5 shrink-0">
          {(['barre', 'linea'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)} aria-pressed={mode === m}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-2xs font-semibold ${
                mode === m ? 'bg-surface text-text-primary shadow-soft' : 'text-text-secondary hover:text-text-primary'}`}>
              {m === 'barre' ? <BarChart3 className="w-3.5 h-3.5" /> : <LineChart className="w-3.5 h-3.5" />}
              {m === 'barre' ? 'Barre' : 'Linea'}
            </button>
          ))}
        </div>
      </div>

      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }} role="img"
          aria-label="Fatturato emesso, incassato, in attesa e previsionale per mese"
          onMouseLeave={() => setHover(null)}>
          <defs>
            <linearGradient id="bill-in" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-success)" stopOpacity="0.95" />
              <stop offset="100%" stopColor="var(--color-success)" stopOpacity="0.7" />
            </linearGradient>
            <pattern id="bill-fc" width="7" height="7" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
              <rect width="7" height="7" fill="var(--color-info)" opacity="0.10" />
              <line x1="0" y1="0" x2="0" y2="7" stroke="var(--color-info)" strokeWidth="3" opacity="0.5" />
            </pattern>
          </defs>

          {[0.25, 0.5, 0.75, 1].map(f => (
            <line key={f} x1={padL} x2={W - padR} y1={y(max * f)} y2={y(max * f)}
              stroke="var(--color-border)" strokeWidth="1" opacity="0.45" />
          ))}
          <line x1={padL} x2={W - padR} y1={zeroY} y2={zeroY}
            stroke="var(--color-border-strong)" strokeWidth="1" />

          {/* la colonna sotto il puntatore: il bersaglio è tutto lo slot, non il pallino */}
          {data.map((d, i) => (
            <rect key={`hit-${d.month}`} x={padL + slot * i} y={padT - 8} width={slot} height={H - padT - padB + 16}
              fill={hover === i ? 'var(--color-surface-hover)' : 'transparent'}
              onMouseEnter={() => setHover(i)} />
          ))}

          {mode === 'barre' ? data.map((d, i) => {
            const x = cx(i) - barW / 2
            if (d.future) {
              const hF = Math.max(d.forecast > 0 ? 2 : 0, zeroY - y(d.forecast))
              return d.forecast > 0 ? (
                <rect key={d.month} x={x} y={y(d.forecast)} width={barW} height={hF} rx="4"
                  fill="url(#bill-fc)" stroke="var(--color-info)" strokeWidth="1"
                  strokeDasharray="3 3" opacity={hover == null || hover === i ? 1 : 0.5}
                  pointerEvents="none" />
              ) : null
            }
            /* §280 — netto = rientrato + in attesa. Quando una nota di credito
               annulla una fattura già incassata il netto scende sotto
               l'incassato: la barra si ferma al netto e il riquadro dice i
               numeri veri, invece di disegnare una parte che non c'è. */
            const netto = Math.max(0, d.issued)
            const hTot = Math.max(netto > 0 ? 2 : 0, zeroY - y(netto))
            const hInc = Math.max(0, zeroY - y(Math.min(d.collected, netto)))
            return (
              <g key={d.month} opacity={hover == null || hover === i ? 1 : 0.5} pointerEvents="none">
                {/* il netto: il contorno tiene il totale anche quando è tutto scoperto */}
                <rect x={x} y={y(netto)} width={barW} height={hTot} rx="4"
                  fill="var(--color-success)" opacity="0.16" />
                {/* §278 — 2px di respiro fra le due parti: due riempimenti
                    attaccati si leggono come una macchia sola */}
                <rect x={x} y={zeroY - hInc} width={barW} height={hInc} rx="4" fill="url(#bill-in)" />
                {hInc > 3 && hTot - hInc > 3 && (
                  <line x1={x} x2={x + barW} y1={zeroY - hInc} y2={zeroY - hInc}
                    stroke="var(--color-surface)" strokeWidth="2" />
                )}
              </g>
            )
          }) : (
            <g pointerEvents="none">
              {/* area sotto l'emesso: dà il peso, non aggiunge informazione */}
              {storia.length > 1 && (
                <path d={`${path(storia)} L${storia[storia.length - 1].x},${zeroY} L${storia[0].x},${zeroY} Z`}
                  fill="var(--color-success)" opacity="0.10" />
              )}
              {storia.length > 1 && (
                <path d={path(storia)} fill="none" stroke="var(--color-success)" strokeWidth="2.5"
                  strokeLinejoin="round" strokeLinecap="round" />
              )}
              {incassata.length > 1 && (
                <path d={path(incassata)} fill="none" stroke="var(--color-success)" strokeWidth="2"
                  strokeDasharray="1 5" strokeLinecap="round" opacity="0.85" />
              )}
              {ponte.length === 2 && (
                <path d={path(ponte)} fill="none" stroke="var(--color-info)" strokeWidth="2.5"
                  strokeDasharray="6 5" strokeLinecap="round" />
              )}
              {futuro.length > 1 && (
                <path d={path(futuro)} fill="none" stroke="var(--color-info)" strokeWidth="2.5"
                  strokeDasharray="6 5" strokeLinejoin="round" strokeLinecap="round" />
              )}
            </g>
          )}

          {/* i pallini: ci sono in tutte e due le letture, e sono il posto dove si legge il numero */}
          {data.map((d, i) => {
            const v = valOf(d)
            if (v <= 0) return null
            const on = hover === i
            return (
              <circle key={`p-${d.month}`} cx={cx(i)} cy={y(v)} r={on ? 6 : 4}
                fill="var(--color-surface)"
                stroke={d.future ? 'var(--color-info)' : 'var(--color-success)'}
                strokeWidth={on ? 3 : 2} pointerEvents="none" />
            )
          })}

          {/* il mese in corso: una linea sottile che separa il fatto dalla previsione */}
          {(() => {
            const i = data.findIndex(d => d.month === nowM)
            if (i < 0 || i === data.length - 1) return null
            const x = padL + slot * (i + 1)
            return (
              <g pointerEvents="none">
                <line x1={x} x2={x} y1={padT - 6} y2={zeroY} stroke="var(--color-border-strong)"
                  strokeWidth="1" strokeDasharray="2 4" />
                <text x={x + 4} y={padT - 1} fill="var(--color-text-tertiary)" fontSize="10">da qui, previsto</text>
              </g>
            )
          })()}

          {data.map((d, i) => (
            (data.length <= 10 || i % 2 === 0 || hover === i) ? (
              <text key={`x-${d.month}`} x={cx(i)} y={H - 9} textAnchor="middle" pointerEvents="none"
                fill={hover === i ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)'}
                fontSize="11" fontWeight={hover === i ? 700 : 400}>
                {label(d.month)}
              </text>
            ) : null
          ))}
        </svg>

        {/* Il riquadro col numero. Sta fuori dall'SVG per usare i token e il testo
            del resto dell'app: un tooltip nativo non si può leggere in tabella. */}
        {h && (
          <div className="absolute top-0 pointer-events-none"
            style={{ left: `${((hover! + 0.5) / data.length) * 100}%`,
              transform: `translateX(${hover! > data.length / 2 ? '-105%' : '5%'})` }}>
            <div className="bg-surface border border-border-strong rounded-xl shadow-pop px-3 py-2 min-w-[168px]">
              <p className="text-2xs font-bold text-text-primary capitalize">{esteso(h.month)}</p>
              {h.future ? (
                <>
                  <Row label="Previsto" value={h.forecast} tone="text-info" />
                  <p className="text-2xs text-text-tertiary mt-1">dai contratti firmati</p>
                </>
              ) : (
                <>
                  <Row label="Fatturato netto" value={h.issued} tone="text-text-primary" />
                  <Row label="Rientrato" value={h.collected} tone="text-success" />
                  <Row label="In attesa" value={h.pending} tone={h.pending > 0 ? 'text-warning' : 'text-text-tertiary'} />
                  <p className="text-2xs text-text-tertiary mt-1">
                    {h.count} fattur{h.count === 1 ? 'a' : 'e'}
                    {h.issued > 0 && ` · ${Math.round((h.collected / h.issued) * 100)}% rientrato`}
                    {/* Lo storno non è una parte della barra, ma spiega perché il
                        netto è più basso dell'emesso: sta scritto, non disegnato. */}
                    {h.credited > 0 && ` · ${eur(h.credited)} stornati, fuori dal fatturato`}
                  </p>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
        <Key label="rientrato" color="var(--color-success)" />
        <Key label="in attesa" color="var(--color-success)" faded />
        <Key label="previsto dai contratti" color="var(--color-info)" dashed />
      </div>
    </div>
  )
}

function Row({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <p className="flex items-baseline justify-between gap-4 text-2xs">
      <span className="text-text-tertiary">{label}</span>
      <span className={`tabular font-semibold ${tone}`}>{eur(value)}</span>
    </p>
  )
}

function Key({ label, color, faded, dashed }: {
  label: string; color: string; faded?: boolean; dashed?: boolean
}) {
  return (
    <span className="flex items-center gap-1.5 text-2xs text-text-tertiary">
      <span className="w-3 h-2.5 rounded-sm" style={{
        background: dashed ? 'transparent' : color,
        opacity: faded ? 0.22 : 1,
        border: dashed ? `1px dashed ${color}` : undefined,
      }} />
      {label}
    </span>
  )
}
