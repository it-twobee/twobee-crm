'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft, ChevronRight, ChevronDown, Info, Landmark, TrendingUp, TrendingDown,
  ArrowDownRight, ArrowUpRight, Banknote, Check,
} from 'lucide-react'
import { eur } from '@/lib/money'
import { monthLabel, shiftMonth, type RevenueLine, type CostLine } from '@/lib/pl'
import { prospetto, type Basis } from '@/lib/pl-aggregate'
import { EconomicsNav } from '@/components/economics/EconomicsNav'
import { CashPlan } from '@/components/pl/CashPlan'
import type { PlanMonth } from '@/lib/cash-plan'

/**
 * §239 — Il prospetto.
 *
 * Il conto economico è il mese, riga per riga, ed è dove si spunta. Questa è
 * l'altra domanda: **dove vanno i soldi**, in che proporzione, e se la cosa sta
 * cambiando. Righe = macro categorie, colonne = mesi, e un selettore che dice
 * se si sta guardando quello che è **maturato** o quello che si è **mosso**.
 *
 * Tre cose che la tabella deve dire da sola, o è un foglio Excel colorato:
 *
 *   · **la quota**, accanto al totale di riga: 8.899 € non significano niente,
 *     «il 42% di quello che esce» sì.
 *   · **quale mese è chiuso**: una fotografia e un mese in corso non si
 *     confrontano, e l'ultima colonna è quasi sempre incompleta.
 *   · **la banca sotto**, con l'IVA in riga: il prospetto è netto, il conto è
 *     lordo, e senza quel passaggio il confronto è fra due cose diverse.
 */
