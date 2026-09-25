'use client'

/**
 * §448 — «Costi e maturati»: quanto costa ognuno mese per mese nel periodo
 * scelto, quanto ha maturato di 13ª, 14ª e TFR, quando escono, e gli F24 del
 * personale in scadenza.
 *
 * I conti stanno in `lib/payroll-periodo.ts` e `lib/scadenze.ts`: qui si
 * sceglie il periodo e si disegna. Ogni cella dice da dove viene — cedolino o
 * stima — perché la stessa tabella li mescola, e una stima che sembra vera è
 * il numero che nessuno va a controllare.
 */

import { useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FileText, Sparkles, CalendarClock } from 'lucide-react'
import { eur } from '@/lib/money'
import { monthLabel, shiftMonth } from '@/lib/pl'
import { tfrLedger, type Payslip, type PayrollParams, type TfrMovement } from '@/lib/payroll'
import type { PersonRow } from '@/lib/payroll-map'
import { calendarioUscite, maturatiAl, matrice, mesiFra, perF24, type Cella } from '@/lib/payroll-periodo'
import { scadenzeF24Personale } from '@/lib/scadenze'

const MESI_BREVI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']
const breve = (m: string) => `${MESI_BREVI[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`
const COSA = { tredicesima: 'Tredicesima', quattordicesima: 'Quattordicesima', tfr: 'TFR in azienda', fondo: 'TFR al fondo pensione' }

