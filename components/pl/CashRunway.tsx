'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Landmark, ChevronDown, Info, Receipt, Users, ArrowDownRight, ArrowUpRight,
  PhoneCall, ShieldAlert, CheckCircle2, AlertTriangle, Wallet,
} from 'lucide-react'
import { eur } from '@/lib/money'
import { monthLabel } from '@/lib/pl'
import { dayLabel } from '@/lib/cash-calendar'
import type { Runway, StepKey } from '@/lib/cash-runway'

/**
 * §225, §233 — Tenuta di cassa: il saldo vero contro quello che il mese deve
 * ancora far uscire.
 *
 * Il margine è imponibile e di competenza, il conto corrente è lordo e ha una
 * data: sono due domande, e finché vivevano in due pagine diverse alla seconda
 * non rispondeva nessuno.
 *
 * La schermata ha tre livelli, e sono tre domande sempre più fini: **i tre
 * esiti** in testa (se non incassi niente · se pagano i puntuali · se rientrano
 * gli arretrati), il **verdetto** in una frase, e la **scala** che mostra come
 * ci si arriva. Prima era una lista sola di cinque paragrafi lunghi uguali: il
 * numero che conta — dove finisci se nessuno paga — stava in fondo e non si
 * distingueva dagli altri.
 *
 * La scala ha due metà e non sono simmetriche: sopra quello che esce comunque,
 * sotto quello che *potrebbe* entrare. Le uscite sono certe, gli incassi no, e
 * un arretrato di cinquanta giorni non è un incasso atteso — è una telefonata
 * da fare. Il colore e la posizione lo dicono prima di leggere.
 */

const ICON: Record<StepKey, typeof Landmark> = {
  ora: Wallet,
  paghi: ArrowDownRight,
  iva: Receipt,
  compensi: Users,
  puntuali: ArrowUpRight,
  arretrati: PhoneCall,
}