export function ProspettoClient(props: {
  month: string
  span: number
  setupNeeded: boolean
  months: { month: string; status: string }[]
  revenue: (RevenueLine & { month: string })[]
  costs: (CostLine & { month: string })[]
  txs: { booked_on: string; amount: number; source: string; kind: string }[]
  payouts: {
    month: string; partners: number; sales: number
    paidPartners?: number; paidSales?: number; paidOut: number
    /** §291 — chi prende cosa: il P&L li mostra riga per riga */
    people?: { who: string; kind: 'socio' | 'commerciale'; amount: number; paid?: number }[]
  }[]
  opening: number
  today: string
  bankReady: boolean
  collection?: [string, string][]
  first?: string
  /** §262 — la catena dei mesi col piano di cassa, voce per voce */
  plan?: PlanMonth[]
  vatHeld?: number
  vatLabel?: string
  vatDeadline?: string | null
  /** i mesi selezionabili: quelli registrati più sei avanti */
  horizon?: string[]
  /** §265 — i movimenti veri del mese guardato, e il saldo di adesso */
  bank?: { inflow: number; outflow: number; balance: number } | null
  /** §312 — il conto del mese come l'ha visto la banca: dentro non c'è niente di atteso */
  bankMonth?: { opening: number; inflow: number; outflow: number; lastStatement: string | null } | null
  /** §312 — compensi cumulativi per persona: maturato contro erogato */
  ledger?: {
    who: string; kind: 'socio' | 'commerciale'; accrued: number; paid: number
    /** §228 — per lui si conta da sempre: non ha mai ricevuto un bonifico */
    fromAlways?: boolean
    /** §233 — mai un bonifico su nessun mese, non solo su quelli in finestra */
    never?: boolean
  }[]
  /** §230 — da quale mese conta il cumulato: prima è liquidato */
  ledgerSince?: string | null
}) {
  const router = useRouter()
  const [basis, setBasis] = useState<Basis>('competenza')
  const cash = basis === 'cassa'

  const window = useMemo(() => {
    const from = shiftMonth(props.month, -(props.span - 1))
    return props.months.map(m => m.month).filter(m => m >= from && m <= props.month).sort()
  }, [props.months, props.month, props.span])

  const args = useMemo(() => ({
    months: window, revenue: props.revenue, costs: props.costs, txs: props.txs,
    payouts: props.payouts, opening: props.opening, today: props.today,
    ctx: { collection: new Map(props.collection ?? []) },
  }), [window, props.revenue, props.costs, props.txs, props.payouts, props.opening, props.today, props.collection])
  const p = useMemo(() => prospetto({ ...args, basis }), [args, basis])
  /* §240 — su un mese solo le due letture stanno **affiancate**: lì la domanda
     non è come cambia una proporzione ma «cosa è previsto e cosa si è mosso», e
     un selettore costringerebbe a ricordarsi il numero dell'altra colonna. */
  const single = window.length === 1
  const other = useMemo(
    () => (single ? prospetto({ ...args, basis: basis === 'cassa' ? 'competenza' : 'cassa' }) : null),
    [args, basis, single])
  const comp = single ? (basis === 'competenza' ? p : other!) : p
  const cassaP = single ? (basis === 'cassa' ? p : other!) : p

  const statusOf = new Map(props.months.map(m => [m.month, m.status]))
  const go = (d: number) => router.push(`/economics/prospetto?m=${shiftMonth(props.month, d)}&n=${props.span}`)

  if (props.setupNeeded) {
    return (
      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5">
        <EconomicsNav active="prospetto" month={props.month} />
        <p className="text-sm text-text-secondary">
          Le tabelle del conto economico non esistono ancora: esegui{' '}
          <code className="px-1 py-0.5 rounded bg-surface border border-border">163_profit_loss.sql</code>.
        </p>
      </div>
    )
  }

  const col = 'px-2 py-2 text-right text-2xs tabular whitespace-nowrap'
  const head = 'px-2 py-2 text-right text-2xs font-semibold uppercase tracking-wider whitespace-nowrap'

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5">
      <EconomicsNav active="prospetto" month={props.month} />

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <button onClick={() => go(-1)} aria-label="Mese precedente"
              className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-hover press">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <h1 className="text-2xl sm:text-3xl font-bold text-text-primary font-heading">Prospetto</h1>
            {/* §262 — il mese sta **nel titolo** ed è una scelta, non una freccia
                da premere sei volte: la domanda di questa pagina è sempre «come
                sta un mese», e con le sole frecce arrivare a dicembre costava
                quattro clic e la perdita del punto di partenza. Ci sono anche i
                mesi che nessuno ha ancora aperto: è lì che serve guardare. */}
            <label className="relative">
              <span className="sr-only">Mese</span>
              <select value={props.month}
                onChange={e => router.push(`/economics/prospetto?m=${e.target.value}&n=${props.span}`)}
                className="appearance-none bg-surface border border-border-interactive rounded-xl
                           pl-3 pr-8 py-1.5 text-sm font-semibold text-text-primary cursor-pointer
                           hover:bg-surface-hover">
                {(props.horizon ?? props.months.map(m => m.month)).map(m => (
                  <option key={m} value={m}>
                    {monthLabel(m)}{statusOf.get(m) === 'chiuso' ? ' · chiuso' : statusOf.has(m) ? '' : ' · da aprire'}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
            </label>
            <button onClick={() => go(1)} aria-label="Mese successivo"
              className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-hover press">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <p className="text-sm text-text-secondary mt-1">
            Entrate e uscite per macro categoria ·{' '}
            {single ? monthLabel(props.month) : `${window.length} mesi fino a ${monthLabel(props.month)}`}
          </p>
        </div>
        <div className="flex bg-surface border border-border rounded-xl p-0.5">
          {[1, 3, 6, 12].map(n => (
            <button key={n} onClick={() => router.push(`/economics/prospetto?m=${props.month}&n=${n}`)}
              aria-pressed={n === props.span}
              className={`px-2.5 py-1.5 rounded-lg text-2xs font-semibold ${
                n === props.span ? 'bg-gold text-on-gold' : 'text-text-secondary hover:text-text-primary'}`}>
              {n === 1 ? 'Mese' : `${n} mesi`}
            </button>
          ))}
        </div>
      </div>

      {/* ── §312 · la prima domanda, e ha tre numeri ─────────────────────────
          «Quanto entra, quanto esce, quanto rimane» — sulla base del conto, che
          è l'unica risposta che non contiene niente di atteso: quello che nessuno
          ha pagato non c'è dentro, per costruzione, e non perché qualcuno si sia
          ricordato di filtrarlo. Sta sopra ogni altra cosa perché è la domanda
          con cui si apre la pagina; tutto il resto è il dettaglio di questi tre
          numeri, e ci si scende dopo. */}
      {single && props.bankMonth && (
        <ContoDelMese m={props.bankMonth} month={props.month} />
      )}

      {/* ── §262 · il piano di cassa: cosa deve succedere perché il mese chiuda ──
          Sta **prima** del prospetto perché è la domanda che si fa aprendo la
          pagina in un mese difficile. Il prospetto dice dove vanno i soldi, e la
          si legge dopo aver capito se ci sono. */}
      {single && props.plan && props.plan.length > 0 && (
        <CashPlan plan={props.plan} month={props.month} bankReady={props.bankReady}
          vatHeld={props.vatHeld} vatLabel={props.vatLabel} vatDeadline={props.vatDeadline}
          bank={props.bank ?? null} />
      )}

      {/* ── la lettura: è la stessa domanda della §210, e la risposta cambia mese ── */}
      <section className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
        <div className="flex items-start gap-3 px-5 py-4 flex-wrap">
          <div className={`flex bg-surface-active rounded-xl p-0.5 shrink-0 ${single ? 'hidden' : ''}`}>
            <button onClick={() => setBasis('competenza')} aria-pressed={!cash}
              className={`px-3 py-1.5 rounded-lg text-2xs font-semibold ${
                !cash ? 'bg-surface text-text-primary shadow-soft' : 'text-text-secondary'}`}>
              Competenza
            </button>
            <button onClick={() => setBasis('cassa')} aria-pressed={cash}
              className={`px-3 py-1.5 rounded-lg text-2xs font-semibold ${
                cash ? 'bg-surface text-text-primary shadow-soft' : 'text-text-secondary'}`}>
              Cassa
            </button>
          </div>
          <p className="text-2xs text-text-tertiary flex-1 min-w-[240px]">
            {single
              ? <><strong className="text-text-secondary">Competenza</strong> è quello che il mese ha
                  prodotto, pagato o no; <strong className="text-text-secondary">cassa</strong> è quello che
                  in questo mese è stato spuntato come pagato. Sono affiancate perché la domanda è quanto
                  manca fra le due, e con un selettore quel numero te lo ricordi a mente.</>
              : cash
              ? <>Il mese in cui i <strong className="text-text-secondary">soldi si sono mossi</strong>: una riga
                  non pagata non c&apos;è, e lo stipendio di luglio pesa su agosto. È quello che il conto ha visto.</>
              : <>Il mese in cui il <strong className="text-text-secondary">lavoro è stato fatto</strong>, pagato o
                  no. È la lettura del conto economico, e non dice quando i soldi si muovono.</>}
          </p>
          <div className="text-right ml-auto shrink-0">
            <div className={`text-xl font-bold tabular ${
              p.totals.margin.total < 0 ? 'text-error' : 'text-success'}`}>
              {eur(p.totals.margin.total)}
            </div>
            <div className="text-2xs text-text-tertiary">
              {eur(p.totals.revenue.total)} − {eur(p.totals.costs.total)} su {window.length} mesi
            </div>
          </div>
        </div>

        {single ? (
          <SingleMonth comp={comp} cassa={cassaP} col={col} head={head} />
        ) : (
        <div className="overflow-x-auto border-t border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-text-tertiary">
                <th className="text-left text-2xs font-semibold uppercase tracking-wider px-5 py-2">Voce</th>
                {p.months.map(m => (
                  <th key={m} className={head}>
                    {monthLabel(m).split(' ')[0].slice(0, 3)}
                    {/* un mese chiuso è una fotografia, uno in corso è incompleto:
                        confrontarli senza saperlo è il primo errore di lettura */}
                    <span className="block font-normal normal-case tracking-normal text-text-tertiary">
                      {statusOf.get(m) === 'chiuso' ? 'chiuso' : 'aperto'}
                    </span>
                  </th>
                ))}
                <th className={`${head} px-5`}>Totale</th>
                <th className={head}>%</th>
              </tr>
            </thead>

            <Block title="Entrate" rows={p.revenue} total={p.totals.revenue} tone="success" col={col} />
            {/* §240 — i compensi stanno **fra le uscite**, perché dal conto escono
                come tutto il resto, ma sotto una riga loro: non sono righe di
                conto economico (non si scrivono, si ricalcolano) e sommarli ai
                costi darebbe un margine diverso da quello del conto economico,
                con lo stesso nome. */}
            <Block title="Uscite" rows={p.costs} total={p.totals.costs} tone="error" col={col}
              extra={p.payouts} extraTotal={p.totals.payouts} />

            <tbody className="border-t-2 border-border-strong">
              <tr>
                <td className="px-5 py-2 text-2xs font-semibold text-text-secondary">
                  Margine
                  <span className="block text-2xs font-normal text-text-tertiary">
                    entrate meno costi: lo stesso numero del conto economico
                  </span>
                </td>
                {p.totals.margin.cells.map(c => (
                  <td key={c.month} className={`${col} ${
                    c.value < 0 ? 'text-error' : 'text-text-secondary'}`}>{eur(c.value)}</td>
                ))}
                <td className={`${col} px-5 font-semibold ${
                  p.totals.margin.total < 0 ? 'text-error' : 'text-text-primary'}`}>
                  {eur(p.totals.margin.total)}
                </td>
                <td className={`${col} text-text-tertiary`}>
                  {p.totals.revenue.total > 0
                    ? `${Math.round((p.totals.margin.total / p.totals.revenue.total) * 100)}%`
                    : '—'}
                </td>
              </tr>
              <tr className="bg-surface-hover">
                <td className="px-5 py-2.5 text-2xs font-bold text-text-primary">
                  Resta alla società
                  <span className="block text-2xs font-normal text-text-tertiary">
                    dopo i compensi a soci e commerciali
                  </span>
                </td>
                {p.totals.left.cells.map(c => (
                  <td key={c.month} className={`${col} font-bold ${
                    c.value < 0 ? 'text-error' : 'text-text-primary'}`}>{eur(c.value)}</td>
                ))}
                <td className={`${col} px-5 font-bold ${
                  p.totals.left.total < 0 ? 'text-error' : 'text-text-primary'}`}>
                  {eur(p.totals.left.total)}
                </td>
                <td className={`${col} text-text-tertiary`}>
                  {p.totals.revenue.total > 0
                    ? `${Math.round((p.totals.left.total / p.totals.revenue.total) * 100)}%`
                    : '—'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        )}
      </section>

      {/* ── §312 · i compensi cumulativi, in fondo ───────────────────────────
          La sezione Compensi del conto economico risponde a «quanto spetta per
          questo mese»; questa a «quanto dobbiamo in tutto», che è la domanda che
          si fa chi deve firmare i bonifici. Soci e commerciali separati perché
          sono due lavori con due formule (§185), e il cumulato di ciascuno dice
          se è stato erogato o no. */}
      {props.ledger && props.ledger.length > 0 && (
        <CompensiCumulativi rows={props.ledger} month={props.month} since={props.ledgerSince ?? null} />
      )}

      <p className="flex items-start gap-2 text-2xs text-text-tertiary">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        Le macro non sono etichette libere: <strong className="text-text-secondary">Personale</strong> lo scrive
        l&apos;organico (§184) e <strong className="text-text-secondary">Lavori affidati fuori</strong> è già
        stato tolto dal margine del suo progetto (§188) — tenerli dentro un&apos;area del piano farebbe sembrare
        struttura una cosa venduta al cliente. Le{' '}
        <strong className="text-text-secondary">partite di giro</strong> sono fatturato e IVA, non margine di
        nessuno. Le righe si scrivono nel{' '}
        <Link href={`/economics?m=${props.month}`} className="text-gold-text hover:underline">conto economico</Link>:
        qui si leggono e basta.
      </p>
    </div>
  )
}

/**
 * §312 — Il conto del mese: quanto entra, quanto esce, quanto rimane.
 *
 * È la prima domanda del prospetto, e per anni la pagina rispondeva a quella
 * dopo: dove vanno i soldi, in che proporzione. Sono due domande, e la seconda
 * non si può leggere senza la prima — un margine del 42% su un conto che chiude
 * a seicento euro è un numero che non dice niente di utile.
 *
 * **Dentro c'è solo quello che il conto ha visto.** Non è una scelta di
 * presentazione: la sorgente sono i movimenti `banca`, quindi una riga spuntata
 * che nessun estratto conto dimostra non entra qui (§226), e nemmeno una riga
 * attesa. Quello che deve ancora succedere è il piano di cassa, sotto — che è
 * anche il posto dove si può spegnere una voce e vedere cosa cambia.
 *
 * L'apertura è ricostruita dai movimenti precedenti al mese, non è il saldo di
 * oggi: su un mese passato il saldo di oggi non è la sua chiusura, e usarlo
 * darebbe tre numeri che non si sommano fra loro.
 */
function ContoDelMese({ m, month }: {
  m: { opening: number; inflow: number; outflow: number; lastStatement: string | null }
  month: string
}) {
  const closing = Math.round((m.opening + m.inflow - m.outflow) * 100) / 100
  const tone = closing < 0 ? 'text-error' : closing < 2000 ? 'text-warning' : 'text-success'
  return (
    <section className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
      <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
            <Landmark className="w-4 h-4 text-gold-text" aria-hidden="true" />
            Il conto a {monthLabel(month).toLowerCase()}
          </h2>
          <p className="text-2xs text-text-tertiary mt-0.5 max-w-xl leading-relaxed">
            Solo quello che è <strong className="text-text-secondary">passato dal conto</strong>: una
            riga spuntata che l&apos;estratto conto non ha ancora visto non è qui, e nemmeno quello che
            deve ancora succedere. Quello sta nel piano di cassa, sotto.
          </p>
        </div>
        {m.lastStatement && (
          <p className="text-2xs text-text-tertiary shrink-0">
            estratto conto fino al{' '}
            <strong className="text-text-secondary">{m.lastStatement.slice(8)}/{m.lastStatement.slice(5, 7)}</strong>
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-border border-t border-border">
        <div className="px-5 py-4">
          <p className="text-2xs text-text-tertiary">Partiva da</p>
          <p className="text-xl font-bold tabular text-text-secondary leading-tight mt-0.5">{eur(m.opening)}</p>
          <p className="text-2xs text-text-tertiary mt-0.5">sul conto a inizio mese</p>
        </div>
        <div className="px-5 py-4">
          <p className="text-2xs text-text-tertiary flex items-center gap-1">
            <ArrowDownRight className="w-3 h-3 text-success" aria-hidden="true" />Entrato
          </p>
          <p className="text-xl font-bold tabular text-success leading-tight mt-0.5">+{eur(m.inflow)}</p>
          <p className="text-2xs text-text-tertiary mt-0.5">incassi arrivati davvero</p>
        </div>
        <div className="px-5 py-4">
          <p className="text-2xs text-text-tertiary flex items-center gap-1">
            <ArrowUpRight className="w-3 h-3 text-error" aria-hidden="true" />Uscito
          </p>
          <p className="text-xl font-bold tabular text-error leading-tight mt-0.5">−{eur(m.outflow)}</p>
          <p className="text-2xs text-text-tertiary mt-0.5">pagamenti partiti davvero</p>
        </div>
        <div className="px-5 py-4 bg-surface-hover/50">
          <p className="text-2xs text-text-tertiary">Rimane</p>
          <p className={`text-2xl font-bold tabular leading-tight mt-0.5 ${tone}`}>{eur(closing)}</p>
          <p className="text-2xs text-text-tertiary mt-0.5">
            {eur(m.opening)} + {eur(m.inflow)} − {eur(m.outflow)}
          </p>
        </div>
      </div>
    </section>
  )
}

/**
 * §312 — I compensi cumulativi, soci e commerciali.
 *
 * Il conto economico dice quanto spetta **per un mese**; questa tabella dice
 * quanto si deve **in tutto**, che è la domanda di chi firma i bonifici. Senza,
 * una persona pagata per intero e una che non ha mai visto un euro si leggevano
 * uguali — è lo stesso difetto di §226, un mese alla volta.
 *
 * Tre regole:
 *
 *   · **Il maturato si somma su tutti i mesi**, perché un bonifico non sa di che
 *     mese è: confrontarlo con un mese solo darebbe a chiunque uno scoperto o un
 *     anticipo enormi, e nessuno dei due vero (§233).
 *   · **Soci e commerciali stanno separati** perché sono due lavori con due
 *     formule (§185): 30% erogato sul growth e 28% del margine sul digital da un
 *     lato, 15% e 6% dall'altro. Sommarli darebbe un totale che non risponde a
 *     nessuna domanda.
 *   · **Chi è in pari resta in tabella**, con la spunta. Una riga che sparisce
 *     quando è a posto fa sembrare la tabella l'elenco dei problemi, e allora
 *     non si sa più se qualcuno è stato dimenticato.
 */
function CompensiCumulativi({ rows, month, since }: {
  rows: {
    who: string; kind: 'socio' | 'commerciale'; accrued: number; paid: number
    fromAlways?: boolean; never?: boolean
  }[]
  month: string
  since: string | null
}) {
  const gruppi = [
    { kind: 'socio' as const, title: 'Soci', hint: 'erogato sul growth e quota del margine digital' },
    { kind: 'commerciale' as const, title: 'Commerciali', hint: '15% sull\'imponibile growth, 6% sul margine digital' },
  ]
  const resta = rows.reduce((n, r) => n + Math.max(0, r.accrued - r.paid), 0)
  return (
    <section className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1 basis-72">
          <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
            <Banknote className="w-4 h-4 text-gold-text" aria-hidden="true" />
            Compensi, dal primo mese a oggi
          </h2>
          <p className="text-2xs text-text-tertiary mt-0.5 leading-relaxed">
            {since
              ? <>Da <strong className="text-text-secondary">{monthLabel(since).toLowerCase()}</strong>,
                  perché prima i conti sono liquidati (§230) — non su{' '}
                  {monthLabel(month).toLowerCase()}: un bonifico non sa di che mese è.</>
              : <>Su <strong className="text-text-secondary">tutti i mesi</strong>, non su{' '}
                  {monthLabel(month).toLowerCase()}: un bonifico non sa di che mese è.</>}{' '}
            Il maturato è quello che una persona ha prodotto; l&apos;erogato è quello che le è uscito
            dal conto.
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className={`text-xl font-bold tabular leading-tight ${
            resta > 0.5 ? 'text-warning' : 'text-success'}`}>{eur(resta)}</p>
          <p className="text-2xs text-text-tertiary">ancora da erogare</p>
        </div>
      </div>

      {gruppi.map(g => {
        const mie = rows.filter(r => r.kind === g.kind)
        if (!mie.length) return null
        const acc = mie.reduce((n, r) => n + r.accrued, 0)
        const pag = mie.reduce((n, r) => n + r.paid, 0)
        return (
          <div key={g.kind} className="border-b border-border last:border-b-0">
            <div className="px-5 py-2.5 bg-surface-hover/50 flex items-baseline justify-between gap-3">
              <p className="text-2xs font-bold uppercase tracking-wider text-text-secondary">
                {g.title}
                <span className="ml-2 font-normal normal-case tracking-normal text-text-tertiary">{g.hint}</span>
              </p>
              <p className="text-2xs tabular text-text-tertiary shrink-0">
                {eur(pag)} erogati su {eur(acc)}
              </p>
            </div>
            <table className="w-full text-2xs">
              <tbody className="divide-y divide-border/50">
                {mie.map(r => {
                  const open = Math.round((r.accrued - r.paid) * 100) / 100
                  return (
                    <tr key={`${r.kind}|${r.who}`} className="hover:bg-surface-hover">
                      <td className="px-5 py-2 font-semibold text-text-primary">
                        {r.who}
                        {/* §228 — perché il suo numero parte da più lontano degli
                            altri. Senza la frase, la sua riga sembra un errore
                            di calcolo accanto a quelle dei colleghi. */}
                        {r.fromAlways && (
                          <span className="block text-2xs font-normal text-text-tertiary">
                            da sempre: non gli è mai uscito un bonifico
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular text-text-secondary">
                        {eur(r.accrued)}
                        <span className="block text-2xs text-text-tertiary font-normal">maturato</span>
                      </td>
                      <td className="px-3 py-2 text-right tabular text-text-secondary">
                        {r.paid > 0 ? eur(r.paid) : <span className="text-text-tertiary">—</span>}
                        <span className="block text-2xs text-text-tertiary font-normal">erogato</span>
                      </td>
                      {/* Lo stato in parola, non solo in cifra: «mai un bonifico»
                          e «restano cento euro» sono due situazioni che chiedono
                          due azioni diverse, e un numero solo le appiattisce. */}
                      <td className="px-5 py-2 text-right whitespace-nowrap">
                        {open <= 0.5 ? (
                          <span className="inline-flex items-center gap-1 text-success font-semibold">
                            <Check className="w-3 h-3" aria-hidden="true" />erogato
                          </span>
                        ) : r.never ? (
                          <span className="text-error font-bold tabular">
                            {eur(open)}
                            <span className="block font-normal">mai un bonifico</span>
                          </span>
                        ) : (
                          <span className="text-warning font-bold tabular">
                            {eur(open)}
                            <span className="block font-normal text-text-tertiary">da erogare</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      })}

      <p className="px-5 py-2.5 border-t border-border text-2xs text-text-tertiary leading-relaxed">
        Quello che si può bonificare <strong className="text-text-secondary">adesso</strong> è di
        norma meno: si eroga sull&apos;incassato, e una fattura ancora aperta porta con sé il compenso
        che la finanzia (§286). Il numero, persona per persona, sta nel{' '}
        <Link href={`/economics?m=${month}`} className="text-gold-text hover:underline">conto economico</Link>,
        dove si spunta l&apos;erogazione.
      </p>
    </section>
  )
}

/**
 * §240 — Un mese solo: le due letture affiancate.
 *
 * Su più mesi competenza e cassa sono due griglie e si sceglie col selettore
 * (§239). Su **un** mese la domanda cambia: non è come si muove una
 * proporzione, è «cosa questo mese ha prodotto e cosa si è davvero mosso», e
 * quanto manca fra le due. Con un selettore quel «quanto manca» te lo ricordi a
 * mente da una schermata all'altra — che è il modo in cui non lo guarda nessuno.
 *
 * La terza colonna è la differenza, e ha un verso: su un'entrata «manca» è
 * quello che non è stato incassato, su un'uscita è quello che non è stato
 * ancora pagato. Sono due buone notizie opposte, e il colore lo dice.
 */
function SingleMonth({ comp, cassa, col, head }: {
  comp: ReturnType<typeof prospetto>
  cassa: ReturnType<typeof prospetto>
  col: string
  head: string
}) {
  const pair = (
    a: ReturnType<typeof prospetto>['revenue'],
    b: ReturnType<typeof prospetto>['revenue'],
  ) => {
    const keys = Array.from(new Set([...a.map(r => r.key), ...b.map(r => r.key)]))
    return keys.map(k => {
      const ra = a.find(r => r.key === k)
      const rb = b.find(r => r.key === k)
      return {
        key: k, label: (ra ?? rb)!.label, hint: (ra ?? rb)!.hint,
        accrued: ra?.total ?? 0, cash: rb?.total ?? 0,
        /* §310 — il «non ancora mosso» viene dalla lettura di **competenza**: è
           la parte delle righe di questo mese che nessuno ha spuntato. */
        open: ra?.open ?? 0,
      }
    }).filter(r => r.accrued !== 0 || r.cash !== 0)
  }
  const rows = (label: string, items: ReturnType<typeof pair>, tone: 'success' | 'error' | 'accent') => (
    items.map(r => {
      /* §310 — **non è «competenza meno cassa»**. Quelle due colonne parlano di
         mesi diversi: lo stipendio di agosto è competenza di agosto e cassa di
         settembre (§224), quindi la loro differenza sulla riga del Personale
         dava «manca −6.937 €» — un numero che non esiste. Qui c'è quello che
         delle righe **di questo mese** non si è ancora mosso, che è la sola
         risposta possibile a «quanto manca». */
      const miss = r.open
      return (
        <tr key={`${label}-${r.key}`} className="hover:bg-surface-hover">
          <td className="px-5 py-2">
            <span className={`text-2xs font-semibold ${tone === 'accent' ? 'text-accent' : 'text-text-primary'}`}>
              {r.label}
            </span>
            {r.hint && <span className="block text-2xs text-text-tertiary">{r.hint}</span>}
          </td>
          <td className={`${col} text-text-secondary`}>{r.accrued === 0 ? '—' : eur(r.accrued)}</td>
          <td className={`${col} font-semibold text-text-primary`}>{r.cash === 0 ? '—' : eur(r.cash)}</td>
          <td className={`${col} ${miss === 0 ? 'text-text-tertiary'
            : tone === 'success' ? 'text-warning' : 'text-text-secondary'}`}>
            {miss === 0 ? 'tutto mosso' : eur(miss)}
          </td>
        </tr>
      )
    })
  )
  /* §310 — `open` va passato, non dedotto: su un totale la differenza fra le due
     colonne è la stessa somma di mesi diversi che sulle righe non voleva dire
     niente. Dove non ha senso — il margine, quello che resta — la colonna resta
     vuota invece di mostrare un numero che nessuno può controllare. */
  const tot = (label: string, a: number, b: number, open?: number, strong?: boolean) => (
    <tr className={strong ? 'bg-surface-hover border-t border-border' : 'border-t border-border/60'}>
      <td className={`px-5 py-2 text-2xs ${strong ? 'font-bold text-text-primary' : 'font-semibold text-text-secondary'}`}>
        {label}
      </td>
      <td className={`${col} ${strong ? 'font-bold' : 'font-semibold'} ${a < 0 ? 'text-error' : 'text-text-secondary'}`}>{eur(a)}</td>
      <td className={`${col} ${strong ? 'font-bold' : 'font-semibold'} ${b < 0 ? 'text-error' : 'text-text-primary'}`}>{eur(b)}</td>
      <td className={`${col} text-text-tertiary`}>{open == null ? '' : open === 0 ? 'tutto mosso' : eur(open)}</td>
    </tr>
  )
  const sect = (title: string, tone: 'success' | 'error') => (
    <tr>
      <td colSpan={4} className="px-5 pt-3 pb-1">
        <span className={`flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider ${
          tone === 'success' ? 'text-success' : 'text-error'}`}>
          {tone === 'success' ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
          {title}
        </span>
      </td>
    </tr>
  )

  return (
    <div className="overflow-x-auto border-t border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-text-tertiary">
            <th className="text-left text-2xs font-semibold uppercase tracking-wider px-5 py-2">Voce</th>
            <th className={head}>Competenza<span className="block font-normal normal-case tracking-normal">previsto</span></th>
            <th className={head}>Cassa<span className="block font-normal normal-case tracking-normal">spuntato pagato</span></th>
            <th className={head}>Manca<span className="block font-normal normal-case tracking-normal">non ancora mosso</span></th>
          </tr>
        </thead>
        <tbody className="border-t border-border">
          {sect('Entrate', 'success')}
          {rows('e', pair(comp.revenue, cassa.revenue), 'success')}
          {tot('Totale entrate', comp.totals.revenue.total, cassa.totals.revenue.total, comp.totals.revenue.open)}
          {sect('Uscite', 'error')}
          {rows('u', pair(comp.costs, cassa.costs), 'error')}
          {tot('Totale costi', comp.totals.costs.total, cassa.totals.costs.total, comp.totals.costs.open)}
          {rows('p', pair(comp.payouts, cassa.payouts), 'accent')}
          {tot('Totale che esce', comp.totals.costs.total + comp.totals.payouts.total,
            cassa.totals.costs.total + cassa.totals.payouts.total)}
        </tbody>
        <tbody className="border-t-2 border-border-strong">
          {tot('Margine', comp.totals.margin.total, cassa.totals.margin.total)}
          {tot('Resta alla società', comp.totals.left.total, cassa.totals.left.total, undefined, true)}
        </tbody>
      </table>
    </div>
  )
}

function Tile({ label, value, hint, tone, strong }: {
  label: string; value: string; hint: string
  tone?: 'success' | 'error'; strong?: boolean
}) {
  return (
    <div className="px-5 py-3">
      <div className="text-2xs uppercase tracking-wider text-text-tertiary">{label}</div>
      <div className={`text-lg font-bold tabular ${
        tone === 'success' ? 'text-success' : tone === 'error' ? 'text-error'
          : strong ? 'text-text-primary' : 'text-text-secondary'}`}>
        {value}
      </div>
      <div className="text-2xs text-text-tertiary">{hint}</div>
    </div>
  )
}

/** Un blocco della tabella: le sue righe, il suo totale, la sua quota. */
function Block({ title, rows, total, tone, col, extra, extraTotal }: {
  title: string
  rows: ReturnType<typeof prospetto>['revenue']
  total: ReturnType<typeof prospetto>['totals']['revenue']
  tone: 'success' | 'error'
  col: string
  /** §240 — righe che escono dal conto ma non sono righe di conto economico */
  extra?: ReturnType<typeof prospetto>['payouts']
  extraTotal?: ReturnType<typeof prospetto>['totals']['payouts']
}) {
  if (!rows.length && !extra?.length) return null
  const Icon = tone === 'success' ? TrendingUp : TrendingDown
  return (
    <tbody className="border-t border-border">
      <tr>
        <td colSpan={total.cells.length + 3} className="px-5 pt-3 pb-1">
          <span className={`flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider ${
            tone === 'success' ? 'text-success' : 'text-error'}`}>
            <Icon className="w-3.5 h-3.5" aria-hidden="true" />{title}
          </span>
        </td>
      </tr>
      {rows.map(r => (
        <tr key={r.key} className="hover:bg-surface-hover">
          <td className="px-5 py-2">
            <span className="text-2xs font-semibold text-text-primary">{r.label}</span>
            {r.hint && <span className="block text-2xs text-text-tertiary">{r.hint}</span>}
          </td>
          {r.cells.map(c => (
            <td key={c.month} className={`${col} ${c.value === 0 ? 'text-text-tertiary' : 'text-text-secondary'}`}>
              {c.value === 0 ? '—' : eur(c.value)}
            </td>
          ))}
          <td className={`${col} px-5 font-semibold text-text-primary`}>{eur(r.total)}</td>
          {/* la quota è la ragione per cui si guarda una tabella così: 8.899 €
              non dicono niente, «il 42% di quello che esce» sì */}
          <td className={`${col} text-text-tertiary`}>{Math.round(r.share * 100)}%</td>
        </tr>
      ))}
      <tr className="border-t border-border/60">
        <td className="px-5 py-2 text-2xs font-semibold text-text-secondary">{total.label}</td>
        {total.cells.map(c => (
          <td key={c.month} className={`${col} font-semibold text-text-secondary`}>{eur(c.value)}</td>
        ))}
        <td className={`${col} px-5 font-semibold text-text-primary`}>{eur(total.total)}</td>
        <td className={col} />
      </tr>
      {extra?.map(r => (
        <tr key={r.key} className="hover:bg-surface-hover">
          <td className="px-5 py-2">
            <span className="text-2xs font-semibold text-accent">{r.label}</span>
            {r.hint && <span className="block text-2xs text-text-tertiary">{r.hint}</span>}
          </td>
          {r.cells.map(c => (
            <td key={c.month} className={`${col} ${c.value === 0 ? 'text-text-tertiary' : 'text-accent'}`}>
              {c.value === 0 ? '—' : eur(c.value)}
            </td>
          ))}
          <td className={`${col} px-5 font-semibold text-accent`}>{eur(r.total)}</td>
          <td className={`${col} text-text-tertiary`}>{Math.round(r.share * 100)}%</td>
        </tr>
      ))}
      {extraTotal && extra?.length ? (
        <tr className="border-t border-border/60 bg-surface-hover/50">
          <td className="px-5 py-2 text-2xs font-bold text-text-primary">
            Totale che esce
            <span className="block text-2xs font-normal text-text-tertiary">costi e compensi insieme</span>
          </td>
          {total.cells.map((c, k) => (
            <td key={c.month} className={`${col} font-bold text-text-primary`}>
              {eur(c.value + extraTotal.cells[k].value)}
            </td>
          ))}
          <td className={`${col} px-5 font-bold text-text-primary`}>{eur(total.total + extraTotal.total)}</td>
          <td className={col} />
        </tr>
      ) : null}
    </tbody>
  )
}

function BankRow({ label, cells, months, col, hint, tone, strong, last }: {
  label: string
  cells: number[]
  months: string[]
  col: string
  hint: string
  tone: string
  strong?: boolean
  /** il saldo non si somma: è già cumulato, e un totale sarebbe un numero falso */
  last?: boolean
}) {
  return (
    <tr className="border-t border-border/60">
      <td className="px-5 py-2">
        <span className={`text-2xs ${strong ? 'font-semibold text-text-primary' : 'text-text-secondary'}`}>{label}</span>
        <span className="block text-2xs text-text-tertiary">{hint}</span>
      </td>
      {cells.map((v, k) => (
        <td key={months[k]} className={`${col} ${tone} ${strong ? 'font-semibold' : ''}`}>
          {v === 0 ? '—' : eur(v)}
        </td>
      ))}
      <td className={`${col} px-5 ${tone} font-semibold`}>
        {last ? '—' : eur(cells.reduce((a, b) => a + b, 0))}
      </td>
    </tr>
  )
}
