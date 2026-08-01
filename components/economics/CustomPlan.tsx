'use client'

import { useState } from 'react'
import type { ScheduleSpec } from '@/lib/revenue'

/**
 * Il piano di pagamento costruito a mano.
 *
 * I preset coprono i casi che tornano, ma un accordo commerciale vero è quasi
 * sempre una combinazione: un acconto, una durata, un numero di rate, oppure
 * tranche legate agli stati di avanzamento. Qui si compone quella combinazione;
 * quello che esce resta comunque modificabile rata per rata.
 */
export function CustomPlan({ defaultMonth, onBuild }: {
  defaultMonth: string
  onBuild: (spec: ScheduleSpec) => void
}) {
  const [kind, setKind] = useState<'deposit' | 'even' | 'percent'>('deposit')
  const [deposit, setDeposit] = useState('30')
  const [count, setCount] = useState('3')
  const [every, setEvery] = useState('1')
  const [from, setFrom] = useState(defaultMonth)
  const [tranches, setTranches] = useState('40, 30, 30')

  const percents = tranches.split(/[,;\s]+/).map(Number).filter(n => n > 0)
  const sum = percents.reduce((a, b) => a + b, 0)

  const build = () => onBuild({
    mode: kind,
    depositPct: Number(deposit) || 0,
    count: Math.max(1, Number(count) || 1),
    percents,
    everyMonths: Math.max(1, Number(every) || 1),
    startMonth: `${from}-01`,
  })

  return (
    <div className="rounded-xl border border-gold/30 bg-gold-dim/40 p-3 mb-2 space-y-2">
      <div className="flex items-center gap-1.5 flex-wrap">
        {([
          ['deposit', 'Acconto + rate'],
          ['even', 'Solo rate uguali'],
          ['percent', 'Tranche a percentuali'],
        ] as const).map(([k, label]) => (
          <button key={k} onClick={() => setKind(k)} aria-pressed={kind === k}
            className={`text-2xs font-semibold rounded-lg px-2 py-1 border ${
              kind === k ? 'bg-gold text-on-gold border-gold' : 'border-border text-text-secondary hover:bg-surface-hover'
            }`}>{label}</button>
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-4">
        {kind === 'deposit' && (
          <Field label="Acconto %">
            <input type="number" value={deposit} onChange={e => setDeposit(e.target.value)}
              aria-label="Percentuale di acconto" className={inp} />
          </Field>
        )}
        {kind !== 'percent' && (
          <Field label={kind === 'deposit' ? 'Rate dopo l’acconto' : 'Numero di rate'}>
            <input type="number" value={count} onChange={e => setCount(e.target.value)}
              aria-label="Numero di rate" className={inp} />
          </Field>
        )}
        {kind === 'percent' && (
          <Field label="Tranche in %">
            <input value={tranches} onChange={e => setTranches(e.target.value)}
              aria-label="Percentuali delle tranche" placeholder="40, 30, 30" className={inp} />
          </Field>
        )}
        <Field label="Ogni (mesi)">
          <input type="number" value={every} onChange={e => setEvery(e.target.value)}
            aria-label="Cadenza in mesi" className={inp} />
        </Field>
        <Field label="Prima scadenza">
          <input type="month" value={from} onChange={e => setFrom(e.target.value)}
            aria-label="Mese della prima scadenza" className={inp} />
        </Field>
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-2xs text-text-tertiary">
          {kind === 'deposit' && `Acconto del ${deposit || 0}% alla firma, poi ${count || 1} rate uguali ogni ${every || 1} mes${Number(every) === 1 ? 'e' : 'i'}.`}
          {kind === 'even' && `${count || 1} rate uguali ogni ${every || 1} mes${Number(every) === 1 ? 'e' : 'i'}.`}
          {kind === 'percent' && (
            sum === 100
              ? `${percents.length} tranche: ${percents.join('% · ')}%.`
              : <span className="text-warning">Le tranche fanno {sum}% invece di 100: l&apos;ultima assorbe la differenza.</span>
          )}
          {' '}L&apos;ultima rata assorbe l&apos;arrotondamento: la somma fa sempre il totale.
        </p>
        <button onClick={build} disabled={kind === 'percent' && percents.length === 0}
          className="text-2xs font-bold bg-gold text-on-gold rounded-lg px-3 py-1.5 press disabled:opacity-40">
          Genera piano
        </button>
      </div>
      <p className="text-2xs text-text-tertiary">
        Sostituisce il piano esistente. Dopo puoi spostare le singole rate o aggiungerne una a mano.
      </p>
    </div>
  )
}


const inp = 'w-full bg-background border border-border rounded-lg px-2 py-1 text-2xs text-text-primary'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-2xs font-semibold text-text-secondary mb-1">{label}</span>
      {children}
    </label>
  )
}