export function CashRunway({ runway: r, bankReady, month }: {
  runway: Runway
  bankReady: boolean
  month: string
}) {
  const [openMonths, setOpenMonths] = useState(false)
  /* §237 — i compensi sono l'ultimo gradino e l'unico che si può spostare:
     l'IVA ha una data, le fatture dei fornitori pure, i compensi no. La domanda
     che si fa ogni mese è «quanto respiro dà rimandarli», e senza il secondo
     numero quel respiro te lo calcoli a mente. Di default sono **dentro**: la
     lettura prudente è quella giusta da mostrare per prima. */
  const [payNow, setPayNow] = useState(true)

  if (!bankReady) return null

  /* Rimandandoli, tutti i gradini dopo l'IVA risalgono dello stesso importo:
     non c'è una seconda formula, c'è lo stesso numero non ancora uscito. */
  const off = !payNow && r.alt
  const shift = off ? r.payoutsOpen : 0
  const view = off
    ? { floor: r.alt!.floor, expected: r.alt!.expected, best: r.alt!.best, verdict: r.alt!.verdict }
    : { floor: r.floor, expected: r.expected, best: r.best, verdict: r.verdict }

  const tone = view.verdict === 'negativo'
    ? { frame: 'border-error/50', bg: 'bg-error-dim', text: 'text-error',
        chip: 'bg-error text-on-gold', label: 'Non ci arrivi',
        icon: <ShieldAlert className="w-4 h-4 text-error" /> }
    : view.verdict === 'stretto'
      ? { frame: 'border-warning/50', bg: 'bg-warning-dim', text: 'text-warning',
          chip: 'bg-warning-dim text-warning border border-warning/40', label: 'Dipende dai clienti',
          icon: <AlertTriangle className="w-4 h-4 text-warning" /> }
      : { frame: 'border-border', bg: 'bg-success-dim', text: 'text-success',
          chip: 'bg-success-dim text-success border border-success/40', label: 'Regge',
          icon: <CheckCircle2 className="w-4 h-4 text-success" /> }

  /* La scala delle barre è **una sola** per tutti i gradini, e comprende lo
     zero: barre riscalate ognuna sul proprio valore fanno sembrare uguali un
     saldo di 1.500 e uno di 15.000. */
  const span = Math.max(...r.scenarios.map(s => Math.abs(s.balance)), 1)
  const cols = r.outcomes.length >= 3 ? 'sm:grid-cols-3' : r.outcomes.length === 2 ? 'sm:grid-cols-2' : ''

  /* I due blocchi si annunciano una volta sola, prima del loro primo gradino:
     è quello che rende leggibile l'asimmetria fra certo e sperato. */
  const firstIncasso = r.scenarios.find(s => s.kind === 'incasso')?.key
  const firstObbligo = r.scenarios.find(s => s.kind === 'obbligo')?.key

  return (
    <section className={`bg-surface border rounded-2xl shadow-soft overflow-hidden ${tone.frame}`}>
      <div className="flex items-start justify-between gap-3 px-5 py-4 flex-wrap">
        <div className="min-w-0 flex-1 basis-64">
          <h2 className="flex items-center gap-2 text-sm font-bold text-text-primary">
            <Landmark className="w-4 h-4 text-info" />
            Tenuta di cassa · {monthLabel(month)}
          </h2>
          <p className="text-2xs text-text-tertiary mt-0.5">
            Il saldo vero del conto contro quello che il mese deve ancora far uscire, IVA e compensi
            compresi. Non è il margine: quello è imponibile e di competenza
          </p>
        </div>
        <span className={`shrink-0 text-2xs font-bold px-2.5 py-1 rounded-full ${tone.chip}`}>
          {tone.label}
        </span>
      </div>

      {/* ── i tre esiti: la stessa domanda, tre risposte ── */}
      <div className={`grid grid-cols-1 ${cols} border-y border-border bg-background
        divide-y sm:divide-y-0 sm:divide-x divide-border`}>
        {r.outcomes.map(o0 => {
          const o = { ...o0, value: o0.key === 'floor' ? view.floor : o0.key === 'expected' ? view.expected : view.best }
          return (
          <div key={o.key} className="px-5 py-3">
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                o.value < 0 ? 'bg-error' : o.key === 'floor' ? 'bg-success' : 'bg-info'}`} aria-hidden="true" />
              <span className="text-2xs uppercase tracking-wider text-text-tertiary">{o.title}</span>
            </div>
            <div className={`text-xl font-bold tabular mt-0.5 ${
              o.value < 0 ? 'text-error' : 'text-text-primary'}`}>
              {eur(o.value)}
            </div>
            <div className="text-2xs text-text-tertiary">{o.hint}</div>
          </div>
          )
        })}
      </div>

      {/* ── il verdetto, in una frase ── */}
      <div className={`flex items-start gap-2.5 px-5 py-3 ${tone.bg} border-b border-border`}>
        <span className="shrink-0 mt-0.5">{tone.icon}</span>
        <p className="text-2xs text-text-secondary">
          {off
            ? <>Rimandando i compensi il mese chiude a{' '}
                <strong className="text-text-primary">{eur(view.floor)}</strong> senza incassare niente.
                Non spariscono: restano <strong className="text-text-primary">{eur(r.payoutsOpen)}</strong> da
                erogare, e sono i primi soldi che escono appena entra qualcosa.</>
            : r.headline.split('**').map((part, k) =>
                k % 2 === 1 ? <strong key={k} className="text-text-primary">{part}</strong> : part)}
        </p>
      </div>

      {/* ── la scala: prima quello che esce comunque, poi quello che può entrare ── */}
      <ul className="divide-y divide-border/60">
        {r.scenarios.map(s0 => {
          /* Col gradino spento i saldi che vengono dopo risalgono, e quello dei
             compensi coincide con l'IVA: è la stessa scala, con un pagamento in
             meno dentro. */
          const s = { ...s0, balance: ['compensi', 'puntuali', 'arretrati'].includes(s0.key)
            ? Math.round((s0.balance + shift) * 100) / 100 : s0.balance }
          const spento = off && s.key === 'compensi'
          const Icon = ICON[s.key]
          const neg = s.balance < 0
          const w = Math.min(100, (Math.abs(s.balance) / span) * 100)
          const uncertain = s.kind === 'incasso'
          return (
            <li key={s.key}>
              {s.key === firstObbligo && (
                <p className="px-5 pt-3 text-2xs uppercase tracking-wider text-text-tertiary font-semibold">
                  Quello che esce comunque
                  <span className="normal-case tracking-normal font-normal"> · non dipende da nessuno</span>
                </p>
              )}
              {s.key === firstIncasso && (
                <p className="px-5 pt-3 text-2xs uppercase tracking-wider text-info font-semibold">
                  Quello che può entrare
                  <span className="normal-case tracking-normal font-normal text-text-tertiary">
                    {' '}· sono crediti, non incassi
                  </span>
                </p>
              )}
              <div className="px-5 py-2.5">
                <div className="flex items-baseline gap-2.5">
                  <Icon className={`w-3.5 h-3.5 shrink-0 self-center ${
                    s.kind === 'saldo' ? 'text-text-tertiary'
                      : s.kind === 'obbligo' ? 'text-error' : 'text-info'}`} aria-hidden="true" />
                  <span className={`text-2xs font-semibold flex-1 min-w-0 ${
                    spento ? 'text-text-tertiary' : 'text-text-primary'}`}>
                    {spento ? 'Rimandi i compensi maturati' : s.label}
                  </span>
                  {/* §237 — l'interruttore sta **sulla riga**, dove il numero
                      cambia: un comando lontano dal suo effetto non lo usa nessuno. */}
                  {s.key === 'compensi' && r.alt && (
                    <button type="button" onClick={() => setPayNow(v => !v)} aria-pressed={payNow}
                      title="I compensi sono l'unica voce senza una data: la scelta è quando erogarli, non se"
                      className={`shrink-0 text-2xs font-semibold rounded-full border px-2 py-0.5 press ${
                        payNow ? 'border-error/40 bg-error-dim text-error'
                          : 'border-border bg-surface-active text-text-tertiary'}`}>
                      {payNow ? 'li eroghi' : 'rimandati'}
                    </button>
                  )}
                  {s.delta !== 0 && (
                    <span className={`text-2xs tabular shrink-0 ${
                      spento ? 'text-text-tertiary line-through'
                        : uncertain ? 'text-info' : 'text-error'}`}>
                      {uncertain ? '+' : '−'}{eur(Math.abs(s.delta))}
                    </span>
                  )}
                  <span className={`text-sm font-bold tabular shrink-0 w-24 text-right ${
                    neg ? 'text-error' : 'text-text-primary'}`}>
                    {eur(s.balance)}
                  </span>
                </div>
                {/* §231 — la barra parte da sinistra, come tutte le barre. La versione
                    centrata sullo zero era più espressiva e si leggeva peggio: un
                    saldo positivo che comincia a metà sembra un numero spostato.
                    Il segno lo dicono il colore e la cifra, che è dove lo si cerca.
                    Sui gradini incerti è smorzata: quel saldo è un'ipotesi. */}
                <div className="relative h-1.5 mt-1.5 ml-6 rounded-full bg-surface-active overflow-hidden">
                  <span aria-hidden="true"
                    className={`absolute inset-y-0 left-0 rounded-full ${
                      neg ? 'bg-error' : uncertain ? 'bg-info/50' : spento ? 'bg-border-strong' : 'bg-success'}`}
                    style={{ width: `${Math.max(w, 1.5)}%` }} />
                </div>
                <p className="text-2xs text-text-tertiary mt-1 ml-6">
                  {spento && <span className="text-text-secondary">Restano da erogare e non hanno una scadenza: si spostano, non si tolgono. </span>}
                  {s.why.split('**').map((part, k) =>
                    k % 2 === 1 ? <strong key={k} className="text-text-secondary">{part}</strong> : part)}
                  {s.key === 'iva' && (
                    <>
                      {' '}
                      <Link href="/economics/fiscale" className="text-gold-text hover:underline">
                        {r.vatLabel}{r.vatDeadline ? `, ${dayLabel(r.vatDeadline)}` : ''}
                      </Link>
                      {r.vatDays != null && (
                        <span className={r.vatDays <= 15 && r.vatDueInMonth ? ' text-warning font-semibold' : ''}>
                          {' '}· {r.vatDays < 0 ? `scaduta da ${-r.vatDays} giorni` : `fra ${r.vatDays} giorni`}
                        </span>
                      )}.
                    </>
                  )}
                </p>
              </div>
            </li>
          )
        })}
      </ul>

      {/* ── il rotolo dei mesi: quando si rompe ── */}
      <button type="button" onClick={() => setOpenMonths(o => !o)} aria-expanded={openMonths}
        className="w-full flex items-center gap-2.5 px-5 py-3 border-t border-border text-left hover:bg-surface-hover">
        <span className="min-w-0 flex-1">
          <span className="block text-2xs font-bold text-text-primary">
            E nei prossimi {r.months.length} mesi
          </span>
          <span className="block text-2xs text-text-tertiary">
            {r.breaks
              ? <>Il conto va sotto zero a <strong className="text-error">{monthLabel(r.breaks)}</strong>
                {r.lowest && <> · punto più basso {eur(r.lowest.balance)} a {monthLabel(r.lowest.month)}</>}</>
              : r.lowest
                ? <>Non scende mai sotto zero · il minimo è {eur(r.lowest.balance)} a {monthLabel(r.lowest.month)}</>
                : 'Nessuna scadenza nota nei prossimi mesi'}
          </span>
        </span>
        <ChevronDown className={`w-4 h-4 text-text-tertiary shrink-0 transition-transform ${
          openMonths ? '' : '-rotate-90'}`} aria-hidden="true" />
      </button>

      {openMonths && (
        <div className="overflow-x-auto border-t border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-2xs text-text-tertiary uppercase tracking-wider">
                <th className="text-left font-semibold px-5 py-2">Mese</th>
                <th className="text-right font-semibold px-2 py-2">Entra</th>
                <th className="text-right font-semibold px-2 py-2">Esce</th>
                <th className="text-right font-semibold px-2 py-2">IVA</th>
                <th className="text-right font-semibold px-2 py-2">Netto</th>
                <th className="text-right font-semibold px-5 py-2">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {r.months.map(m => (
                <tr key={m.month} className={`border-t border-border/60 ${
                  m.balance < 0 ? 'bg-error-dim/40' : ''}`}>
                  <td className="px-5 py-2">
                    <span className="text-2xs font-semibold text-text-primary">{monthLabel(m.month)}</span>
                    {/* Da dove viene il numero: righe già registrate o contratti e
                        piano. Senza, un mese futuro pieno sembra un fatto. */}
                    <span className="block text-2xs text-text-tertiary">
                      {m.open ? 'righe registrate' : 'da contratti e piano'}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right text-2xs tabular text-success">{eur(m.inflow)}</td>
                  <td className="px-2 py-2 text-right text-2xs tabular text-error">
                    {eur(m.outflow)}
                    {/* Una stima dentro un totale che sembra un fatto è peggio di
                        un buco: qui si dichiara sulla riga, non in nota. */}
                    {m.payouts > 0 && (
                      <span className="block text-2xs text-accent"
                        title="Compensi a soci e commerciali maturati e non ancora erogati: non sono righe di costo">
                        di cui {eur(m.payouts)} compensi
                      </span>
                    )}
                    {m.estimated > 0 && (
                      <span className="block text-2xs text-text-tertiary"
                        title="Il piano dei costi non contiene il costo del lavoro: qui è stimato uguale a questo mese">
                        di cui {eur(m.estimated)} stimati
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right text-2xs tabular text-warning">
                    {m.vat > 0 ? eur(m.vat) : '—'}
                  </td>
                  <td className={`px-2 py-2 text-right text-2xs tabular ${
                    m.net < 0 ? 'text-error' : 'text-text-secondary'}`}>
                    {m.net >= 0 ? '+' : '−'}{eur(Math.abs(m.net))}
                  </td>
                  <td className={`px-5 py-2 text-right text-2xs font-bold tabular ${
                    m.balance < 0 ? 'text-error' : 'text-text-primary'}`}>
                    {eur(m.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="flex items-start gap-2 text-2xs text-text-tertiary px-5 py-3 border-t border-border">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            Gli importi sono lordi, perché dal conto passa il totale della fattura. Gli scoperti già scaduti
            pesano sul <strong className="text-text-secondary">primo</strong> mese, non su quello in cui erano
            attesi: nella curva servono qui. Sui mesi già aperti valgono le righe registrate, sugli altri i
            contratti e il piano — sommarli entrambi conterebbe due volte lo stesso canone. Il costo del
            lavoro dei mesi non aperti è <strong className="text-text-secondary">stimato uguale a questo
            mese</strong>: il piano dei costi non lo contiene, e senza la stima ogni mese futuro sembrerebbe
            costare novemila euro in meno. I <strong className="text-text-secondary">compensi</strong> escono
            nel mese dopo quello in cui maturano — come il costo del lavoro, che si paga il 20 — e i bonifici
            già usciti sono imputati dal più vecchio.
          </p>
        </div>
      )}
    </section>
  )
}