export function CostiTab({ month, people, periodo, slips, paramsByYear, params, tfrMoves, f24All }: {
  month: string
  people: PersonRow[]
  periodo: { dal: string; al: string }
  slips: Payslip[]
  paramsByYear: Record<number, PayrollParams>
  params: PayrollParams
  tfrMoves: TfrMovement[]
  f24All: { month: string; total: number; paidOn: string | null }[]
}) {
  const router = useRouter()
  const prm = (anno: number) => paramsByYear[anno] ?? params
  const mesi = useMemo(() => mesiFra(periodo.dal, periodo.al), [periodo.dal, periodo.al])
  const persone = useMemo(() => people.filter(p => p.status !== 'cessata' || p.endsOn), [people])
  const inPeriodo = slips.filter(s => s.month.slice(0, 10) >= periodo.dal && s.month.slice(0, 10) <= periodo.al)
  const m = useMemo(() => matrice(persone, inPeriodo, prm, mesi), [persone, inPeriodo, mesi, paramsByYear])

  const maturati = useMemo(() => persone.map(p => {
    const suoi = slips.filter(s => s.personId === p.id && s.month.slice(0, 10) <= month)
    const tfr = tfrLedger(p.id, suoi, tfrMoves.filter(t => t.personId === p.id), p.tfrOpening, month)
    return { persona: p, maturati: maturatiAl(p, suoi, prm(Number(month.slice(0, 4))), month, tfr) }
  }).filter(x => x.maturati.tredicesima.maturato > 0 || (x.maturati.quattordicesima?.maturato ?? 0) > 0 || x.maturati.tfr.inAzienda > 0),
  [persone, slips, tfrMoves, month, paramsByYear])
  const uscite = useMemo(() => calendarioUscite(maturati, month, 12), [maturati, month])

  const tipoDi = (id: string) => people.find(p => p.id === id)?.kind ?? null
  const scadenze = useMemo(() => {
    const dal = shiftMonth(month, -3), mesiF24 = mesiFra(dal, shiftMonth(month, 1))
    return scadenzeF24Personale(mesiF24, f24All, perF24(slips, tipoDi, prm))
  }, [month, f24All, slips, paramsByYear])

  const vai = (dal: string, al: string) => router.push(`/economics/personale?m=${month}&dal=${dal}&al=${al}`)
  const anno = month.slice(0, 4)
  const trim = Math.floor((Number(month.slice(5, 7)) - 1) / 3) * 3 + 1
  const trimDa = `${anno}-${String(trim).padStart(2, '0')}-01`
  const scelte: [string, string, string][] = [
    ['Questo mese', month, month],
    ['Trimestre', trimDa, shiftMonth(trimDa, 2)],
    [`Anno ${anno}`, `${anno}-01-01`, `${anno}-12-01`],
    ['Ultimi 12 mesi', shiftMonth(month, -11), month],
  ]

  const cella = (c: Cella) => c.fonte === 'fuori'
    ? <span className="text-text-tertiary">—</span>
    : <span className={c.fonte === 'stima' ? 'italic text-text-secondary' : 'text-text-primary'}
        title={`${c.fonte === 'cedolino' ? 'Dal cedolino' : 'Stima da contratto'}${c.oneriStimati && c.fonte === 'cedolino' ? ' (oneri stimati)' : ''}\nLordo ${eur(c.lordo)} · Oneri azienda ${eur(c.oneri)} · TFR ${eur(c.tfr)}${c.altro ? ` · Buoni e benefit ${eur(c.altro)}` : ''}`}>
        {eur(c.totale)}{c.fonte === 'stima' && <span className="text-text-tertiary"> ·s</span>}
      </span>

  return (
    <div className="space-y-6">
      {/* il periodo */}
      <section className="flex items-center gap-2 flex-wrap">
        <div className="flex bg-surface-active rounded-xl p-0.5" role="radiogroup" aria-label="Periodo">
          {scelte.map(([e, d, a]) => {
            const on = periodo.dal === d && periodo.al === a
            return (
              <button key={e} type="button" role="radio" aria-checked={on} onClick={() => vai(d, a)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold ${on ? 'bg-surface text-text-primary shadow-soft' : 'text-text-secondary hover:text-text-primary'}`}>{e}</button>
            )
          })}
        </div>
        <label className="text-xs text-text-secondary flex items-center gap-1">Dal
          <input type="month" value={periodo.dal.slice(0, 7)} onChange={e => e.target.value && vai(`${e.target.value}-01`, periodo.al)}
            className="bg-surface border border-border-interactive rounded-lg px-2 py-1 text-xs text-text-primary" />
        </label>
        <label className="text-xs text-text-secondary flex items-center gap-1">al
          <input type="month" value={periodo.al.slice(0, 7)} onChange={e => e.target.value && vai(periodo.dal, `${e.target.value}-01`)}
            className="bg-surface border border-border-interactive rounded-lg px-2 py-1 text-xs text-text-primary" />
        </label>
      </section>

      {/* la matrice */}
      <section className="bg-surface border border-border rounded-2xl shadow-soft">
        <div className="px-4 py-3 border-b border-border flex items-baseline gap-3 flex-wrap">
          <h2 className="text-sm font-bold text-text-primary">Costo aziendale, mese per mese</h2>
          <span className="text-2xs text-text-tertiary">
            {eur(m.totale)} nel periodo · {m.vere} mesi da cedolino, {m.stimate} stimati da contratto
            <span className="italic"> (·s)</span>. Dicembre e giugno col cedolino portano tredicesima e quattordicesima pagate; le stime le spalmano.
          </span>
        </div>
        {m.righe.length === 0 ? <p className="p-4 text-sm text-text-tertiary">Nessuno in forza nel periodo.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-2xs tabular">
              <thead>
                <tr className="text-text-tertiary border-b border-border">
                  <th className="text-left font-semibold px-4 py-2 sticky left-0 bg-surface">Persona</th>
                  {mesi.map(x => <th key={x} className="text-right font-semibold px-2 py-2 whitespace-nowrap">{breve(x)}</th>)}
                  <th className="text-right font-semibold px-4 py-2">Totale</th>
                </tr>
              </thead>
              <tbody>
                {m.righe.map(r => (
                  <tr key={r.persona.id} className="border-b border-border last:border-0 hover:bg-surface-hover">
                    <td className="px-4 py-2 sticky left-0 bg-surface whitespace-nowrap text-text-primary font-medium">{r.persona.name}</td>
                    {r.celle.map(c => <td key={c.mese} className="text-right px-2 py-2 whitespace-nowrap">{cella(c)}</td>)}
                    <td className="text-right px-4 py-2 font-semibold text-text-primary whitespace-nowrap">{eur(r.totale)}</td>
                  </tr>
                ))}
                <tr className="bg-surface-hover font-semibold">
                  <td className="px-4 py-2 sticky left-0 bg-surface-hover text-text-primary">Totale</td>
                  {m.totaliMese.map((t, i) => <td key={mesi[i]} className="text-right px-2 py-2 text-text-primary whitespace-nowrap">{eur(t)}</td>)}
                  <td className="text-right px-4 py-2 text-text-primary whitespace-nowrap">{eur(m.totale)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* i maturati */}
      <section className="bg-surface border border-border rounded-2xl shadow-soft">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-bold text-text-primary">Maturato a {monthLabel(month).toLowerCase()}</h2>
          <p className="text-2xs text-text-tertiary mt-0.5">Tredicesima da gennaio, quattordicesima da luglio; il pagato viene dai cedolini, il TFR dal registro.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-2xs tabular">
            <thead>
              <tr className="text-text-tertiary border-b border-border">
                <th className="text-left font-semibold px-4 py-2">Persona</th>
                <th className="text-right font-semibold px-2 py-2">13ª maturata</th><th className="text-right font-semibold px-2 py-2">pagata</th><th className="text-right font-semibold px-2 py-2">resta</th>
                <th className="text-right font-semibold px-2 py-2">14ª maturata</th><th className="text-right font-semibold px-2 py-2">pagata</th><th className="text-right font-semibold px-2 py-2">resta</th>
                <th className="text-right font-semibold px-2 py-2">TFR in azienda</th><th className="text-right font-semibold px-4 py-2">al fondo</th>
              </tr>
            </thead>
            <tbody>
              {maturati.map(({ persona: p, maturati: x }) => (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 text-text-primary font-medium whitespace-nowrap">{p.name}</td>
                  <td className="text-right px-2 py-2">{eur(x.tredicesima.maturato)}</td>
                  <td className="text-right px-2 py-2 text-text-secondary">{eur(x.tredicesima.pagato)}</td>
                  <td className="text-right px-2 py-2 font-semibold text-text-primary">{eur(x.tredicesima.residuo)}</td>
                  {x.quattordicesima
                    ? <><td className="text-right px-2 py-2">{eur(x.quattordicesima.maturato)}</td>
                        <td className="text-right px-2 py-2 text-text-secondary">{eur(x.quattordicesima.pagato)}</td>
                        <td className="text-right px-2 py-2 font-semibold text-text-primary">{eur(x.quattordicesima.residuo)}</td></>
                    : <td colSpan={3} className="text-center px-2 py-2 text-text-tertiary">non prevista</td>}
                  <td className="text-right px-2 py-2 font-semibold text-text-primary">{eur(x.tfr.inAzienda)}</td>
                  <td className="text-right px-4 py-2 text-text-secondary">{x.tfr.alFondo || x.tfr.fondoMensile ? eur(x.tfr.alFondo) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* quando escono */}
        <section className="bg-surface border border-border rounded-2xl shadow-soft p-4">
          <h2 className="text-sm font-bold text-text-primary flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-gold-text" />Quando escono</h2>
          <p className="text-2xs text-text-tertiary mt-0.5 mb-2">Nei prossimi dodici mesi, con gli oneri azienda.</p>
          {uscite.length === 0 ? <p className="text-2xs text-text-tertiary">Niente in uscita.</p> : (
            <ul className="divide-y divide-border">
              {uscite.filter(u => u.cosa !== 'fondo').map((u, i) => (
                <li key={i} className="flex items-baseline gap-3 py-1.5 text-2xs">
                  <span className="w-16 text-text-tertiary tabular">{breve(u.mese)}</span>
                  <span className="flex-1 text-text-primary">{COSA[u.cosa]} · {u.chi}</span>
                  <span className="tabular font-semibold text-text-primary">{eur(u.importo)}</span>
                </li>
              ))}
              {uscite.some(u => u.cosa === 'fondo') && (
                <li className="py-1.5 text-2xs text-text-secondary">
                  TFR al fondo pensione: {eur(uscite.filter(u => u.cosa === 'fondo' && u.mese === month).reduce((s, u) => s + u.importo, 0))} al mese
                </li>
              )}
            </ul>
          )}
        </section>

        {/* F24 del personale */}
        <section className="bg-surface border border-border rounded-2xl shadow-soft p-4">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-bold text-text-primary flex items-center gap-1.5"><CalendarClock className="w-4 h-4 text-gold-text" />F24 del personale</h2>
            <Link href="/economics/fiscale" className="text-2xs text-gold-text hover:underline">Tutte le scadenze fiscali →</Link>
          </div>
          <p className="text-2xs text-text-tertiary mt-0.5 mb-2">Il 16 del mese dopo, o il primo giorno lavorativo.</p>
          <ul className="divide-y divide-border">
            {scadenze.map(s => (
              <li key={s.id} className="flex items-baseline gap-3 py-1.5 text-2xs">
                <span className="w-20 text-text-tertiary tabular">{s.data.slice(8)}/{s.data.slice(5, 7)}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-text-primary">{s.etichetta}</span>
                  <span className="block text-text-tertiary">{s.dettaglio}</span>
                </span>
                <span className="text-right">
                  <span className={`block tabular font-semibold ${s.importo == null ? 'text-text-tertiary' : 'text-text-primary'}`}>{s.importo == null ? 'n/d' : eur(s.importo)}</span>
                  <span className={`block ${s.pagata ? 'text-success' : 'text-warning'}`}>{s.pagata ? `pagato il ${s.pagataIl!.slice(8)}/${s.pagataIl!.slice(5, 7)}` : 'da pagare'}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="flex items-center gap-1 text-2xs text-text-tertiary mt-2"><FileText className="w-3 h-3" />Quando carichi l’F24 del consulente l’importo vero sostituisce la stima.</p>
        </section>
      </div>
    </div>
  )
}
