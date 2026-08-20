'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ChevronLeft, ChevronRight, ChevronDown, Plus, Trash2, CopyPlus, Lock, LockOpen,
  TrendingUp, TrendingDown, Wallet, Target, ShieldAlert, Users, Building2, Info,
  Briefcase, AlertTriangle, RotateCcw, Landmark, Receipt, Loader2,
  FileText, BadgeEuro, CheckCircle2, CalendarClock, History, ArrowRightLeft, ListChecks,
  MoreHorizontal, Banknote, X, Link2,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import {
  computeMonth, monthLabel, shiftMonth, pct, ownerOf,
  type PlConfig, type RevenueLine, type CostLine, type Partner, type QuotaRow,
  type PlTotals,
} from '@/lib/pl'
import {
  generateRevenueFromClients, copyCostsFromPreviousMonth, setMonthStatus, resetMonth,
  addRevenueLine, updateRevenueLine, deleteRevenueLine,
  addCostLine, updateCostLine, deleteCostLine, bulkCostAction,
  realignMonthFromContracts,
} from '@/app/actions/pl'
import { DRIFT_LABEL, type ContractDrift } from '@/lib/revenue'
import { setLineCenter, syncBudgetsFromPlan } from '@/app/actions/costs'
import {
  subcontractViews, bySupplierView, byProjectMargin, subcontractFindings, type SubItem,
} from '@/lib/subcontracts'
import { registerPartnerInvoice } from '@/app/actions/bank'
import { linkInvoiceToLine, unlinkInvoiceFromLine } from '@/app/actions/invoices'
import { currentQuarterVat, nextDue, type MonthVat, type VatActual } from '@/lib/vat'
import { openMonth } from '@/app/actions/pl'
import { EconomicsNav } from '@/components/economics/EconomicsNav'
import { materializePayouts, setPayoutPaid, setPayoutDate, setMonthPayoutDate, reconcilePayout } from '@/app/actions/payouts'
import {
  buildWindow, takenIn, marginCostsFor, windowSummary, type PayoutWindow,
} from '@/lib/payout-window'
import { attachMany, detachAll, confirmPayment, undoPayment } from '@/app/actions/reconcile'
import { updateCenter } from '@/app/actions/costs'
import { Draft } from '@/components/economics/fields'
import { PrepareMonth } from '@/components/pl/PrepareMonth'
import { MonthIntake } from '@/components/pl/MonthIntake'
import { monthIntake, applyIntake, intakeOverview } from '@/app/actions/month-intake'
import { diagnose } from '@/lib/pl-health'
import { PlHealth } from './PlHealth'
import { CashRunway } from './CashRunway'
import type { Runway } from '@/lib/cash-runway'
import { CERT_LABEL, certSummary, type Cert, type PayoutView } from '@/lib/cash-certify'
import { canRemove, type Removal } from '@/lib/line-removal'
import {
  fromRevenue, fromCost, collectionIndex, movedIn, openAt, statusOf, lateLabel, carryOf,
  isLate, summarize, dayLabel, TERMS_LABEL, TERMS_WHY,
  type CashLine, type CashStatus, type CashCtx, type Band, type Carry,
} from '@/lib/cash-calendar'

type Props = {
  month: string
  status: 'aperto' | 'chiuso'
  exists: boolean
  /** la 163 non è stata eseguita: senza tabelle nessuna CTA può funzionare */
  setupNeeded: boolean
  previous: { accrued: number; costs: number; exists: boolean }
  missingClients: { id: string; name: string; mrr: number }[]
  knownMonths: { month: string; status: string }[]
  config: PlConfig
  partners: Partner[]
  profiles: { id: string; full_name: string }[]
  revenue: RevenueLine[]
  costs: CostLine[]
  /** aree di spesa: ogni uscita dice da quale budget esce */
  centers: { id: string; name: string }[]
  /** §176: i mesi che verranno, calcolati da contratti, rate e subappalti */
  /** §174: IVA mese per mese dell'anno, per la liquidazione trimestrale */
  vatMonths: MonthVat[]
  /** §242 — i modelli F24 arrivati: dove c'è, vince sulla stima */
  vatActuals?: VatActual[]
  /** oggi calcolato sul server: evita che client e server vedano date diverse */
  today: string
  /** nome del progetto per le righe che vengono da un contratto */
  projectNames: Record<string, string>
  /** nome del cliente: la riga di contratto porta il nome del servizio, non il suo */
  clientNames: Record<string, string>
  /** §192 — progetto → cliente: il subappalto sta sul progetto, il margine è del cliente */
  clientOfProject?: Record<string, string>
  /** §192 — le sorgenti dei subappalti: la voce di piano che vive sul progetto */
  /** §285 — rata → mese: colloca i subappalti che dichiarano quale rata finanziano */
  /** §207 — righe che non dicono più quello che dice il contratto da cui nascono */
  drift?: ContractDrift[]
  /**
   * §224 — le righe di **altri mesi** che riguardano questo: quelle scoperte,
   * che si trascinano fin qui, e quelle il cui movimento è caduto in questo
   * mese (lo stipendio di luglio pagato il 20 agosto). Sono la ragione per cui
   * la cassa di un mese non è fatta solo dalle sue righe.
   */
  carryRevenue?: RevenueLine[]
  carryCosts?: CostLine[]
  /** la 203 non è stata eseguita: le date del movimento non esistono ancora */
  cashSetupNeeded?: boolean
  /** §225 — saldo vero contro quello che il mese deve ancora far uscire */
  runway?: Runway | null
  /**
   * §241 — le uscite **vere** del mese, dai conti (BPM e Vivid). La sezione
   * Uscite elenca quello che il conto economico prevede; questo è quello che
   * dai conti è davvero passato. Un mese poteva avere ogni riga spuntata e
   * uscite reali per il doppio, e non lo diceva nessuno.
   */
  /** §243 — le righe compenso del mese, spuntabili */
  payoutLines?: PayoutLine[]
  /** §254 — i movimenti agganciati a una riga: possono essere più di uno */
  linkedTx?: Record<string, { txId: string; date: string; amount: number; who: string }[]>
  /** §246 — i movimenti che **potrebbero** essere quella riga, da confermare.
      §261 — `free` è quanto ne resta da assegnare: un bonifico cumulativo è
      candidato anche dopo aver pagato la riga sorella, ma solo per il residuo */
  matchOptions?: Record<string, {
    txId: string; date: string; amount: number; who: string; why: string; free?: number
  }[]>
  /** §247 — quali righe hanno una fattura sotto: le altre vanno segnalate */
  /**
   * §302 — il documento sotto ogni riga: numero, data, importo, controparte.
   * Prima era un booleano, e un booleano non si può mostrare — poteva solo
   * accendere un avviso. La fattura si collega **dalla riga**, sempre, non solo
   * quando si spunta «pagato».
   */
  invoiceOf?: Record<string, { id: string; number: string; date: string; total: number; who: string }>
  /** §259/§261 — le fatture candidate, con quanta capienza è ancora libera:
      un documento può coprire più righe, e va scelto sapendo quanto ne resta */
  invoiceOptions?: Record<string, {
    id: string; number: string; date: string; total: number; who: string
    righe?: number; left?: number
  }[]>
  /** §260 — i bonifici ai soci, candidati per la conferma di un compenso */
  payoutOptions?: { txId: string; date: string; amount: number; who: string; why: string }[]
  /** §286 — la data in cui si eroga quello che è maturato in questo mese */
  payoutDate?: string | null
  /** §286 — quella del mese prima: apre la finestra, e ne esclude il contenuto */
  prevPayoutDate?: string | null
  /** senza le tabelle di banca la tenuta di cassa non ha un saldo da cui partire */
  bankReady?: boolean
  /** §226 — cosa dice l'estratto conto di ogni spunta, riga per riga */
  certs?: Record<string, Cert>
  /** §226 — compensi maturati contro quelli davvero usciti dal conto */
  payouts?: PayoutView[]
}

const eur = (n: number) => formatCurrency(Math.round(n))
/** Con i centesimi: su una riga di costo 2.672,22 non è 2.672 */
const eur2 = (n: number) =>
  Number.isInteger(n) ? formatCurrency(n)
    : `${n.toLocaleString('it-IT', {
        minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true,
      })} €`
const pc = (n: number) => `${(n * 100).toFixed(n * 100 % 1 === 0 ? 0 : 1)}%`
/** Due decimali dove servono: il 9,33% di una quota divisa non si arrotonda a 9%. */
const pc1 = (n: number) => `${(n * 100).toFixed(2).replace(/\.00$/, '').replace('.', ',')}%`

/** «13 agosto»: una data che si legge in mezzo a una frase, non «2026-08-13». */
const MESI_IT = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']
const giornoBreve = (iso: string) => {
  const [, m, d] = iso.split('-').map(Number)
  return `${d} ${MESI_IT[(m ?? 1) - 1]}`
}

export function PlClient({
  month, status, exists, setupNeeded, previous, missingClients,
  knownMonths, config, partners, profiles, revenue, costs, centers, vatMonths, today,
  projectNames, clientNames, clientOfProject = {}, drift = [],
  carryRevenue = [], carryCosts = [], cashSetupNeeded = false,
  runway = null, bankReady = false, certs = {}, payouts = [], vatActuals = [],
  payoutLines = [], linkedTx = {}, matchOptions = {}, invoiceOf = {}, invoiceOptions = {},
  payoutOptions = [], payoutDate = null, prevPayoutDate = null,
}: Props) {
  const router = useRouter()
  /* Quale compenso è aperto: un numero che non si può aprire si prende per fede,
     e un piano compensi preso per fede è un piano che nessuno controlla. */
  const [openQuota, setOpenQuota] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const [resetting, setResetting] = useState(false)
  const [more, setMore] = useState(false)
  /* §259 — la riga su cui si sta confermando un pagamento. Una sola alla volta:
     un dialogo che si apre due volte è un dialogo che scrive due date. */
  const [paying, setPaying] = useState<
    { id: string; label: string; gross: number; kind: 'ricavo' | 'costo' } | null>(null)
  /* §260 — le caselle dei compensi scrivevano il booleano senza passare dal
     dialogo: la data la metteva il trigger e il bonifico non lo chiedeva
     nessuno. Un compenso non ha una riga di costo — si ricalcola — quindi ha
     bisogno del suo elenco di candidati: i `finanziamento` in uscita. */
  const [payingPayout, setPayingPayout] = useState<
    { id: string; label: string; gross: number } | null>(null)
  const locked = status === 'chiuso'
  const empty = revenue.length === 0 && costs.length === 0

  const t = useMemo(() => computeMonth(revenue, costs, config, partners), [revenue, costs, config, partners])

  /* §224 — il calendario della cassa. Il contesto serve ai subappalti, che si
     pagano quando ha pagato il cliente: senza, ogni lavorazione affidata fuori
     scadrebbe a fine mese e risulterebbe in ritardo per colpa di un cliente
     lento. Si costruisce su **tutte** le entrate, comprese quelle di altri mesi. */
  const allRevenue = useMemo(() => [...revenue, ...carryRevenue], [revenue, carryRevenue])
  const allCosts = useMemo(() => [...costs, ...carryCosts], [costs, carryCosts])
  const cashCtx: CashCtx = useMemo(
    () => ({ collection: collectionIndex(allRevenue.map(l => fromRevenue(l, month))) }),
    [allRevenue, month])

  /* Le righe come le vede il calendario. Restano appaiate a quelle vere per id:
     il motore del piano compensi vuole le righe intere, il calendario solo le
     date, e tenerli separati evita di far viaggiare due volte gli stessi campi. */
  const revCash = useMemo(() => allRevenue.map(l => fromRevenue(l, month)), [allRevenue, month])
  const costCash = useMemo(() => allCosts.map(c => fromCost(c, month)), [allCosts, month])
  const statusOfRev = useMemo(() => new Map(revCash.map(l => [l.id, statusOf(l, today, cashCtx)])), [revCash, today, cashCtx])
  const statusOfCost = useMemo(() => new Map(costCash.map(l => [l.id, statusOf(l, today, cashCtx)])), [costCash, today, cashCtx])

  /* §224 — la cassa del mese sono i **movimenti** del mese, di qualunque
     competenza: lo stipendio di luglio pagato il 20 agosto è cassa di agosto, e
     la fattura di giugno incassata adesso è cassa di adesso. Prima si guardava
     la sola spunta sulle righe del mese, e agosto non vedeva un euro di quello
     che stava davvero pagando. Il motore è lo stesso: cambia solo cosa gli si dà. */
  const moved = useMemo(() => ({
    r: new Set(movedIn(revCash, month, today, cashCtx).map(l => l.id)),
    c: new Set(movedIn(costCash, month, today, cashCtx).map(l => l.id)),
  }), [revCash, costCash, month, today, cashCtx])

  /* §232 — il margine digital si calcola sui subappalti **di competenza** delle
     righe che si stanno contando, non su quelli pagati nel mese. Filtrare tutte
     e due le gambe rompeva l'accoppiamento fra rata e fornitore e faceva
     risultare l'erogato di cassa **più alto** di quello di competenza: due
     subappalti su quattro non erano ancora usciti, quindi il margine saliva e
     la quota del 28% con lui. La cassa è un sottoinsieme della competenza, e
     ora si comporta come tale. */
  const tCash = useMemo(() => {
    const revIn = allRevenue.filter(l => moved.r.has(l.id))
    const mesi = new Set(revIn.map(l => l.month ?? month))
    const marginCosts = allCosts.filter(c => c.project_id && mesi.has(c.month ?? month))
    return computeMonth(revIn, allCosts.filter(c => moved.c.has(c.id)), config, partners, marginCosts)
  }, [allRevenue, allCosts, moved, config, partners, month])

  /* Quello che non si è mosso non sparisce: si trascina. Sono le righe di mesi
     precedenti ancora scoperte, più quelle maturate prima che scadono adesso —
     lo stipendio di luglio, che in agosto non è in ritardo, è atteso. */
  const carryOpen = useMemo(() => {
    const rev = new Map(carryRevenue.map(l => [l.id, l]))
    const cst = new Map(carryCosts.map(c => [c.id, c]))
    return {
      revenue: openAt(revCash, month, today, cashCtx)
        .map(l => ({ cash: l, src: rev.get(l.id) })).filter(x => !!x.src) as { cash: CashLine; src: RevenueLine }[],
      costs: openAt(costCash, month, today, cashCtx)
        .map(l => ({ cash: l, src: cst.get(l.id) })).filter(x => !!x.src) as { cash: CashLine; src: CostLine }[],
    }
  }, [revCash, costCash, carryRevenue, carryCosts, month, today, cashCtx])

  /* §210 — la lettura è una scelta della **pagina**, non di un riquadro.
     Il selettore stava dentro «Ripartizione»: cambiava sette numeri su quaranta,
     e i quattro in cima — quelli che si guardano per primi — restavano sul
     maturato. Due letture della stessa sezione che non concordano sono peggio di
     una sola: chi legge non sa quale delle due sta guardando.

     Adesso `basis` governa tutto ciò che è un **totale**, e `tv` è l'unico
     oggetto da cui i riquadri leggono. Le righe di entrata e uscita restano
     quelle che sono — sono i fatti, e sono anche il posto dove si spunta. */
  const [basis, setBasis] = useState<'maturato' | 'incassato'>('maturato')
  const cash = basis === 'incassato'
  const tv = cash ? tCash : t

  /* Cosa entra e cosa esce passando da una lettura all'altra. Il selettore lo
     dichiara **prima** che uno prema: senza, il numero più basso sembra il
     numero vero, e nessuno sa che il costo del lavoro di questo mese uscirà il
     mese prossimo. */
  const flow = useMemo(() => {
    const s = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0))
    const inRev = carryRevenue.filter(l => moved.r.has(l.id))
    const inCost = carryCosts.filter(c => moved.c.has(c.id))
    const outRev = revenue.filter(l => !moved.r.has(l.id))
    const outCost = costs.filter(c => !moved.c.has(c.id))
    return {
      inRev: { n: inRev.length, e: s(inRev.map(l => l.amount_net)) },
      inCost: { n: inCost.length, e: s(inCost.map(c => c.actual)) },
      outRev: { n: outRev.length, e: s(outRev.map(l => l.amount_net)) },
      outCost: { n: outCost.length, e: s(outCost.map(c => c.actual)) },
      ownRev: revenue.length, ownCost: costs.length,
    }
  }, [revenue, costs, carryRevenue, carryCosts, moved])

  /* §226 — quanto di quello che questo mese dichiara pagato lo dimostra la
     banca. È il numero che dice se la pagina sta raccontando fatti o spunte. */
  const certOfMonth = useMemo(() => {
    const own = [...revenue.map(r => r.id), ...costs.map(c => c.id)]
      .map(id => certs[id]).filter(Boolean) as Cert[]
    return certSummary(own)
  }, [revenue, costs, certs])

  const lateRev = useMemo(() => summarize(revCash.filter(l => statusOfRev.get(l.id) && isLate(statusOfRev.get(l.id)!)), today, cashCtx), [revCash, statusOfRev, today, cashCtx])
  const lateCost = useMemo(() => summarize(costCash.filter(l => statusOfCost.get(l.id) && isLate(statusOfCost.get(l.id)!)), today, cashCtx), [costCash, statusOfCost, today, cashCtx])

  /* Gli arretrati veri e propri: maturati **prima** di questo mese e oltre la
     scadenza. Non è il non incassato del mese, che finché è nei termini è la
     normalità: qui il termine è passato. */
  const arrears = useMemo(
    () => summarize([...carryOpen.revenue.map(x => x.cash), ...carryOpen.costs.map(x => x.cash)], today, cashCtx),
    [carryOpen, today, cashCtx])

  /* Le righe trascinate, pronte da mostrare. Il nome del cliente e quello del
     progetto vanno ricomposti qui: la riga di un contratto si chiama col
     servizio — «Canone growth — lead generation» — e senza il cliente accanto
     un arretrato non si può nemmeno andare a chiedere. */
  /** il booleano che serviva prima, derivato: `invoiceOf` è l'unica fonte */
  const withInvoice = useMemo(
    () => Object.fromEntries(Object.keys(invoiceOf).map(k => [k, true])) as Record<string, boolean>,
    [invoiceOf])

  /** §303 — i movimenti del mese da spiegare, quando il dialogo è aperto */
  const [intakeData, setIntakeData] = useState<Awaited<ReturnType<typeof monthIntake>> | null>(null)
  const [intakeMonths, setIntakeMonths] = useState<Awaited<ReturnType<typeof intakeOverview>>>([])
  /** il mese che il dialogo sta guardando: può non essere quello della pagina */
  const [intakeMonth, setIntakeMonth] = useState(month)

  const statusOfMonth = useMemo(
    () => new Map(knownMonths.map(m => [m.month.slice(0, 10), m.status])), [knownMonths])

  const carryItems = useMemo(() => {
    const revItem = (src: RevenueLine, m: string): CarryItem => ({
      id: src.id,
      status: statusOfRev.get(src.id) ?? statusOf(fromRevenue(src, m), today, cashCtx),
      title: src.client_id ? (clientNames[src.client_id] ?? src.label) : src.label,
      sub: src.client_id ? src.label : '',
      amount: src.amount_net,
      month: m,
      href: src.project_id ? `/progetti/${src.project_id}` : undefined,
      carry: carryOf(fromRevenue(src, m)),
      /* §294 — una riga trascinata da luglio si toglie solo se **luglio** è
         aperto: è il suo mese quello che la contiene, non quello guardato. */
      remove: canRemove({
        side: 'entrata', paid: src.paid, paid_on: src.paid_on,
        invoiced: !!withInvoice[src.id], invoice_sent: src.invoice_sent,
        installment_id: src.installment_id,
      }, statusOfMonth.get(m) !== 'chiuso'),
    })
    const costItem = (src: CostLine, m: string): CarryItem => ({
      id: src.id,
      status: statusOfCost.get(src.id) ?? statusOf(fromCost(src, m), today, cashCtx),
      title: src.label,
      sub: src.project_id
        ? `${src.category} · ${projectNames[src.project_id] ?? 'progetto'}`
        : src.category,
      amount: src.actual > 0 ? src.actual : src.budget,
      month: m,
      href: src.project_id ? `/progetti/${src.project_id}` : undefined,
      carry: carryOf(fromCost(src, m)),
      remove: canRemove({
        side: 'uscita', paid: src.paid, paid_on: src.paid_on,
        invoiced: !!withInvoice[src.id], installment_id: src.installment_id,
      }, statusOfMonth.get(m) !== 'chiuso'),
    })
    return {
      revenue: carryOpen.revenue.map(({ cash: c, src }) => revItem(src, c.month)),
      costs: carryOpen.costs.map(({ cash: c, src }) => costItem(src, c.month)),
      // le righe di altri mesi che in questo mese si sono davvero mosse
      movedRevenue: carryRevenue.filter(l => moved.r.has(l.id)).map(l => revItem(l, l.month ?? month)),
      movedCosts: carryCosts.filter(c => moved.c.has(c.id)).map(c => costItem(c, c.month ?? month)),
    }
  }, [carryOpen, carryRevenue, carryCosts, moved, month, statusOfRev, statusOfCost, clientNames, projectNames, today, cashCtx, withInvoice, statusOfMonth])

  /* §286 — **la finestra dell'erogazione**: la base dei compensi non è né il
     maturato né la cassa del mese, è quello che è stato fatturato in questo
     mese ed è **rientrato entro il giorno in cui si eroga**. Le due letture di
     §210 restano quelle della pagina — «com'è andato il mese» — ma la domanda
     «quanto bonifico» ha una risposta sola e non dipende da un selettore.

     Le righe si prendono da `allRevenue`, che comprende gli altri mesi: una
     fattura di questo mese incassata il 3 del prossimo sta nel mese e nella
     finestra, ed è esattamente quella per cui si sta pagando. */
  const payoutWin = useMemo(() => buildWindow({
    month, date: payoutDate, previousDate: prevPayoutDate,
    day: config.payout_day, settledFrom: config.settled_from,
  }), [month, payoutDate, prevPayoutDate, config.payout_day, config.settled_from])

  const tPayout = useMemo(() => {
    const lines = allRevenue.map(l => ({ ...l, month: l.month ?? month }))
    const presi = takenIn(lines, payoutWin)
    const mesi = new Set(presi.map(l => l.month))
    const withMonth = allCosts.map(c => ({ ...c, month: c.month ?? month }))
    /* §232 — i subappalti restano quelli **di competenza** delle righe prese, e
       §285 il denominatore è il ricavo intero di quei mesi: filtrare una gamba
       sola distribuirebbe una quota su un ricavo già di qualcun altro. */
    const marginCosts = marginCostsFor(withMonth, mesi, month)
    return computeMonth(presi, marginCosts, config, partners, marginCosts,
      lines.filter(l => mesi.has(l.month)))
  }, [allRevenue, allCosts, payoutWin, config, partners, month])

  const payoutSummary = useMemo(
    () => windowSummary(allRevenue.map(l => ({ ...l, month: l.month ?? month })), payoutWin),
    [allRevenue, payoutWin, month])

  /* Un commerciale il cui cliente non ha ancora pagato deve restare in elenco a
     zero, non sparire: sparendo sembrerebbe che non gli spetti niente, che è
     un'altra cosa. La lista viene dal maturato, l'importo dalla finestra. */
  const owners = useMemo(() => {
    const now = new Map(tPayout.salesByOwner.map(s => [s.label, s]))
    return t.salesByOwner.map(s => ({
      label: s.label,
      fromRegistry: s.fromRegistry,
      amount: now.get(s.label)?.amount ?? 0,
      rows: now.get(s.label)?.rows ?? [],
      accrued: s.amount,
    }))
  }, [t, tPayout])

  /* §229 — una persona, una riga. `payouts` viene dal server e conosce la
     storia (maturato dalla linea, bonifici veri); `tv.perPartner` e `owners`
     conoscono il **mese**. Si uniscono per chiave, così la stessa persona non
     compare più in tre pannelli con tre numeri che nessuno sommava. */
  const compensi = useMemo(() => {
    const byPartner = new Map(tPayout.perPartner.map(p => [p.partner.id, p]))
    const byOwner = new Map(owners.map(o => [o.label, o]))
    if (payouts.length) {
      return payouts.map(pv => {
        const p = pv.partnerId ? byPartner.get(pv.partnerId) : undefined
        const o = byOwner.get(pv.who)
        return {
          key: pv.key, who: pv.who, pv,
          partner: p ?? null, owner: o ?? null,
          monthTotal: r2c((p?.total ?? 0) + (o?.amount ?? 0)),
          quotaRows: [...(p?.rows ?? []), ...(o?.rows ?? [])],
        }
      })
    }
    /* Senza banca non c'è storia: restano le quote del mese, che è esattamente
       quello che la pagina sapeva dire prima. */
    const solo = tPayout.perPartner.map(p => ({
      key: p.partner.id, who: p.partner.label, pv: null,
      partner: p, owner: byOwner.get(p.partner.label) ?? null,
      monthTotal: r2c(p.total + (byOwner.get(p.partner.label)?.amount ?? 0)),
      quotaRows: p.rows,
    }))
    const soli = new Set(solo.map(x => x.who))
    return [...solo, ...owners.filter(o => !soli.has(o.label)).map(o => ({
      key: `o:${o.label}`, who: o.label, pv: null,
      partner: null, owner: o, monthTotal: o.amount, quotaRows: o.rows,
    }))]
  }, [payouts, tPayout, owners])

  /* La provvigione dei clienti senza commerciale non è di nessuno: resta una
     riga a sé, o sembrerebbe spettare a qualcuno in particolare. */
  const poolRow = tPayout.plan.salesPool > 0
    ? { amount: tPayout.plan.salesPool, share: tPayout.plan.poolShare, rows: tPayout.plan.poolRows }
    : null

  const run = (fn: () => Promise<unknown>, ok?: string) => start(async () => {
    try { await fn(); if (ok) toast.success(ok); router.refresh() }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
  })

  const go = (delta: number) => router.push(`/economics?m=${shiftMonth(month, delta)}`)

  const delta = (now: number, before: number) => {
    if (!previous.exists || before === 0) return undefined
    const d = (now - before) / before
    return { text: `${d >= 0 ? '+' : ''}${(d * 100).toFixed(0)}% sul mese scorso`, up: d >= 0 }
  }
  const missingTotal = missingClients.reduce((s, c) => s + c.mrr, 0)

  /* §238 — due domande diverse, e la pagina ne dava una risposta sola col
     titolo dell'altra.
     «Quanto sta maturando il trimestre di questo mese» e «quanto esce alla
     prossima scadenza» possono essere due trimestri diversi: ad agosto sono il
     3º (9.250 €, 16 novembre) e il 2º (8.400 €, 20 agosto). La Tenuta di cassa
     toglie il **secondo** — è quello che passa dal conto — e il riquadro qui
     sotto mostrava il primo con lo stesso titolo. Due numeri diversi sotto la
     stessa parola, a mezzo schermo di distanza, e non si crede più a nessuno
     dei due. Adesso ci sono tutti e due, dichiarati, e quello aperto per primo
     è la scadenza: è la domanda di cassa, la stessa che fa la sezione sopra. */
  const vatNext = useMemo(() => nextDue(vatMonths, today, vatActuals), [vatMonths, today, vatActuals])
  const vatCurrent = useMemo(() => currentQuarterVat(vatMonths, month.slice(0, 10), vatActuals), [vatMonths, month, vatActuals])
  const vatSame = !vatNext || !vatCurrent
    || (vatNext.quarter.year === vatCurrent.quarter.year && vatNext.quarter.q === vatCurrent.quarter.q)
  const [vatView, setVatView] = useState<'scadenza' | 'corso'>('scadenza')
  const vat = (vatView === 'corso' ? vatCurrent : vatNext) ?? vatNext ?? vatCurrent

  const findings = useMemo(
    () => diagnose(t, revenue, costs, config, previous.exists ? previous : undefined,
      vatNext ?? vatCurrent, arrears),
    [t, revenue, costs, config, previous, vatNext, vatCurrent, arrears])

  // selezione multipla sulle uscite: correggerne trenta a una a una è il motivo
  // per cui i consuntivi non si compilano
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const toggle = (id: string) => setPicked(p => {
    const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n
  })
  const allPicked = costs.length > 0 && picked.size === costs.length
  /* Gli id si passano espliciti e non si leggono da `picked`: `setPicked` è
     asincrono, e un pulsante che seleziona e agisce nello stesso click agirebbe
     sulla selezione di prima. */
  const bulk = (action: 'paid' | 'unpaid' | 'align' | 'zero' | 'delete', ok: string, ids?: string[]) =>
    run(() => bulkCostAction(ids ?? Array.from(picked), action).then(() => setPicked(new Set())), ok)


  // incidenza costi: sotto target è efficienza, sopra è erosione di margine
  const overTarget = tv.costs.variance < 0

  /* §237 — la barra in cima: dove sono le cose, e cosa resta da fare. Le voci
     si costruiscono da quello che la pagina ha già in mano — nessuna query in
     più, e nessun numero che possa divergere da quello della sua sezione. */
  const zeroActual = useMemo(
    () => costs.filter(c => c.actual === 0 && c.budget > 0 && !c.paid).length, [costs])

  const navItems = useMemo(() => {
    const out: { id: string; label: string; value: string; tone?: 'error' | 'warning' }[] = []
    /* L'ordine è quello della pagina, non quello dell'importanza: una barra che
       elenca in un ordine e una pagina che scorre in un altro fa cercare due
       volte la stessa cosa. */
    if (runway && bankReady) {
      out.push({ id: 'cassa', label: 'Cassa', value: eur(runway.floor),
        tone: runway.floor < 0 ? 'error' : undefined })
    }
    const vd = vatNext ?? vatCurrent
    if (vd) {
      out.push({ id: 'iva', label: 'IVA', value: vd.toPay > 0 ? eur(vd.toPay) : '—',
        tone: vd.toPay > 0 && vd.daysLeft <= 15 ? 'warning' : undefined })
    }
    /* «Cassa TwoBee» è quello che resta alla società: il residuo del growth più
       la quota del digital. È il numero che la Ripartizione mette in fondo, e
       quello che si va a cercare per primo. */
    const twobee = tv.plan.residual + tv.plan.digitalCompany
    out.push({ id: 'ripartizione', label: 'Cassa TwoBee', value: eur(twobee),
      tone: twobee < 0 ? 'error' : undefined })
    if (compensi.length) {
      out.push({ id: 'compensi', label: 'Compensi',
        value: eur(compensi.reduce((n, c) => n + c.monthTotal, 0)) })
    }
    out.push({ id: 'entrate', label: 'Entrate', value: eur(tv.revenue.accrued) })
    out.push({ id: 'uscite', label: 'Uscite', value: eur(tv.costs.actual),
      tone: overTarget ? 'warning' : undefined })
    return out
  }, [runway, bankReady, tv, overTarget, compensi, t, vatNext, vatCurrent])

  const todo = useMemo(() => {
    const out: { label: string; to: string; tone: 'error' | 'warning' | 'info' }[] = []
    if (locked) return out
    if (missingClients.length) {
      out.push({ to: 'entrate', tone: 'info',
        label: `${missingClients.length} client${missingClients.length > 1 ? 'i' : 'e'} fatturerebbe${missingClients.length > 1 ? 'ro' : ''} e non ${missingClients.length > 1 ? 'sono' : 'è'} nel mese — ${eur(missingTotal)}` })
    }
    if (drift.length) {
      out.push({ to: 'entrate', tone: 'warning',
        label: `${drift.length} rig${drift.length === 1 ? 'a' : 'he'} non dicono più quello che dice il contratto: la percentuale al commerciale è sbagliata` })
    }
    if (arrears.count > 0) {
      out.push({ to: 'entrate', tone: 'error',
        label: `${arrears.count} scadenz${arrears.count === 1 ? 'a' : 'e'} arretrate per ${eur(arrears.amount)}, la più vecchia da ${arrears.oldest} giorni` })
    }
    /* §247 — pagate e senza documento: è IVA che non si detrae e un costo che
       in verifica non si difende. Va in cima come le altre cose da fare, o si
       scopre a dichiarazione. */
    const senzaDoc = costs.filter(c => c.paid && !withInvoice[c.id])
    if (senzaDoc.length > 0) {
      out.push({ to: 'uscite', tone: 'warning',
        label: `${senzaDoc.length} usc${senzaDoc.length === 1 ? 'ita pagata' : 'ite pagate'} senza fattura`
          + ` per ${eur(senzaDoc.reduce((n, c) => n + (c.actual > 0 ? c.actual : c.budget), 0))}`
          + ' — l\'IVA non si detrae finché il documento non c\'è' })
    }
    if (zeroActual > 0) {
      out.push({ to: 'uscite', tone: 'warning',
        label: `${zeroActual} usc${zeroActual === 1 ? 'ita' : 'ite'} con l'effettivo a zero e il preventivato pieno: nessuno le ha guardate` })
    }
    if (certOfMonth.dichiarate > 0) {
      out.push({ to: 'entrate', tone: 'warning',
        label: `${certOfMonth.dichiarate} spunt${certOfMonth.dichiarate === 1 ? 'a' : 'e'} che nessun movimento di banca conferma` })
    }
    if (runway && runway.payoutsOpen > 0.5) {
      out.push({ to: 'compensi', tone: 'info',
        label: `${eur(runway.payoutsOpen)} di compensi maturati e non ancora erogati` })
    }
    return out
  }, [locked, missingClients, missingTotal, drift, arrears, zeroActual, certOfMonth, runway, costs, withInvoice])

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5">
      <EconomicsNav active="conto" month={month} />

      {/* ── testata: mese e stato ── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <button onClick={() => go(-1)} aria-label="Mese precedente"
              className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-hover press">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <h1 className="text-2xl sm:text-3xl font-bold text-text-primary font-heading">{monthLabel(month)}</h1>
            <button onClick={() => go(1)} aria-label="Mese successivo"
              className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-hover press">
              <ChevronRight className="w-4 h-4" />
            </button>
            <span className={`text-2xs font-semibold px-2 py-0.5 rounded-full border ${
              locked ? 'bg-surface-active border-border-strong text-text-secondary' : 'bg-success-dim border-success/40 text-success'
            }`}>{locked ? 'chiuso' : 'aperto'}</span>
          </div>
          <p className="text-sm text-text-secondary mt-1">
            Conto economico · <span className="tabular font-semibold text-text-primary">{revenue.length}</span> voci di ricavo ·{' '}
            <span className="tabular font-semibold text-text-primary">{costs.length}</span> di costo
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* da qui si passa alla lettura aggregata di più mesi */}
          <div className="flex bg-surface border border-border rounded-xl p-0.5">
            {[1, 3, 6, 12].map(n => (
              <button key={n} onClick={() => router.push(`/economics?m=${month}&n=${n}`)} aria-pressed={n === 1}
                className={`px-2.5 py-1.5 rounded-lg text-2xs font-semibold whitespace-nowrap ${
                  n === 1 ? 'bg-gold text-on-gold' : 'text-text-secondary hover:text-text-primary'
                }`}>{n === 1 ? 'Mese' : `${n} mesi`}</button>
            ))}
          </div>
          {/* §237 — le due azioni rare stavano in testata accanto a quelle di
              tutti i giorni, e «Svuota mese» era grande come «Chiudi mese».
              Quattro pulsanti che competono per l'attenzione sono quattro
              pulsanti che si leggono tutti, ogni volta. Qui sotto un menu: la
              conferma a due passi resta, ed è dentro. */}
          {!locked && (revenue.length > 0 || costs.length > 0 || previous.exists) && (
            <div className="relative">
              <button onClick={() => setMore(o => !o)} aria-expanded={more} aria-label="Altre azioni sul mese"
                className="flex items-center justify-center w-9 h-9 rounded-xl border border-border text-text-secondary hover:text-text-primary hover:bg-surface-hover press">
                <MoreHorizontal className="w-4 h-4" />
              </button>
              {more && (
                <div className="absolute right-0 top-full mt-2 w-72 rounded-2xl bg-surface border border-border-strong shadow-pop p-1.5 z-30">
                  <button onClick={() => { setMore(false); run(() => copyCostsFromPreviousMonth(month), 'Costi copiati dal mese precedente') }}
                    disabled={pending}
                    className="w-full flex items-start gap-2.5 px-2.5 py-2 rounded-xl text-left hover:bg-surface-hover press disabled:opacity-40">
                    <CopyPlus className="w-3.5 h-3.5 text-text-tertiary shrink-0 mt-0.5" />
                    <span className="min-w-0">
                      <span className="block text-2xs font-semibold text-text-primary">Copia i costi dal mese scorso</span>
                      <span className="block text-2xs text-text-tertiary">
                        Serve solo per le voci che il piano non copre: quelle a piano le porta «Prepara il mese».
                      </span>
                    </span>
                  </button>
                  {(revenue.length > 0 || costs.length > 0) && (
                    resetting ? (
                      <div className="px-2.5 py-2 rounded-xl bg-error-dim border border-error/40">
                        <p className="text-2xs font-semibold text-text-primary">
                          Cancello {revenue.length} entrate e {costs.length} uscite?
                        </p>
                        <p className="text-2xs text-text-secondary mt-0.5">
                          Il mese resta, vuoto. Le righe scritte a mano non tornano indietro.
                        </p>
                        <div className="flex items-center gap-3 mt-2">
                          <button onClick={() => { setResetting(false); setMore(false); run(() => resetMonth(month), 'Mese svuotato') }}
                            disabled={pending} className="text-2xs font-bold text-error hover:opacity-80">Svuota</button>
                          <button onClick={() => setResetting(false)}
                            className="text-2xs font-semibold text-text-secondary hover:text-text-primary">Annulla</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setResetting(true)} disabled={pending}
                        className="w-full flex items-start gap-2.5 px-2.5 py-2 rounded-xl text-left hover:bg-surface-hover press disabled:opacity-40">
                        <RotateCcw className="w-3.5 h-3.5 text-error shrink-0 mt-0.5" />
                        <span className="min-w-0">
                          <span className="block text-2xs font-semibold text-error">Svuota il mese</span>
                          <span className="block text-2xs text-text-tertiary">
                            Cancella tutte le voci e lo rigenera da capo. Chiede conferma.
                          </span>
                        </span>
                      </button>
                    )
                  )}
                </div>
              )}
            </div>
          )}
          <button onClick={() => run(() => setMonthStatus(month, locked ? 'aperto' : 'chiuso'), locked ? 'Mese riaperto' : 'Mese chiuso')}
            disabled={pending}
            className="flex items-center gap-1.5 text-2xs font-semibold border border-border rounded-xl px-3 py-2 text-text-secondary hover:text-text-primary hover:bg-surface-hover press disabled:opacity-40">
            {locked ? <LockOpen className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
            {locked ? 'Riapri' : 'Chiudi mese'}
          </button>
        </div>
      </div>

      {!setupNeeded && !empty && <PlNav items={navItems} todo={todo} />}

      {/* ── senza tabelle nessun pulsante può funzionare: dirlo, non fallire ── */}
      {setupNeeded && (
        <div className="rounded-2xl border border-warning/40 bg-warning-dim p-4">
          <div className="flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 text-warning shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-text-primary">Migration da eseguire</p>
              <p className="text-2xs text-text-secondary mt-1">
                Le tabelle del conto economico non esistono ancora: finché non esegui{' '}
                <code className="px-1 py-0.5 rounded bg-surface border border-border">supabase/migrations/163_profit_loss.sql</code>{' '}
                nel SQL Editor di Supabase, i pulsanti di questa pagina non hanno dove scrivere.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── da dove nasce il mese: quattro sorgenti, contate prima di scrivere ── */}
      {!setupNeeded && !locked && <PrepareMonth month={month} compact={!empty} />}

      {/* §303 — i movimenti che il mese non spiega. Sta qui e non in Banca perché
          la domanda è del conto economico: un'uscita che nessuna riga contiene è
          un margine più alto del vero. */}
      {!setupNeeded && !locked && (
        <div>
          <button onClick={() => start(async () => {
            try {
              const [r, o] = await Promise.all([monthIntake(month), intakeOverview()])
              setIntakeMonths(o)
              if (!r.rows.length) {
                /* §307 — «tutto a posto qui» non è tutta la risposta: se un altro
                   mese ha movimenti scoperti va detto adesso, o quel lavoro
                   resta invisibile finché qualcuno non cambia mese per caso. */
                const altrove = o.filter(x => x.month !== month && x.movimenti > 0)
                toast.success(altrove.length
                  ? `Questo mese è a posto · ${altrove.reduce((n, x) => n + x.movimenti, 0)} da guardare in `
                    + altrove.map(x => monthLabel(x.month).split(' ')[0].toLowerCase()).join(', ')
                  : 'Ogni movimento ha già la sua riga')
                return
              }
              setIntakeData(r)
            } catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
          })} disabled={pending}
            className="inline-flex items-center gap-1.5 text-2xs font-semibold text-gold-text hover:underline disabled:opacity-40">
            <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
            Guarda i movimenti del mese
          </button>
        </div>
      )}

      {/* ── scostamento fra anagrafica di oggi e mese ── */}
      {!setupNeeded && !empty && !locked && missingClients.length > 0 && (
        <div className="rounded-2xl border border-info/40 bg-info-dim p-4 flex items-start gap-2.5 flex-wrap">
          <Info className="w-4 h-4 text-info shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-text-primary">
              {missingClients.length} client{missingClients.length > 1 ? 'i' : 'e'} non {missingClients.length > 1 ? 'sono' : 'è'} in questo mese
            </p>
            <p className="text-2xs text-text-secondary mt-0.5 truncate">
              {missingClients.slice(0, 4).map(c => c.name).join(' · ')}
              {missingClients.length > 4 && ` e altri ${missingClients.length - 4}`} — {eur(missingTotal)} di imponibile
            </p>
          </div>
          <button onClick={() => run(() => generateRevenueFromClients(month), 'Clienti aggiunti')} disabled={pending}
            className="text-2xs font-semibold border border-info/50 text-info rounded-xl px-3 py-2 hover:bg-surface press disabled:opacity-40">
            Aggiungili
          </button>
        </div>
      )}

      {/* ── senza le date del movimento la cassa è ancora quella di prima ── */}
      {cashSetupNeeded && !setupNeeded && (
        <div className="rounded-2xl border border-warning/40 bg-warning-dim p-4 flex items-start gap-2.5">
          <CalendarClock className="w-4 h-4 text-warning shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-text-primary">Le date dei pagamenti non ci sono ancora</p>
            <p className="text-2xs text-text-secondary mt-1">
              Esegui{' '}
              <code className="px-1 py-0.5 rounded bg-surface border border-border">supabase/migrations/203_cash_calendar.sql</code>{' '}
              e ogni riga saprà <strong>quando</strong> i soldi si muovono, non solo se si sono mossi.
              Finché non lo fai la lettura di cassa resta quella di prima — le sole righe spuntate
              di questo mese — e i ritardi si contano dalla scadenza teorica.
            </p>
          </div>
        </div>
      )}

      {/* ── su cosa si sta leggendo tutta la sezione ── */}
      <BasisSwitch basis={basis} onChange={setBasis} t={t} tCash={tCash} flow={flow} />

      {/* ── §229 · due numeri, non sei ─────────────────────────────────────
          Il selettore mostrava già competenza e cassa in grande, e subito sotto
          i primi due riquadri li ripetevano identici: sei scatole per quattro
          informazioni. Restano i due numeri che il selettore **non** dice —
          margine e incidenza — e la lettura scelta li governa entrambi. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Kpi icon={<Wallet className="w-4 h-4 text-gold-text" />}
          label={cash ? 'Margine di cassa' : 'Margine lordo'} value={eur(tv.margin.gross)}
          hint={tv.revenue.accrued > 0
            ? `${pc(tv.margin.gross / tv.revenue.accrued)} sulle entrate · ${eur(tv.costs.actual)} di costi`
            : '—'} />
        <Kpi icon={<Target className={`w-4 h-4 ${overTarget ? 'text-error' : 'text-success'}`} />}
          label="Incidenza costi" value={pc(tv.costs.ratio)}
          hint={(tv.costs.variance < 0
            ? `${eur(-tv.costs.variance)} sopra il target del ${pc(config.cost_target_pct)}`
            : `${eur(tv.costs.variance)} sotto il target del ${pc(config.cost_target_pct)}`)
            + (tv.costs.external > 0 ? ` · ${eur(tv.costs.external)} di subappalti fuori dal target` : '')}
          tone={tv.costs.variance < 0 ? 'error' : 'success'} />
      </div>

      {!setupNeeded && !empty && <PlHealth findings={findings} />}

      {/* ── §225 · il margine che hai appena letto contro i soldi che ci sono ── */}
      <div id="cassa" className="scroll-mt-16">
        {runway && <CashRunway runway={runway} bankReady={bankReady} month={month} />}
      </div>

      {/* ── IVA: quella che incassi non è tua ── */}
      {vat && (
        <section id="iva" className={`scroll-mt-16 bg-surface border rounded-2xl p-5 shadow-soft ${
          vat.daysLeft <= 15 && vat.toPay > 0 ? 'border-warning/50' : 'border-border'
        }`}>
          <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-sm font-bold text-text-primary">
                <Landmark className="w-4 h-4 text-info" />IVA
              </h2>
              <p className="text-2xs text-text-tertiary mt-0.5">
                {vat.label} · liquidazione trimestrale
                {vat.annual && ' — si chiude con la dichiarazione annuale'}
              </p>
              {/* §238 — quando la scadenza da pagare e il trimestre in corso non
                  sono lo stesso, si vedono tutti e due: la Tenuta di cassa toglie
                  la scadenza, e questo riquadro deve dire lo stesso numero. */}
              {!vatSame && vatNext && vatCurrent && (
                <div className="flex items-center gap-1 mt-2 bg-surface-active rounded-xl p-0.5 w-fit">
                  <button type="button" onClick={() => setVatView('scadenza')} aria-pressed={vatView === 'scadenza'}
                    className={`px-2.5 py-1 rounded-lg text-2xs font-semibold whitespace-nowrap ${
                      vatView === 'scadenza' ? 'bg-surface text-text-primary shadow-soft' : 'text-text-secondary'}`}>
                    Da versare · {vatNext.label}
                  </button>
                  <button type="button" onClick={() => setVatView('corso')} aria-pressed={vatView === 'corso'}
                    className={`px-2.5 py-1 rounded-lg text-2xs font-semibold whitespace-nowrap ${
                      vatView === 'corso' ? 'bg-surface text-text-primary shadow-soft' : 'text-text-secondary'}`}>
                    In maturazione · {vatCurrent.label}
                  </button>
                </div>
              )}
            </div>
            <div className="text-right">
              <div className={`text-xl font-bold tabular ${vat.toPay > 0 ? 'text-text-primary' : 'text-success'}`}>
                {vat.toPay > 0 ? eur(vat.toPay) : vat.deferred ? 'sotto il minimo' : vat.balance < 0 ? 'a credito' : 'niente da versare'}
              </div>
              <div className={`text-2xs font-semibold ${
                vat.daysLeft < 0 ? 'text-error' : vat.daysLeft <= 15 ? 'text-warning' : 'text-text-tertiary'
              }`}>
                {vat.daysLeft < 0
                  ? `scaduta da ${-vat.daysLeft} giorni`
                  : `entro il ${new Date(vat.deadline + 'T00:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })} · fra ${vat.daysLeft} giorni`}
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <VatCell label="IVA sulle vendite" value={eur(vat.debit)} hint="incassata dai clienti" />
            <VatCell label="IVA sugli acquisti" value={eur(vat.credit)} hint="pagata ai fornitori, si scomputa" />
            <VatCell
              label={vat.carried !== 0 ? (vat.carried > 0 ? 'Credito riportato' : 'Debito rinviato') : 'Saldo del trimestre'}
              value={eur(vat.carried !== 0 ? Math.abs(vat.carried) : Math.abs(vat.balance))}
              hint={vat.carried > 0 ? 'dal trimestre precedente, si scomputa'
                : vat.carried < 0 ? 'dal trimestre precedente, era sotto il minimo'
                : vat.balance < 0 ? 'a credito, va sul prossimo' : 'debito verso lo Stato'} />
            <VatCell label="Interessi 1%" value={vat.interest > 0 ? eur(vat.interest) : '—'}
              hint={vat.annual ? 'non dovuti sul quarto trimestre' : 'costo dell\'opzione trimestrale'} />
          </div>

          {vat.deferred && (
            <p className="flex items-start gap-2 text-2xs text-text-secondary mt-3 pt-3 border-t border-border">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-info" />
              Il saldo è sotto i 25,82 €: il versamento non si fa e l&apos;importo confluisce nel trimestre
              successivo. Non è una scadenza da segnare.
            </p>
          )}

          {/* §229 — che quei soldi non siano tuoi lo dice già la tenuta di cassa,
              due riquadri più su. Qui resta il dettaglio del trimestre, che è
              l'unica cosa che quella non ha: come si compone il numero. */}
          {vat.toPay > 0 && (
            <p className="flex items-start gap-2 text-2xs text-text-tertiary mt-3 pt-3 border-t border-border">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {!vatSame && vatNext && vatCurrent ? (
                <span>
                  Sono due trimestri diversi e due domande diverse: dal conto escono i{' '}
                  <strong className="text-text-secondary">{eur(vatNext.toPay)}</strong> del {vatNext.label}
                  {' '}il {new Date(vatNext.deadline + 'T00:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })},
                  ed è quello che la <strong className="text-text-secondary">Tenuta di cassa</strong> toglie in cima;
                  il {vatCurrent.label} sta ancora maturando e si versa dopo. Date ordinarie:
                  verifica eventuali proroghe col commercialista.
                </span>
              ) : (
                <span>Date ordinarie: verifica eventuali proroghe col commercialista.</span>
              )}
            </p>
          )}
        </section>
      )}

      {/* ── dove vanno i soldi ── */}
      <div id="ripartizione" className="scroll-mt-16">
        <Distribution t={t} tCash={tCash} config={config} mode={basis} />
      </div>

      {/* ── §229 · compensi: una persona, una riga ──────────────────────────
          Erano tre pannelli — «Compensi soci», «Provvigioni commerciali» e
          «Uscito davvero» — e la stessa persona compariva in tutti e tre con tre
          numeri diversi: la quota del mese, la provvigione del mese, e quello
          che gli è arrivato. Per sapere se Walter era in pari bisognava
          scorrere mezza pagina e sommare a mente. Adesso è una riga sola con
          quattro numeri in fila, e il dettaglio si apre da lì. */}
      <div id="compensi" className="scroll-mt-16">
      <CompensiSection
        rows={compensi} pool={poolRow} config={config} cash={cash}
        win={payoutWin} summary={payoutSummary} dateSet={!!payoutDate}
        onDate={d => run(() => setMonthPayoutDate(month, d), 'Data dell\'erogazione aggiornata')}
        month={month} clientNames={clientNames} projectNames={projectNames}
        open={openQuota} setOpen={setOpenQuota}
        since={runway?.payoutsSince ?? null} bankReady={bankReady}
        lines={payoutLines} pending={pending} locked={locked}
        onPaid={(id, paid, label, amount) => paid
          ? setPayingPayout({ id, label, gross: amount })
          : run(() => setPayoutPaid(id, false, month), 'Spunta tolta')}
        onPaidMany={ids => run(async () => {
          for (const id of ids) await setPayoutPaid(id, true, month)
        }, `${ids.length} compensi segnati pagati`)}
        onMaterialize={() => run(async () => {
          const r = await materializePayouts(month)
          toast.success(`${r.righe} compensi pronti da spuntare · ${eur(r.totale)}`)
        })} />
      </div>

      {/* ── entrate ── */}
      <section id="entrate" className="scroll-mt-16 bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border flex-wrap">
          <h2 className="text-sm font-bold text-text-primary">Entrate</h2>
          <span className="text-2xs text-text-tertiary tabular">
            imponibile {eur(t.revenue.accrued)} · IVA {eur(t.revenue.vat)} · totale {eur(t.revenue.grossWithVat)}
            {t.plan.passThrough > 0 && (
              <span className="text-info"> · di cui {eur(t.plan.passThrough)} partite di giro</span>
            )}
            {lateRev.count > 0 && (
              <span className="text-error"> · {eur(lateRev.amount)} in ritardo</span>
            )}
            {certOfMonth.dichiarate > 0 && (
              <span className="text-text-tertiary"> · {certOfMonth.dichiarate} spuntate senza riscontro in banca</span>
            )}
            {certOfMonth.consolidate > 0 && (
              <span className="text-text-tertiary"> · mese consolidato</span>
            )}
          </span>
        </div>

        {/* §207 — la riga si è copiata il contratto quando il mese è stato
            preparato: se l'accordo è cambiato dopo, qui resta la versione
            vecchia. Il tipo di lavoro decide il 15% o il 6% di provvigione,
            quindi una riga rimasta indietro paga la percentuale di un altro
            mestiere e nessun numero lo dice da solo. */}
        {!locked && drift.length > 0 && (
          <div className="mx-5 mt-4 rounded-xl border border-warning/40 bg-warning/10 p-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-2xs font-bold text-warning">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  {drift.length === 1
                    ? 'Una riga non dice più quello che dice il suo contratto'
                    : `${drift.length} righe non dicono più quello che dicono i loro contratti`}
                </p>
                <ul className="mt-1.5 space-y-0.5">
                  {drift.map(d => (
                    <li key={d.lineId} className="text-2xs text-text-secondary truncate">
                      <span className="font-semibold text-text-primary">{d.label}</span>
                      {' — '}{d.fields.map(f => DRIFT_LABEL[f]).join(', ')}
                      {d.patch.kind && (
                        <span className="text-warning">
                          {' '}· la provvigione è al {pc(pct.sales(config, d.patch.kind === 'digital' ? 'growth' : 'digital'))}
                          {' '}invece che al {pc(pct.sales(config, d.patch.kind))}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
              <button onClick={() => run(() => realignMonthFromContracts(month), 'Righe riallineate ai contratti')}
                disabled={pending}
                className="text-2xs font-semibold px-3 py-1.5 rounded-lg bg-gold text-on-gold press disabled:opacity-40 shrink-0">
                Allinea ai contratti
              </button>
            </div>
            <p className="text-2xs text-text-tertiary mt-2">
              Importi e spunte non si toccano: si riallineano tipo, progetto, IVA e partita di giro,
              che sono decisioni dell&apos;accordo e non fatti del mese.
            </p>
          </div>
        )}

        {revenue.length === 0 ? (
          <div className="p-5"><Empty>
            Nessuna entrata. «Prepara il mese» porta qui i canoni e le rate dei contratti che cadono adesso.
          </Empty></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-2xs text-text-tertiary uppercase tracking-wider">
                  <th className="text-left font-semibold px-4 py-2">Cliente e progetto</th>
                  <th className="text-right font-semibold px-2 py-2">Piano</th>
                  <th className="text-right font-semibold px-2 py-2">Imponibile</th>
                  <th className="text-left font-semibold px-2 py-2">Tipo</th>
                  <th className="text-left font-semibold px-2 py-2">Commerciale</th>
                  <th className="text-center font-semibold px-2 py-2">Fatt.</th>
                  <th className="text-center font-semibold px-2 py-2">Pag.</th>
                  <th className="text-right font-semibold px-2 py-2">Comm.</th>
                  <th className="text-right font-semibold px-2 py-2">Ai soci</th>
                  <th className="text-center font-semibold px-2 py-2">Rischio</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {t.lines.map(({ line, s }) => {
                  const cs = statusOfRev.get(line.id)
                  return (
                  <tr key={line.id}
                    className={`border-t border-border/60 hover:bg-surface-hover ${
                      cs && isLate(cs) ? BAND_TONE[cs.band].row : ''}`}>
                    <td className="px-4 py-1.5">
                      <div className="flex items-baseline gap-2">
                        <Text value={line.label} disabled={locked}
                          onSave={v => run(() => updateRevenueLine(line.id, { label: v }))} />
                        {/* §224 — quando è attesa, e di quanto è in ritardo. Sta
                            accanto al nome perché è lì che l'occhio scorre: tre
                            ritardi in dodici righe si vedono senza cercarli. */}
                        {cs && (
                          <CashPill s={cs} disabled={locked}
                            onDue={d => run(() => updateRevenueLine(line.id, { due_date: d }))} />
                        )}
                        {/* §226 — chi lo dice che è pagata: l'estratto conto o
                            chi ha spuntato. Sono due cose diverse e per mesi si
                            sono lette identiche. */}
                        <CertMark c={certs[line.id]} />
                      </div>
                      <Origin line={line} projectNames={projectNames} clientNames={clientNames} />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <Num value={line.plan_amount} disabled={locked || line.origin === 'contratto'}
                        money={line.origin === 'contratto'}
                        onSave={v => run(() => updateRevenueLine(line.id, { plan_amount: v }))} />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {/* §194 — l'importo di una riga da contratto lo scrive il contratto.
                          Cambiarlo qui creerebbe un secondo numero per la stessa rata, e
                          da quel momento nessuno dei due sarebbe affidabile: si corregge
                          nell'economics del cliente, che è la sezione madre. */}
                      <Num value={line.amount_net} disabled={locked || line.origin === 'contratto'}
                        strong money={line.origin === 'contratto'}
                        onSave={v => run(() => updateRevenueLine(line.id, { amount_net: v }))} />
                      {/* §188 — anticipo che torna al cliente: si vede sulla riga,
                          perché è la ragione per cui su questo importo non c'è
                          nessuna quota. Si accende e si spegne da qui. */}
                      <button onClick={() => run(() => updateRevenueLine(line.id, { pass_through: !line.pass_through }))}
                        disabled={locked} aria-pressed={!!line.pass_through}
                        title={line.pass_through
                          ? 'Partita di giro: fatturata e con IVA, esclusa dalle quote del piano compensi'
                          : 'Segna come partita di giro (budget ads anticipato per il cliente)'}
                        className={`block ml-auto mt-0.5 text-2xs font-semibold px-1.5 py-0.5 rounded border press disabled:opacity-40 ${
                          line.pass_through
                            ? 'border-info/40 bg-info/15 text-info'
                            : 'border-transparent text-text-tertiary hover:border-border'}`}>
                        {line.pass_through ? 'partita di giro' : 'giro?'}
                      </button>
                    </td>
                    <td className="px-2 py-1.5">
                      {/* §207 — growth o digital non è un fatto del mese: è il
                          lavoro che si è venduto, e decide il 15% o il 6% di
                          provvigione. Su una riga da contratto lo dice il
                          contratto, altrimenti si finisce con due risposte alla
                          stessa domanda e nessun modo di sapere quale vale. */}
                      {line.origin === 'contratto' ? (
                        <Kind kind={line.kind} clientId={line.client_id} config={config} />
                      ) : (
                        <select value={line.kind} disabled={locked} aria-label="Tipologia"
                          onChange={e => run(() => updateRevenueLine(line.id, { kind: e.target.value as 'growth' | 'digital' }))}
                          className="bg-background border border-border rounded-lg px-1.5 py-1 text-2xs text-text-secondary">
                          <option value="growth">Growth</option>
                          <option value="digital">Digital</option>
                        </select>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      {/* §185 — chi ha portato il cliente. La riga vince, ma se è
                          vuota si legge il nome dell'anagrafica invece di un
                          trattino: spesso è un segnalatore che nel tool non c'è.
                          Se non c'è nemmeno lì, il 6% si divide fra i soci.
                          §196 — in sola lettura: si cambia in anagrafica, che è
                          l'unico posto dove il commerciale di un cliente esiste. */}
                      <Owner line={line} clientNames={clientNames} />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <Check on={line.invoice_sent} disabled={locked} label="Fattura inviata"
                          onToggle={() => run(() => updateRevenueLine(line.id, { invoice_sent: !line.invoice_sent }))} />
                        {/* §302 — la spunta dice «l'ho emessa», il documento dice
                            **quale**. Si collegava solo dentro il dialogo del
                            pagamento, quindi su una riga già incassata non c'era
                            strada — e senza il documento sotto la spunta è una
                            dichiarazione come le altre (§226). */}
                        {(invoiceOf[line.id] || (invoiceOptions[line.id] ?? []).length > 0) && (
                          <InvoiceCell inv={invoiceOf[line.id]} disabled={locked}
                            options={invoiceOptions[line.id] ?? []}
                            gross={Math.round(line.amount_net * (1 + line.vat_rate) * 100) / 100}
                            onLink={invId => run(() => linkInvoiceToLine(invId, line.id, 'ricavo'), 'Fattura collegata')}
                            onUnlink={() => run(() => unlinkInvoiceFromLine(line.id, 'ricavo'), 'Fattura scollegata')} />
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <Check on={line.paid} disabled={locked} label="Incassato"
                          onToggle={() => line.paid
                            ? run(() => undoPayment(line.id, 'ricavo'), 'Spunta tolta e movimenti sganciati')
                            : setPaying({ id: line.id, label: line.label, kind: 'ricavo',
                                gross: Math.round(line.amount_net * (1 + line.vat_rate) * 100) / 100 })} />
                        {/* §246 — la prova, accanto alla spunta: una spunta senza
                            movimento è un'opinione, e finché le due cose stavano
                            in due pagine diverse si leggevano identiche. */}
                        <MatchCell lineId={line.id} side="entrata" disabled={locked}
                          linked={linkedTx[line.id] ?? []} options={matchOptions[line.id] ?? []}
                          gross={Math.round(line.amount_net * (1 + line.vat_rate) * 100) / 100}
                          onAttach={ids => run(async () => {
                            const r = await attachMany(line.id, 'ricavo', ids)
                            toast[r.pagata ? 'success' : 'info'](
                              r.pagata ? `Riga incassata: ${eur(r.coperto)}`
                                : `${r.agganciati} agganciati · ${eur(r.coperto)} su ${eur(r.lordo)}`)
                          })}
                          onDetach={() => run(() => detachAll(line.id, 'ricavo'), 'Movimenti sganciati')} />
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-right text-2xs text-info tabular">
                      {eur(s.sales)}
                      {/* §186: sul digital la base è il margine, non l'imponibile.
                          Se un subappalto ha mangiato metà del ricavo va detto
                          qui, dove si guarda la quota. */}
                      {s.external > 0 && (
                        <span className="block text-2xs text-text-tertiary" title={`Subappalto ${eur(s.external)}: la spartizione parte dal margine`}>
                          su {eur(s.margin)}
                        </span>
                      )}
                      {/* §208 — quello che la rata non ha assorbito. Il margine si
                          ferma a zero, ma il costo è uscito: senza questo numero
                          il mese torna e il progetto no. */}
                      {s.excess > 0 && (
                        <span className="block text-2xs text-warning font-semibold"
                          title="Il subappalto di questo mese supera la rata: questa parte non ha ridotto nessuna quota">
                          +{eur(s.excess)} oltre la rata
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right text-2xs text-accent tabular">
                      {line.kind === 'digital'
                        ? (s.partnerQuota > 0 ? (
                            <>
                              {eur(s.partnerQuota)}
                              <span className="block text-2xs text-text-tertiary">a socio</span>
                            </>
                          ) : '—')
                        : (s.delivery ? eur(s.delivery) : '—')}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      {/* La scelta sul fondo rischio è dell'admin, e solo sopra
                          soglia: sotto i 20.000 € non compare nemmeno. */}
                      {s.riskEligible ? (
                        <button onClick={() => run(() => updateRevenueLine(line.id, { risk_fund: !line.risk_fund }))}
                          disabled={locked}
                          aria-pressed={!!line.risk_fund}
                          title={line.risk_fund
                            ? `Fondo rischio attivo: ${pc(config.digital_risk_fund_pct)} del margine, ${pc(config.digital_risk_cut_pct)} in meno a ciascun socio`
                            : `Progetto da ${eur(line.project_value ?? 0)}: puoi destinare ${pc(config.digital_risk_fund_pct)} al fondo rischio`}
                          className={`text-2xs font-semibold px-1.5 py-0.5 rounded border whitespace-nowrap press disabled:opacity-40 ${
                            line.risk_fund
                              ? 'border-orange/40 bg-orange/15 text-orange'
                              : 'border-border text-text-tertiary hover:text-text-secondary'}`}>
                          {line.risk_fund ? `fondo ${pc(config.digital_risk_fund_pct)}` : 'fondo?'}
                        </button>
                      ) : null}
                    </td>
                    <td className="px-2 py-1.5">
                      {/* §294 — spento con la ragione accanto, non nascosto: un
                          controllo che sparisce è un mistero, uno spento insegna
                          la regola. La barriera vera è nell'azione. */}
                      <RemoveButton
                        check={canRemove({
                          side: 'entrata', paid: line.paid, paid_on: line.paid_on,
                          invoiced: !!withInvoice[line.id], invoice_sent: line.invoice_sent,
                          installment_id: line.installment_id,
                        }, !locked)}
                        label={line.label}
                        onRemove={() => run(() => deleteRevenueLine(line.id), 'Voce eliminata')} />
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* §224 — quello che è maturato prima e non si è ancora incassato. Sta
            qui e non in un riquadro altrove: è dove si spunta. */}
        <CarryBlock side="entrata" items={carryItems.revenue}
          moved={carryItems.movedRevenue} showMoved={cash}
          onPaid={id => run(() => updateRevenueLine(id, { paid: true }), 'Incasso registrato oggi')}
          onDue={(id, d) => run(() => updateRevenueLine(id, { due_date: d }))}
          onRemove={id => run(() => deleteRevenueLine(id), 'Voce eliminata')} />

        {!locked && (
          <div className="px-4 py-3 border-t border-border">
            <button onClick={() => run(() => addRevenueLine(month), 'Voce aggiunta')} disabled={pending}
              className="flex items-center gap-1.5 text-2xs font-semibold text-gold-text hover:opacity-80">
              <Plus className="w-3.5 h-3.5" />Voce di ricavo
            </button>
          </div>
        )}
      </section>

      {/* ── uscite ── */}
      <div id="uscite" className="scroll-mt-16 space-y-5">
      <CostSection
        costs={costs} centers={centers} locked={locked} pending={pending}
        picked={picked} setPicked={setPicked} totals={t.costs}
        statusOf={id => statusOfCost.get(id)} late={lateCost} certOf={id => certs[id]}
        carry={carryItems.costs} carryMoved={carryItems.movedCosts} showMoved={cash}
        onPaidCarry={id => run(() => updateCostLine(id, { paid: true }), 'Pagamento registrato oggi')}
        onDue={(id, d) => run(() => updateCostLine(id, { due_date: d }))}
        onUpdate={(id, patch) => run(() => updateCostLine(id, patch))}
        onCenter={(id, v) => run(() => setLineCenter(id, v))}
        onDelete={(id, label) => run(() => deleteCostLine(id), `«${label}» eliminata`)}
        onAdd={() => run(() => addCostLine(month), 'Voce aggiunta')}
        onBulk={bulk}
        linkedTx={linkedTx} matchOptions={matchOptions} withInvoice={withInvoice}
        invoiceOf={invoiceOf} invoiceOptions={invoiceOptions}
        onLinkInvoice={(id, invId) => run(() => linkInvoiceToLine(invId, id, 'costo'), 'Fattura collegata')}
        onUnlinkInvoice={id => run(() => unlinkInvoiceFromLine(id, 'costo'), 'Fattura scollegata')}
        onAttach={(id, ids) => run(async () => {
          const r = await attachMany(id, 'costo', ids)
          toast[r.pagata ? 'success' : 'info'](
            r.pagata ? `Riga pagata: ${eur(r.coperto)}`
              : `${r.agganciati} agganciati · ${eur(r.coperto)} su ${eur(r.lordo)}`)
        })}
        onDetach={id => run(() => detachAll(id, 'costo'), 'Movimenti sganciati')}
        onPayToggle={(id, label, gross, paid) => paid
          ? run(() => undoPayment(id, 'costo'), 'Spunta tolta e movimenti sganciati')
          : setPaying({ id, label, gross, kind: 'costo' })}
        onRenameCenter={(id, name) => run(() => updateCenter(id, { name }), 'Area rinominata')}
        onSyncPlan={() => run(async () => {
          const r = await syncBudgetsFromPlan(month)
          if (!r.righe) { toast.info('I preventivati sono già quelli del piano'); return }
          toast.success(
            `${r.righe} preventivati riallineati · ${r.variazione > 0 ? '+' : '−'}${eur(Math.abs(r.variazione))}`,
            { description: r.cambi.slice(0, 4).map(c => `${c.label}: ${eur(c.da)} → ${eur(c.a)}`).join(' · ') })
        })} />

      </div>

      {/* ── previsionale: quello che è già deciso ── */}
      <p className="flex items-start gap-2 text-2xs text-text-tertiary">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        Le percentuali si applicano all&apos;imponibile. In <strong className="text-text-secondary">competenza</strong> il
        compenso matura sul lavoro consegnato — un pagamento in ritardo non azzera quello che spetta a chi
        ha già lavorato — e in <strong className="text-text-secondary">cassa</strong> si legge quanto ne è
        davvero coperto dal denaro passato dal conto. Sono due domande, e il selettore in cima dice a
        quale si sta rispondendo.
        Il {pc(config.cost_target_pct)} è un target: se i costi reali sono più bassi le quote non cambiano,
        la differenza resta in cassa TwoBee.
        {knownMonths.length > 0 && ` · Mesi registrati: ${knownMonths.length}`}
        {!exists && ' · Questo mese non è ancora stato creato: la prima modifica lo crea.'}
      </p>

      {intakeData && (
        <MonthIntake rows={intakeData.rows} summary={intakeData.summary} month={intakeMonth} pending={pending}
          months={intakeMonths}
          onMonth={m => start(async () => {
            try {
              const r = await monthIntake(m)
              setIntakeMonth(m)
              setIntakeData(r)
            } catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
          })}
          onClose={() => { setIntakeData(null); setIntakeMonth(month) }}
          onApply={d => start(async () => {
            try {
              const r = await applyIntake(intakeMonth, d)
              toast.success(
                [r.accorpati && `${r.accorpati} accorpati`, r.corretti && `${r.corretti} corretti`,
                 r.creati && `${r.creati} righe nuove`, r.ignorati && `${r.ignorati} ignorati`]
                  .filter(Boolean).join(' · ')
                + (r.totale ? ` · ${eur2(r.totale)}` : ''))
              /* Quello che non è andato si dice: una lista che si interrompe a metà
                 lascia lo schermo che dice una cosa e il database un'altra. */
              if (r.falliti.length) toast.error(`${r.falliti.length} non applicati: ${r.falliti[0].why}`)
              setIntakeData(null)
              router.refresh()
            } catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
          })} />
      )}

      {/* §259/§260 — il dialogo era scritto e non era montato: la casella
          scriveva lo stato e la conferma non compariva mai, quindi data,
          movimento e fattura restavano le tre domande che nessuno faceva. */}
      {paying && (
        <PayDialog
          line={paying} kind={paying.kind}
          candidates={matchOptions[paying.id] ?? []}
          invoices={invoiceOptions[paying.id] ?? []}
          onClose={() => setPaying(null)}
          onConfirm={v => {
            const p = paying
            setPaying(null)
            run(async () => {
              const r = await confirmPayment({
                lineId: p.id, kind: p.kind, paidOn: v.paidOn, txIds: v.txIds, invoiceId: v.invoiceId,
              })
              const verbo = p.kind === 'ricavo' ? 'Incassata' : 'Pagata'
              toast.success(!v.txIds.length
                ? `${verbo} · nessun movimento: resta dichiarata`
                : `${verbo} · ${eur(r.coperto)} su ${eur(r.lordo)} agganciati`
                  + (r.saltati ? ` · ${r.saltati} già spesi altrove` : ''))
            })
          }} />
      )}

      {/* Un compenso non ha una riga di costo — si ricalcola (§227) — quindi i
          candidati sono i `finanziamento` in uscita, non i movimenti di una riga. */}
      {payingPayout && (
        <PayDialog
          line={payingPayout} kind="costo"
          candidates={payoutOptions} invoices={[]}
          onClose={() => setPayingPayout(null)}
          onConfirm={v => {
            const p = payingPayout
            setPayingPayout(null)
            run(async () => {
              await setPayoutDate(p.id, v.paidOn, month)
              for (const tx of v.txIds) await reconcilePayout(tx, p.id)
            }, 'Compenso segnato pagato')
          }} />
      )}
    </div>
  )
}


/**
 * §241 — Quello che dai conti è uscito davvero, in questo mese.
 *
 * La sezione Uscite elenca quello che il conto economico **prevede**: righe,
 * preventivato, effettivo, spunte. Non diceva quanto è passato dai conti — e
 * sono due domande, perché un mese può avere ogni riga spuntata e uscite reali
 * per il doppio. Qui i due conti stanno insieme e separati: **BPM** è dove
 * passano stipendi, fornitori e imposte, **Vivid** è la carta delle spese
 * ricorrenti, e sommarli senza distinguerli nasconde quale dei due sta
 * scappando.
 *
 * Il confronto è **al lordo**: dal conto passa il totale della fattura, non
 * l'imponibile. E conta solo `banca` (§189): un `derivato` nasce dalla spunta
 * che questo riquadro serve a verificare.
 */
/**
 * §246 — La riconciliazione dove si guarda la riga.
 *
 * In Banca si parte dal **movimento**: giusto quando si carica l'estratto conto.
 * Quando si chiude il mese la domanda è l'opposta — «questa fattura chi me l'ha
 * pagata?» — e attraversare due pagine per rispondere significa non rispondere:
 * su luglio erano 61 movimenti e **zero** agganciati.
 *
 * Tre stati, e si distinguono a colpo d'occhio:
 *
 *   · **agganciato** — il movimento c'è: data e importo, in verde. È l'unica
 *     spunta che vale come prova (§226).
 *   · **candidati** — uno o più movimenti liberi che potrebbero essere questa
 *     riga: importo esatto, importo vicino, stesso nome. Un clic conferma.
 *     L'aggancio **non è mai automatico**: un abbinamento sbagliato dichiara
 *     incassata una fattura che nessuno ha pagato, ed è l'errore che poi nessuno
 *     va a cercare.
 *   · **niente** — nessun movimento le somiglia. Non è un errore da nascondere:
 *     è il caso in cui manca la fattura, o il pagamento è di un altro mese, e
 *     va visto.
 */
function MatchCell({ lineId, side, linked, options, gross, onAttach, onDetach, disabled }: {
  lineId: string
  side: 'entrata' | 'uscita'
  /** i movimenti già agganciati a questa riga: possono essere più di uno */
  linked: { txId: string; date: string; amount: number; who: string }[]
  options: { txId: string; date: string; amount: number; who: string; why: string }[]
  /** il lordo da coprire: è il metro con cui si legge la selezione */
  gross: number
  onAttach: (txIds: string[]) => void
  onDetach: () => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())

  const coperto = linked.reduce((n, l) => n + Math.abs(l.amount), 0)
  const scelto = options.filter(o => picked.has(o.txId)).reduce((n, o) => n + Math.abs(o.amount), 0)
  const dopo = Math.round((coperto + scelto) * 100) / 100
  const resta = Math.round((gross - dopo) * 100) / 100

  if (linked.length && !open) {
    const chiusa = coperto >= gross - 0.01
    return (
      <button type="button" onClick={() => !disabled && setOpen(true)} disabled={disabled}
        title={[
          ...linked.map(l => `${dayLabel(l.date)} · ${eur2(Math.abs(l.amount))} · ${l.who}`),
          chiusa ? 'Copre la riga per intero' : `Coperta per ${eur2(coperto)} su ${eur2(gross)}`,
        ].join('\n')}
        className={`inline-flex items-center gap-1 max-w-full text-2xs font-semibold rounded-lg px-1.5 py-0.5
                    press disabled:opacity-60 border ${
          chiusa ? 'border-success/40 bg-success-dim text-success'
                 : 'border-warning/40 bg-warning-dim text-warning'}`}>
        <Banknote className="w-3 h-3 shrink-0" aria-hidden="true" />
        <span className="truncate">
          {linked.length === 1 ? giornoBreve(linked[0].date) : `${linked.length} mov.`}
        </span>
        {/* §307 — quello che **manca**, non due totali affiancati. Il chip diceva
            «3.260 €/3.260 €»: due numeri che sembrano uguali perché `eur`
            arrotonda all'euro, mentre la differenza vera era di 11 centesimi. Un
            numero che si legge come un errore di stampa è peggio di nessun
            numero — e quei due, insieme, erano più larghi della loro colonna e
            finivano sopra l'importo, che è il primo numero che si guarda.
            Sotto l'euro non si scrive niente: lo dice il colore, e il resto sta
            nel titolo. */}
        {!chiusa && gross - coperto >= 1 && (
          <span className="shrink-0 tabular">−{eur(gross - coperto)}</span>
        )}
      </button>
    )
  }

  if (!linked.length && !options.length) {
    return (
      <span title={side === 'entrata'
        ? 'Nessun movimento in entrata somiglia a questa riga: o non è ancora arrivato, o l\'incasso è cumulativo'
        : 'Nessun movimento in uscita somiglia a questa riga: o non è ancora uscita, o è fatta di tanti addebiti piccoli'}
        className="text-2xs text-text-tertiary whitespace-nowrap">senza movimento</span>
    )
  }

  return (
    <span className="relative inline-block">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} disabled={disabled}
        className="inline-flex items-center gap-1 text-2xs font-semibold rounded-lg px-1.5 py-0.5
                   border border-info/40 bg-info-dim text-info whitespace-nowrap press disabled:opacity-40">
        {options.length === 1 ? 'collega' : `${options.length} candidati`}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-80 rounded-xl bg-surface border border-border-strong
                        shadow-pop p-1.5 z-30 text-left">
          {/* §254 — la selezione è **multipla**, perché la forma vera del
              problema è molti-a-uno: «Advertising online» è una riga nel mese e
              ventidue addebiti sul conto. Con una scelta sola quei ventidue non
              si aggancerebbero mai. */}
          <p className="px-2 py-1 text-2xs text-text-tertiary">
            Quali movimenti sono questa riga? Se ne può scegliere <strong className="text-text-secondary">più
            di uno</strong>: la riga si chiude quando la somma la copre.
          </p>
          {linked.length > 0 && (
            <div className="px-2 py-1 mb-1 rounded-lg bg-success-dim border border-success/30">
              <p className="text-2xs text-success">
                Già agganciati: {linked.length} per {eur(coperto)}
                <button onClick={() => { setOpen(false); onDetach() }}
                  className="ml-2 font-semibold underline hover:opacity-80">sgancia tutti</button>
              </p>
            </div>
          )}
          <div className="max-h-64 overflow-y-auto">
            {options.map(o => {
              const on = picked.has(o.txId)
              return (
                <button key={o.txId} type="button"
                  onClick={() => setPicked(p2 => {
                    const n = new Set(p2); n.has(o.txId) ? n.delete(o.txId) : n.add(o.txId); return n
                  })}
                  className={`w-full flex items-baseline gap-2 px-2 py-1.5 rounded-lg text-left press ${
                    on ? 'bg-info-dim' : 'hover:bg-surface-hover'}`}>
                  <span className={`w-3 h-3 rounded border shrink-0 self-center ${
                    on ? 'bg-info border-info' : 'border-border-strong'}`} aria-hidden="true" />
                  <span className="text-2xs tabular font-semibold text-text-primary shrink-0">
                    {eur(Math.abs(o.amount))}
                  </span>
                  <span className="text-2xs text-text-secondary flex-1 min-w-0 truncate">{o.who}</span>
                  <span className="text-2xs text-text-tertiary shrink-0">
                    {dayLabel(o.date).replace(/ \d{4}$/, '')}
                  </span>
                </button>
              )
            })}
          </div>
          {picked.size > 0 && (
            <div className="flex items-center justify-between gap-2 px-2 py-2 mt-1 border-t border-border">
              <span className="text-2xs text-text-secondary">
                {picked.size} scelti · {eur(dopo)} su {eur(gross)}
                {resta > 0.01
                  ? <span className="text-warning"> · restano {eur(resta)}</span>
                  : <span className="text-success"> · copre la riga</span>}
              </span>
              <button onClick={() => { setOpen(false); onAttach(Array.from(picked)); setPicked(new Set()) }}
                className="text-2xs font-bold bg-gold text-on-gold rounded-lg px-2.5 py-1 press">
                Aggancia
              </button>
            </div>
          )}
        </div>
      )}
    </span>
  )
}


/**
 * §259 — La conferma del pagamento.
 *
 * La casella «pagato» scriveva un booleano, e da lì nascevano tre buchi: la riga
 * risultava pagata **senza una data** (e la cassa non sapeva in che mese
 * metterla), **senza un movimento** (ed era un'opinione, §226) e **senza una
 * fattura** (e l'IVA non si detraeva). Tre domande che si facevano in tre
 * schermate diverse, cioè non si facevano.
 *
 * Qui sono una sola. La **data è obbligatoria** — è il difetto originale, e
 * senza il mese di cassa se lo inventa il tool guardando la scadenza. Il
 * movimento e la fattura no: capita di pagare in contanti e capita che la
 * fattura arrivi dopo, e un campo obbligatorio che non si può compilare è un
 * campo che insegna a mettere un valore falso.
 */
function PayDialog({ line, kind, candidates, invoices, onClose, onConfirm }: {
  line: { id: string; label: string; gross: number; due?: string | null }
  kind: 'ricavo' | 'costo'
  candidates: { txId: string; date: string; amount: number; who: string; why: string; free?: number }[]
  invoices: { id: string; number: string; date: string; total: number; who: string; righe?: number; left?: number }[]
  onClose: () => void
  onConfirm: (v: { paidOn: string; txIds: string[]; invoiceId: string | null }) => void
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [invoiceId, setInvoiceId] = useState('')
  /* La data la propone il **primo movimento scelto**: è il giorno in cui i soldi
     si sono mossi, e riscriverlo a mano è il modo più veloce per sbagliarlo. */
  const first = candidates.find(c => picked.has(c.txId))
  const [manual, setManual] = useState<string | null>(null)
  const paidOn = manual ?? first?.date ?? new Date().toISOString().slice(0, 10)
  /* §261 — di un bonifico cumulativo questa riga può prendere solo quello che
     resta: contare l'importo intero direbbe «copre la riga» anche quando quei
     soldi sono già di un'altra. */
  const usable = (c: { amount: number; free?: number }) =>
    Math.min(c.free ?? Math.abs(c.amount), Math.abs(c.amount))
  const scelto = candidates.filter(c => picked.has(c.txId)).reduce((n, c) => n + usable(c), 0)
  const resta = Math.round((line.gross - scelto) * 100) / 100
  const input = 'bg-background border border-border-interactive rounded-lg px-2.5 py-1.5 text-2xs text-text-primary'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-surface border border-border-strong shadow-pop p-5 space-y-4"
        onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div>
          <h3 className="text-sm font-bold text-text-primary">Conferma il pagamento</h3>
          <p className="text-2xs text-text-tertiary mt-0.5">
            {line.label} · <span className="tabular">{eur(line.gross)}</span> lordi
          </p>
        </div>

        <label className="block">
          <span className="text-2xs font-semibold text-text-secondary">Quando i soldi si sono mossi</span>
          <input type="date" value={paidOn} onChange={e => setManual(e.target.value)}
            className={`${input} w-full mt-1`} />
          <span className="block text-2xs text-text-tertiary mt-0.5">
            È questa data a decidere il mese di cassa, non quello della riga: lo stipendio di luglio
            pagato il 20 agosto pesa su agosto.
          </span>
        </label>

        <div>
          <span className="text-2xs font-semibold text-text-secondary">
            Quale movimento {kind === 'ricavo' ? 'l\'ha incassata' : 'l\'ha pagata'}
          </span>
          {candidates.length === 0 ? (
            <p className="text-2xs text-text-tertiary mt-1">
              Nessun movimento le somiglia. Si può confermare lo stesso — contante, carta di un socio, o
              l&apos;estratto conto non è ancora caricato — e la riga resterà <strong className="text-warning">
              dichiarata</strong> finché un movimento non la dimostra.
            </p>
          ) : (
            <div className="mt-1 max-h-40 overflow-y-auto rounded-xl border border-border">
              {candidates.map(c => {
                const on = picked.has(c.txId)
                return (
                  <button key={c.txId} type="button"
                    onClick={() => setPicked(p2 => {
                      const n = new Set(p2); n.has(c.txId) ? n.delete(c.txId) : n.add(c.txId); return n
                    })}
                    className={`w-full flex items-baseline gap-2 px-2.5 py-1.5 text-left ${
                      on ? 'bg-info-dim' : 'hover:bg-surface-hover'}`}>
                    <span className={`w-3 h-3 rounded border shrink-0 self-center ${
                      on ? 'bg-info border-info' : 'border-border-strong'}`} aria-hidden="true" />
                    <span className="text-2xs tabular font-semibold text-text-primary shrink-0">
                      {eur(Math.abs(c.amount))}
                    </span>
                    <span className="text-2xs text-text-secondary flex-1 min-w-0 truncate">
                      {c.who}
                      {/* Il perché è il dato che rende scegliibile un candidato:
                          «resta 1.982,50 di 3.812,50» dice in un colpo che è il
                          bonifico giusto e che l'altra metà è già di qualcun altro. */}
                      <span className="text-text-tertiary"> · {c.why}</span>
                    </span>
                    <span className="text-2xs text-text-tertiary shrink-0">{dayLabel(c.date)}</span>
                  </button>
                )
              })}
            </div>
          )}
          {picked.size > 0 && (
            <p className="text-2xs mt-1">
              <span className="text-text-secondary">{eur(scelto)} su {eur(line.gross)}</span>
              {resta > 0.01
                ? <span className="text-warning"> · restano {eur(resta)} da coprire</span>
                : <span className="text-success"> · copre la riga</span>}
              {/* Quello che avanza non si perde: resta libero sul movimento e la
                  riga sorella lo trova qui. Dirlo evita il gesto sbagliato —
                  cercarne un altro, o non spuntare affatto. */}
              {resta < -0.01 && (
                <span className="text-text-tertiary"> · {eur(-resta)} restano liberi per un&apos;altra riga</span>
              )}
            </p>
          )}
        </div>

        {invoices.length > 0 && (
          <label className="block">
            <span className="text-2xs font-semibold text-text-secondary">La fattura, se c&apos;è</span>
            <select value={invoiceId} onChange={e => setInvoiceId(e.target.value)} className={`${input} w-full mt-1`}>
              <option value="">— nessuna, o non ancora arrivata</option>
              {/* §261 — una fattura già usata **resta in elenco**: la 36 di
                  Fatima Leo copre growth e marketing, e nasconderla dopo la prima
                  riga costringeva a inventarne una seconda. Accanto c'è quanta
                  capienza le è rimasta, che è l'unica cosa che distingue «altra
                  voce dello stesso documento» da «agganciata due volte». */}
              {invoices.map(i => (
                <option key={i.id} value={i.id}>
                  {i.number} · {i.who} · {eur(i.total)}
                  {(i.righe ?? 0) > 0
                    ? ` — già su ${i.righe} righ${i.righe === 1 ? 'a' : 'e'}, `
                      + ((i.left ?? 0) > 0.01 ? `restano ${eur(i.left ?? 0)}` : 'capienza esaurita')
                    : ''}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="flex items-center justify-end gap-3 pt-1 border-t border-border">
          <button onClick={onClose} className="text-2xs font-semibold text-text-secondary hover:text-text-primary px-3 py-2">
            Annulla
          </button>
          <button
            onClick={() => onConfirm({ paidOn, txIds: Array.from(picked), invoiceId: invoiceId || null })}
            className="text-2xs font-bold bg-gold text-on-gold rounded-xl px-3 py-2 press">
            Conferma
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * §237 — La barra che rende usabile una pagina lunga.
 *
 * Il conto economico è dodici sezioni una sotto l'altra: tenuta di cassa,
 * ripartizione, compensi, entrate, uscite, subappalti, IVA, previsionale. Per
 * arrivare alle uscite si scorreva mezzo schermo tre volte, e per tornare al
 * numero che si era appena letto altrettanto. Una pagina in cui non si sa
 * **dove sono le cose** si usa una volta sola.
 *
 * Due parti, e sono due domande diverse:
 *
 *   · **dove vado** — un salto per sezione, col numero di quella sezione
 *     accanto: così la barra non è solo navigazione, è già un riassunto, e
 *     spesso la risposta è lì e non serve nemmeno scendere.
 *   · **cosa devo fare** — quello che il mese ha di aperto, contato. Non
 *     duplica i pannelli: **porta** al pannello dove sta la leva, perché una
 *     leva lontana dal suo risultato non la usa nessuno (§224).
 */
function PlNav({ items, todo }: {
  items: { id: string; label: string; value: string; tone?: 'error' | 'warning' }[]
  todo: { label: string; to: string; tone: 'error' | 'warning' | 'info' }[]
}) {
  const [open, setOpen] = useState(false)
  const jump = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setOpen(false)
  }
  return (
    <div className="sticky top-0 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 py-2 bg-background/95 backdrop-blur border-b border-border">
      <div className="flex items-center gap-1.5 flex-wrap">
        {items.map(i => (
          <button key={i.id} type="button" onClick={() => jump(i.id)}
            className="group flex items-baseline gap-1.5 rounded-xl border border-border bg-surface px-2.5 py-1.5 hover:border-border-strong hover:bg-surface-hover press">
            <span className="text-2xs font-semibold text-text-secondary group-hover:text-text-primary">{i.label}</span>
            <span className={`text-2xs tabular font-bold ${
              i.tone === 'error' ? 'text-error' : i.tone === 'warning' ? 'text-warning' : 'text-text-primary'}`}>
              {i.value}
            </span>
          </button>
        ))}
        {todo.length > 0 && (
          <div className="relative ml-auto">
            <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
              className="flex items-center gap-1.5 rounded-xl border border-warning/40 bg-warning-dim px-2.5 py-1.5 press">
              <ListChecks className="w-3.5 h-3.5 text-warning" aria-hidden="true" />
              <span className="text-2xs font-bold text-warning">{todo.length} da fare</span>
              <ChevronDown className={`w-3.5 h-3.5 text-warning transition-transform ${open ? '' : '-rotate-90'}`} aria-hidden="true" />
            </button>
            {open && (
              <div className="absolute right-0 top-full mt-2 w-80 max-w-[90vw] rounded-2xl bg-surface border border-border-strong shadow-pop p-1.5 z-30">
                {todo.map((x, k) => (
                  <button key={k} type="button" onClick={() => jump(x.to)}
                    className="w-full flex items-start gap-2 px-2.5 py-2 rounded-xl text-left hover:bg-surface-hover press">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${
                      x.tone === 'error' ? 'bg-error' : x.tone === 'warning' ? 'bg-warning' : 'bg-info'}`} aria-hidden="true" />
                    <span className="text-2xs text-text-secondary flex-1">{x.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * §231 — Compensi, in tre sottosezioni.
 *
 * Erano tre pannelli sparsi che parlavano della stessa persona con numeri
 * diversi; poi una riga sola con quattro colonne, che metteva insieme cose che
 * non si sommano — la quota di questo mese e il debito di tutta la storia. Ora
 * sono tre blocchi, e ognuno risponde a **una** domanda:
 *
 *   1. **Erogato soci** — quanto ha prodotto questo mese per ciascun socio.
 *   2. **Compensi commerciali** — la provvigione di questo mese, per chi ha
 *      portato il cliente. Un socio che è anche commerciale compare in tutte e
 *      due: sono due lavori diversi e si pagano su due formule diverse.
 *   3. **Totale da erogare** — l'unico blocco che guarda **tutta la storia**:
 *      maturato contro bonifici veri, e quanto manca. È la domanda della cassa,
 *      non quella del mese, e tenerla separata evita di sommare a mente due
 *      numeri che non vanno sommati.
 */
/** §243 — una riga di compenso, come sta nel database. */
export type PayoutLine = {
  id: string
  person_key: string
  person_label: string
  kind: 'socio' | 'commerciale'
  amount: number
  due_month: string
  paid: boolean
  paid_on: string | null
}

function CompensiSection({
  rows, pool, config, cash, month, clientNames, projectNames, open, setOpen, since, bankReady,
  lines, onPaid, onPaidMany, onMaterialize, pending, locked,
  win, summary, dateSet, onDate,
}: {
  rows: {
    key: string; who: string
    pv: PayoutView | null
    partner: PlTotals['perPartner'][number] | null
    owner: { label: string; amount: number; accrued: number; rows: QuotaRow[]; fromRegistry: boolean } | null
    monthTotal: number
    quotaRows: QuotaRow[]
  }[]
  pool: { amount: number; share: number; rows: QuotaRow[] } | null
  config: PlConfig
  cash: boolean
  month: string
  clientNames: Record<string, string>
  projectNames: Record<string, string>
  open: string | null
  setOpen: (v: string | null) => void
  since: string | null
  bankReady: boolean
  /** §243 — le righe spuntabili del mese: senza, il pulsante che le crea */
  lines: PayoutLine[]
  onPaid: (id: string, paid: boolean, label: string, amount: number) => void
  /* Il blocco non passa dal dialogo: con dieci righe aprirebbe dieci dialoghi e
     ne resterebbe uno solo, cioè segnerebbe una riga su dieci senza dirlo. La
     data la scrive il trigger con oggi (§243), e il movimento si aggancia poi. */
  onPaidMany: (ids: string[]) => void
  onMaterialize: () => void
  pending: boolean
  locked: boolean
  /** §286 — la finestra da cui esce ogni numero di questa sezione */
  win: PayoutWindow
  summary: ReturnType<typeof windowSummary>
  /** la data è stata decisa, o è ancora il giorno di default? */
  dateSet: boolean
  onDate: (iso: string | null) => void
}) {
  /* §244 — la riga si ritrova per **nome**, non per chiave.
     `mergePeople` fonde socio e commerciale in una persona sola e le dà la
     chiave del socio (`p:<id>`); `materializePayouts` scrive la provvigione con
     la chiave del commerciale (`o:<nome>`). Due spazi di chiavi diversi, e
     l'effetto era che la spunta compariva **solo** su chi è commerciale e
     basta: Antonio sì, Walter e Marco no. Il nome ce l'hanno tutte e due, ed è
     quello che la persona legge sullo schermo. La chiave resta come ripiego. */
  const lineOf = (key: string, kind: 'socio' | 'commerciale', who: string) =>
    lines.find(l => l.kind === kind && (l.person_label === who || l.person_key === key))
  const soci = rows.filter(r => r.partner)
  const commerciali = rows.filter(r => r.owner && r.owner.amount > 0)
  const owed = rows.reduce((n, r) => n + Math.max(0, r.pv?.open ?? 0), 0)
  const never = rows.filter(r => r.pv?.never)

  /* §304 — **la posizione di ognuno**, che era caricata e mostrata a nessuno.
     `payoutLedger` sa da mesi quanto spetta a una persona su tutti i mesi,
     quanto le è uscito davvero dal conto e quanto resta; qui serviva a due
     totali in testata e il resto veniva buttato. Per sapere se Marco era in pari
     bisognava confrontare tre pannelli, e uno dei tre l'abbiamo appena tolto.
     In ordine di scoperto: chi aspetta di più si legge per primo, che è l'unico
     ordine con cui si decide un bonifico. */
  const posizioni = rows
    .filter(r => r.pv && (Math.abs(r.pv.open) > 0.5 || r.pv.paid > 0))
    .map(r => ({ who: r.who, pv: r.pv! }))
    .sort((a, b) => b.pv.open - a.pv.open)
  const totSoci = soci.reduce((n, r) => n + (r.partner?.total ?? 0), 0)
  const totComm = commerciali.reduce((n, r) => n + (r.owner?.amount ?? 0), 0)

  /* §244 — quante ne sono state pagate e quanto resta, **nella testata**: la
     domanda che si fa aprendo la sezione è «ho finito?», e con dieci righe si
     rispondeva contando le caselle a occhio. */
  const stato = (kind: 'socio' | 'commerciale', people: typeof rows) => {
    const own = people.map(r => lineOf(r.key, kind, r.who)).filter(Boolean) as PayoutLine[]
    const paid = own.filter(l => l.paid)
    return {
      n: own.length, paid: paid.length,
      resta: Math.round(own.filter(l => !l.paid).reduce((s2, l) => s2 + l.amount, 0) * 100) / 100,
      pending: own.filter(l => !l.paid),
    }
  }

  const Testata = ({ tot, st }: { tot: number; st: ReturnType<typeof stato> }) => (
    <div className="flex items-center gap-3 shrink-0 ml-auto">
      {/* Segnare dieci righe una a una è il motivo per cui non le segna nessuno. */}
      {st.pending.length > 1 && (
        <button onClick={() => onPaidMany(st.pending.map(l => l.id))} disabled={pending}
          className="text-2xs font-semibold border border-border rounded-xl px-3 py-2 text-text-secondary hover:text-text-primary hover:bg-surface-hover press disabled:opacity-40 whitespace-nowrap">
          Segna {st.pending.length} pagati
        </button>
      )}
      {!locked && lines.length === 0 && rows.length > 0 && (
        <button onClick={onMaterialize} disabled={pending}
          title="Copia i compensi di questo mese in righe spuntabili: da lì in poi si segna chi è stato pagato"
          className="flex items-center gap-1.5 text-2xs font-semibold border border-border rounded-xl px-3 py-2 text-text-secondary hover:text-text-primary hover:bg-surface-hover press disabled:opacity-40 whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5" />Prepara i compensi
        </button>
      )}
      <div className="text-right">
        <p className="text-lg font-bold text-text-primary tabular leading-tight">{eur(tot)}</p>
        {st.n > 0 && (
          <p className={`text-2xs ${st.resta > 0 ? 'text-warning' : 'text-success'}`}>
            {st.paid === st.n
              ? 'tutti pagati'
              : `${st.paid} su ${st.n} pagati · restano ${eur(st.resta)}`}
          </p>
        )}
      </div>
    </div>
  )
  /* §286 — la base dei compensi **non segue il selettore della pagina**: la
     domanda «quanto bonifico» ha una risposta sola. Si dichiara qui sopra, una
     volta, invece di ripeterla in ogni sottotitolo. */
  const base = `rientrati entro il ${giornoBreve(win.date)}`

  const Riga = ({ r, id, amount, parti, detail, line }: {
    r: (typeof rows)[number]; id: string; amount: number
    parti: { k: string; v: number }[]; detail: React.ReactNode
    /** §243 — la riga spuntabile, se il mese è stato preparato */
    line?: PayoutLine
  }) => {
    const aperto = open === id
    return (
      <li className={aperto ? 'bg-gold-dim/20' : ''}>
        <div className="flex items-baseline gap-3 px-5 py-2.5 hover:bg-surface-hover">
        {/* §243 — la spunta sta **sulla riga della persona**, dov'è il numero:
            un compenso matura in questo mese ed esce nel prossimo, quindi la
            data che il trigger scrive è quella del bonifico vero. */}
        {line ? (
          <span className="shrink-0 self-center">
            {/* §244 — la spunta resta viva **anche a mese chiuso**, ed è l'unico
                posto in cui succede. Il compenso di luglio si eroga ad agosto
                (§224): se chiudere luglio spegnesse la casella, la funzione
                sarebbe inutilizzabile proprio nel momento in cui serve. È la
                stessa regola degli arretrati — spuntare registra la data di
                oggi e non riapre il mese: il bonifico è un fatto di adesso. */}
            <Check on={line.paid} disabled={pending}
              onToggle={() => onPaid(line.id, !line.paid, `${r.who} — ${line.kind === 'socio' ? 'erogato' : 'provvigione'}`, line.amount)}
              label={`${r.who}: segna il compenso come ${line.paid ? 'non pagato' : 'pagato'}`} />
          </span>
        ) : <span className="w-4 shrink-0" />}
        <button type="button" onClick={() => setOpen(aperto ? null : id)} aria-expanded={aperto}
          className="flex-1 flex items-baseline gap-3 text-left min-w-0">
          <span className="text-sm font-semibold text-text-primary shrink-0">{r.who}</span>
          <span className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
            {parti.map(x => (
              <span key={x.k} className="inline-flex items-baseline gap-1 text-2xs px-2 py-0.5
                                         rounded-lg bg-background border border-border">
                <span className="text-text-tertiary">{x.k}</span>
                <span className="tabular font-semibold text-text-primary">{eur(x.v)}</span>
              </span>
            ))}
          </span>
          {/* §244 — la data stava in una colonna da 96px e «pagato il 9 agosto»
              andava a capo su due righe, allontanando l'importo dal nome. Qui
              sta **prima** dell'importo, come una targhetta: l'occhio scorre la
              colonna dei numeri senza inciampare in una riga di testo. */}
          {line && (
            <span className={`hidden sm:inline-flex items-center gap-1 shrink-0 text-2xs font-semibold
              whitespace-nowrap rounded-lg px-2 py-0.5 border ${
              line.paid
                ? 'border-success/40 bg-success-dim text-success'
                : 'border-border bg-background text-text-tertiary'}`}>
              {line.paid
                ? <>pagato {line.paid_on ? dayLabel(line.paid_on) : ''}</>
                : <>esce a {monthLabel(line.due_month).split(' ')[0].toLowerCase()}</>}
            </span>
          )}
          <span className={`text-sm font-bold tabular shrink-0 w-28 text-right ${
            line?.paid ? 'text-success' : 'text-text-primary'}`}>
            {eur(amount)}
          </span>
          <ChevronDown className={`w-3.5 h-3.5 text-text-tertiary shrink-0 self-center transition-transform ${
            aperto ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
        </div>
        {aperto && <div className="border-t border-border/60">{detail}</div>}
      </li>
    )
  }

  const Posizione = () => {
    if (!posizioni.length) return null
    const scoperto = posizioni.reduce((n, p) => n + Math.max(0, p.pv.open), 0)
    const anticipo = posizioni.reduce((n, p) => n + Math.max(0, -p.pv.open), 0)
    /* §311 — quello che spetta in tutto: più alto dell'erogabile ogni volta che
       un cliente è in ritardo, ed è il numero che una persona ha in testa. */
    const credito = posizioni.reduce((n, p) => n + Math.max(0, p.pv.owed), 0)
    return (
      <section className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1 basis-72">
            <h2 className="flex items-center gap-2 text-sm font-bold text-text-primary">
              <Banknote className="w-4 h-4 text-gold-text" aria-hidden="true" />
              La posizione di ognuno
            </h2>
            <p className="text-2xs text-text-tertiary mt-0.5 leading-relaxed">
              Su <strong className="text-text-secondary">tutti i mesi</strong>, non su questo: un
              bonifico non sa di che mese è, e confrontare il maturato di agosto con quello che è
              uscito in agosto darebbe a chiunque uno scoperto o un anticipo che non ha.
            </p>
            {/* §311 — le due colonne che non si sommano, dette prima dei numeri.
                Il maturato è quello che una persona ha prodotto; l'erogabile è
                la parte che i clienti hanno già pagato (§286). Finché ce n'era
                una sola, la tabella mostrava l'erogabile chiamandolo «gli
                spetta»: ad Antonio Giarletta 284 € su 1.821 maturati. */}
            <p className="text-2xs text-text-tertiary mt-1.5 leading-relaxed">
              <strong className="text-text-secondary">Maturato</strong> è quello che ha prodotto;
              <strong className="text-text-secondary"> erogabile</strong> è la parte che i clienti
              hanno già pagato. La differenza non è un debito in meno: si eroga quando l&apos;incasso
              arriva.
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className={`text-xl font-bold tabular leading-tight ${
              scoperto > 0.5 ? 'text-warning' : 'text-success'}`}>{eur(scoperto)}</p>
            <p className="text-2xs text-text-tertiary">
              erogabile adesso{anticipo > 0.5 && <> · {eur(anticipo)} già in anticipo</>}
            </p>
            {credito > scoperto + 0.5 && (
              <p className="text-2xs text-text-tertiary mt-0.5">
                <strong className="text-text-secondary">{eur(credito)}</strong> il credito
                complessivo
              </p>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-2xs">
            <thead>
              <tr className="border-b border-border text-text-tertiary">
                <th className="text-left px-5 py-2 font-semibold">Persona</th>
                <th className="text-right px-3 py-2 font-semibold">Maturato</th>
                <th className="text-right px-3 py-2 font-semibold">Erogabile adesso</th>
                <th className="text-right px-3 py-2 font-semibold">Uscito dal conto</th>
                <th className="text-right px-5 py-2 font-semibold">Resta da erogare</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {posizioni.map(({ who, pv }) => (
                <tr key={pv.key} className="hover:bg-surface-hover">
                  <td className="px-5 py-2">
                    <span className="font-semibold text-text-primary">{who}</span>
                    {/* §228 — da quando si conta **per lui**, e perché. La stessa
                        frase detta a due situazioni opposte è peggio di nessuna
                        frase: chi è stato pagato riparte dalla liquidazione, chi
                        non ha mai preso un euro si conta da sempre. */}
                    <span className="block text-2xs text-text-tertiary">
                      {pv.never
                        ? <span className="text-error font-semibold">mai un bonifico: si conta da sempre</span>
                        : pv.from
                          ? <>da {monthLabel(pv.from).toLowerCase()}, prima è liquidato</>
                          : <>da sempre</>}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular text-text-primary font-semibold">
                    {eur(pv.accrued)}
                  </td>
                  <td className="px-3 py-2 text-right tabular text-text-secondary">
                    {eur(pv.due)}
                    {pv.accrued - pv.due > 0.5 && (
                      <span className="block text-2xs text-text-tertiary">
                        {eur(pv.accrued - pv.due)} quando incassano
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular text-text-secondary">
                    {pv.paid > 0 ? eur(pv.paid) : <span className="text-text-tertiary">—</span>}
                  </td>
                  {/* La differenza è il numero per cui questa tabella esiste: è
                      quello che dice se una persona è scoperta o in anticipo, e
                      prima si ricavava confrontando tre pannelli. */}
                  <td className={`px-5 py-2 text-right tabular font-bold ${
                    pv.open > 0.5 ? 'text-warning' : pv.open < -0.5 ? 'text-info' : 'text-success'}`}>
                    {pv.open > 0.5 ? eur(pv.open)
                      : pv.open < -0.5 ? <>+{eur(-pv.open)}</>
                      : 'in pari'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {anticipo > 0.5 && (
          <p className="px-5 py-2.5 border-t border-border text-2xs text-text-tertiary">
            Un <strong className="text-info">anticipo</strong> non è un errore: è quello che è uscito
            oltre il maturato, e si riassorbe col mese dopo (§191).
          </p>
        )}
      </section>
    )
  }

  return (
    <div className="space-y-4">
      {/* ── 0 · §286 · la finestra, dichiarata prima dei numeri ───────────────
          «Genera i compensi» su una base che nessuno vede è il modo in cui si
          firma un bonifico sbagliato. Qui sta scritto cosa entra — competenza
          di questo mese, incasso entro il giorno dell'erogazione — quanto è
          rientrato e quanto no, e la data si cambia da qui perché è
          un'eccezione che capita (ad agosto 2026 si è anticipata al 13). */}
      <section className="bg-surface border border-border rounded-2xl shadow-soft px-5 py-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1 basis-72">
            <h2 className="flex items-center gap-2 text-sm font-bold text-text-primary">
              <Wallet className="w-4 h-4 text-gold-text" />
              Erogazione del {giornoBreve(win.date)}
            </h2>
            <p className="text-2xs text-text-tertiary mt-1 leading-relaxed">
              Si distribuisce quello che è stato fatturato in <b>{monthLabel(win.month).toLowerCase()}</b>
              {' '}e risulta incassato entro il giorno dell&apos;erogazione
              {win.since ? <> — e non è già entrato in quella del {giornoBreve(win.since)}</> : null}.
              I soldi escono {monthLabel(win.dueMonth).toLowerCase()}.
            </p>
            {/* §226/§228 — lo scoperto storico e chi non ha **mai** ricevuto un
                bonifico. Erano calcolati e buttati via: la sezione mostrava le
                quote del mese e taceva sul fatto che a una persona non fosse mai
                uscito un euro. La regola sbaglia in una direzione sola — a chi è
                stato pagato in contanti mostra uno scoperto che non ha, che è un
                allarme falso e non una rassicurazione falsa, e si spegne
                registrando il movimento. */}
            {owed > 0.5 && (
              <p className="text-2xs mt-2 flex items-start gap-1.5">
                <Banknote className="w-3.5 h-3.5 shrink-0 mt-0.5 text-text-tertiary" aria-hidden="true" />
                <span className="text-text-secondary">
                  <b className="text-text-primary tabular">{eur(owed)}</b> maturati e mai erogati,
                  su tutti i mesi
                  {never.length > 0 && (
                    <>
                      {' · '}
                      <b className="text-error">
                        {never.map(r => r.who).join(', ')}
                        {never.length === 1 ? ' non ha' : ' non hanno'} mai ricevuto un bonifico
                      </b>
                    </>
                  )}
                </span>
              </p>
            )}
          </div>
          <label className="flex items-center gap-2 text-2xs text-text-secondary shrink-0">
            <span className="whitespace-nowrap">Data</span>
            <input type="date" value={win.date} disabled={pending}
              onChange={e => onDate(e.target.value || null)}
              aria-label="Data dell'erogazione: decide quali incassi entrano nella distribuzione"
              className="bg-background border border-border-interactive rounded-xl px-2.5 py-1.5
                         text-2xs text-text-primary tabular focus-visible:border-gold" />
            {!dateSet && <span className="text-text-tertiary whitespace-nowrap">giorno {config.payout_day}</span>}
          </label>
        </div>
        <div className="flex items-center gap-2 flex-wrap mt-3">
          <span className="inline-flex items-baseline gap-1.5 text-2xs px-2.5 py-1 rounded-lg
                           bg-success-dim border border-success/30">
            <span className="text-text-secondary">nella finestra</span>
            <b className="tabular text-text-primary">{eur(summary.taken.amount)}</b>
            <span className="text-text-tertiary">· {summary.taken.n} righe</span>
          </span>
          {summary.open.n > 0 && (
            <span className="inline-flex items-baseline gap-1.5 text-2xs px-2.5 py-1 rounded-lg
                             bg-warning-dim border border-warning/30">
              <span className="text-text-secondary">non ancora incassato</span>
              <b className="tabular text-text-primary">{eur(summary.open.amount)}</b>
              <span className="text-text-tertiary">· si eroga quando rientra</span>
            </span>
          )}
          {summary.next.n > 0 && (
            <span className="inline-flex items-baseline gap-1.5 text-2xs px-2.5 py-1 rounded-lg
                             bg-background border border-border">
              <span className="text-text-secondary">rientrato dopo</span>
              <b className="tabular text-text-primary">{eur(summary.next.amount)}</b>
              <span className="text-text-tertiary">· nella prossima erogazione</span>
            </span>
          )}
          {summary.assumed.n > 0 && (
            <span className="inline-flex items-baseline gap-1.5 text-2xs px-2.5 py-1 rounded-lg
                             bg-background border border-border text-text-tertiary">
              {summary.assumed.n} spuntate senza data: assunte dentro
            </span>
          )}
        </div>
      </section>

      {/* ── §304 · la posizione di ognuno: sta **prima** delle quote del mese ──
          Le quote dicono cosa spetta adesso; questa dice se una persona è in
          pari, e sono due domande in ordine — la seconda si fa prima di
          bonificare, non dopo. */}
      <Posizione />

      {/* ── 1 · erogato soci ─────────────────────────────────────────────── */}
      <section className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
        <div className="flex items-end justify-between gap-3 px-5 py-4 border-b border-border flex-wrap">
          <div className="min-w-0 flex-1 basis-72 max-w-xl">
            <h2 className="flex items-center gap-2 text-sm font-bold text-text-primary">
              <Users className="w-4 h-4 text-accent" />Erogato soci
            </h2>
            <p className="text-2xs text-text-tertiary mt-0.5">
              {pc(config.growth_delivery_pct)} del growth in parti uguali ·{' '}
              {pc(config.digital_partner_pct)} del margine digital a ciascuno · {base}
            </p>
          </div>
          <Testata tot={totSoci} st={stato('socio', soci)} />
        </div>
        {soci.length === 0 ? <div className="p-5"><Empty>Nessun socio configurato.</Empty></div> : (
          <ul className="divide-y divide-border/60">
            {soci.map(r => {
              const p = r.partner!
              return (
                <Riga key={r.key} r={r} id={`s:${r.key}`} amount={p.total} line={lineOf(r.key, 'socio', r.who)}
                  parti={[
                    p.delivery > 0 && { k: 'erogato', v: p.delivery },
                    p.digital > 0 && { k: 'digital', v: p.digital },
                    p.residual > 0 && { k: 'residuo', v: p.residual },
                    p.salesShare > 0 && { k: 'provv. divisa', v: p.salesShare },
                    p.spent > 0 && { k: 'già speso', v: p.spent },
                  ].filter(Boolean) as { k: string; v: number }[]}
                  detail={<>
                    {p.rows.length > 0 && (
                      <QuotaDetail rows={p.rows} total={p.total} config={config}
                        clientNames={clientNames} projectNames={projectNames} />
                    )}
                    <PayoutPanel p={p} month={month} />
                  </>} />
              )
            })}
          </ul>
        )}
      </section>

      {/* ── 2 · compensi commerciali ─────────────────────────────────────── */}
      <section className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
        <div className="flex items-end justify-between gap-3 px-5 py-4 border-b border-border flex-wrap">
          <div className="min-w-0 flex-1 basis-72 max-w-xl">
            <h2 className="flex items-center gap-2 text-sm font-bold text-text-primary">
              <Users className="w-4 h-4 text-info" />Compensi commerciali
            </h2>
            <p className="text-2xs text-text-tertiary mt-0.5">
              {pc(config.growth_sales_pct)} sul growth · {pc(config.digital_sales_pct)} sul margine
              digital · {base}. Un socio che è anche commerciale compare in tutte e due le sezioni:
              sono due lavori diversi
            </p>
          </div>
          <Testata tot={totComm} st={stato('commerciale', commerciali)} />
        </div>
        {commerciali.length === 0 && !pool ? (
          <div className="p-5"><Empty>Nessuna provvigione: assegna un commerciale in anagrafica.</Empty></div>
        ) : (
          <ul className="divide-y divide-border/60">
            {commerciali.map(r => (
              <Riga key={r.key} r={r} id={`c:${r.key}`} amount={r.owner!.amount} line={lineOf(r.key, 'commerciale', r.who)}
                parti={[
                  r.partner ? { k: 'anche socio', v: r.partner.total } : null,
                  r.owner!.fromRegistry ? { k: 'dall\'anagrafica', v: r.owner!.amount } : null,
                ].filter(Boolean) as { k: string; v: number }[]}
                detail={<QuotaDetail rows={r.owner!.rows} total={r.owner!.amount} config={config}
                  clientNames={clientNames} projectNames={projectNames} />} />
            ))}
            {pool && (
              <li className="bg-gold-dim/40">
                <button type="button" onClick={() => setOpen(open === 'pool' ? null : 'pool')}
                  aria-expanded={open === 'pool'} className="w-full px-5 py-2.5 text-left">
                  <div className="flex items-baseline gap-3">
                    <span className="text-sm font-semibold text-text-primary flex-1">Da lead generation</span>
                    <span className="text-sm font-bold text-text-primary tabular">{eur(pool.amount)}</span>
                    <ChevronDown className={`w-3.5 h-3.5 text-text-tertiary shrink-0 transition-transform ${
                      open === 'pool' ? 'rotate-180' : ''}`} aria-hidden="true" />
                  </div>
                  <p className="text-2xs text-text-tertiary mt-0.5">
                    Clienti senza commerciale, né sulla riga né in anagrafica: {eur(pool.share)} a
                    testa ai soci. Assegnarne uno in anagrafica sposta la provvigione da qui a lui
                  </p>
                </button>
                {open === 'pool' && (
                  <QuotaDetail rows={pool.rows} total={pool.amount} config={config}
                    clientNames={clientNames} projectNames={projectNames} />
                )}
              </li>
            )}
          </ul>
        )}
      </section>

      {/* §245 — «Totale da erogare» tolto: rispondeva alla stessa domanda dei
          due blocchi qui sopra con numeri diversi. Quelli guardano **questo
          mese** e adesso hanno la spunta; questo guardava tutta la storia e
          mostrava «erogato 0 €» a chiunque non avesse un bonifico dentro la
          finestra del consolidato — cioè a tutti. Due risposte alla stessa
          domanda, e quella sbagliata era l'ultima che si leggeva. Lo scoperto
          storico resta dove serve davvero: nella Tenuta di cassa, che lo toglie
          dal saldo prima di dire se il mese regge. */}
    </div>
  )
}

/** Persona · maturato · erogato · resta · freccia. Una volta sola, o
 *  l'intestazione e le righe non si incolonnano. */
const PAY_GRID = {
  gridTemplateColumns: 'minmax(0,1fr) 6.5rem 6.5rem 7rem 1.25rem',
} as const

// ── §226 · l'estratto conto certifica ───────────────────────────────────────

/**
 * Il marchio di certificazione di una riga.
 *
 * Una spunta «pagato» è un'opinione finché un movimento non la conferma, e per
 * mesi le due cose si sono lette identiche: righe verificate sull'estratto
 * conto e righe spuntate a mano avevano lo stesso segno di spunta. Qui la
 * differenza si vede — un glifo solo, perché la colonna è stretta e perché
 * quello che conta è **poterle contare a colpo d'occhio**, non leggere una
 * frase per riga.
 *
 * Il verde non è un premio: è la norma. È il grigio che va guardato.
 */
function CertMark({ c }: { c: Cert | undefined }) {
  if (!c) return null
  if (c.state === 'certificata') {
    return (
      <span title={`${CERT_LABEL.certificata}${c.bookedOn ? ` il ${dayLabel(c.bookedOn)}` : ''}`}
        className="shrink-0 text-success" aria-label="Certificata dalla banca">
        <Landmark className="w-3 h-3" />
      </span>
    )
  }
  if (c.state === 'sospetta') {
    return (
      <span title={`${CERT_LABEL.sospetta}${c.bookedOn ? ` (${dayLabel(c.bookedOn)})` : ''}: l'aggancio va rifatto in Banca`}
        className="shrink-0 text-error" aria-label="Aggancio sospetto">
        <AlertTriangle className="w-3 h-3" />
      </span>
    )
  }
  /* §230 — un mese consolidato non chiede niente: nessun glifo, o la pagina
     segnalerebbe per sempre un periodo che è stato chiuso apposta. */
  if (c.state === 'consolidata') return null
  if (c.state === 'dichiarata') {
    return (
      <span title={`${CERT_LABEL.dichiarata}. Può essere un conto non caricato o del contante: non è falsa, è non verificata`}
        className="shrink-0 text-text-tertiary" aria-label="Spuntata, non certificata">
        <FileText className="w-3 h-3" />
      </span>
    )
  }
  return null
}


// ── §224 · ritardi e arretrati ──────────────────────────────────────────────

/**
 * Il tono di una riga scoperta. Colore **e** parola: il colore si vede da
 * lontano e fa scorrere l'occhio, la parola dice quanto — «in ritardo di 3
 * giorni» e «in ritardo di 54» sono due fatti diversi, e un rosso solo li
 * mette sullo stesso piano.
 */
const BAND_TONE: Record<Band, { pill: string; row: string; stripe: string }> = {
  pagato: { pill: 'border-border text-text-tertiary', row: '', stripe: 'bg-success/40' },
  atteso: { pill: 'border-info/40 bg-info-dim text-info', row: '', stripe: 'bg-info/50' },
  in_ritardo: { pill: 'border-warning/40 bg-warning-dim text-warning', row: 'bg-warning-dim/40', stripe: 'bg-warning' },
  scaduto: { pill: 'border-error/40 bg-error-dim text-error', row: 'bg-error-dim/40', stripe: 'bg-error' },
  grave: { pill: 'border-error bg-error-dim text-error font-bold', row: 'bg-error-dim/60', stripe: 'bg-error' },
}

/**
 * Lo stato di cassa di una riga, dove si legge il suo nome.
 *
 * Sta accanto all'etichetta e non vicino alla spunta perché è lì che l'occhio
 * scorre: incolonnati sul bordo sinistro, tre ritardi in venti righe si vedono
 * senza cercarli. La spunta la si preme dopo, quando si è già capito quale.
 */
function CashPill({ s, onDue, disabled }: {
  s: CashStatus
  /** scrivere una scadenza diversa da quella della regola. Assente = sola lettura */
  onDue?: (d: string | null) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const tone = BAND_TONE[s.band]
  const why = `${TERMS_LABEL[s.terms]} — ${TERMS_WHY[s.terms]}`

  if (s.band === 'pagato') {
    return (
      <span className="text-2xs text-text-tertiary shrink-0 tabular"
        title={s.assumed ? 'Pagata prima che il tool registrasse le date: resta nel suo mese' : why}>
        {s.paidOn ? dayLabel(s.paidOn) : 'senza data'}
      </span>
    )
  }

  return (
    <span className="relative shrink-0">
      <button type="button" disabled={!onDue || disabled}
        onClick={() => setOpen(o => !o)}
        title={`Scadenza ${dayLabel(s.due)} · ${why}`}
        className={`text-2xs px-1.5 py-0.5 rounded border whitespace-nowrap ${tone.pill} ${
          onDue && !disabled ? 'hover:opacity-80 press cursor-pointer' : 'cursor-default'}`}>
        {lateLabel(s)}
      </button>
      {open && onDue && (
        <span className="absolute z-30 left-0 top-full mt-1 w-56 rounded-xl border border-border
                         bg-surface shadow-soft p-2.5 space-y-1.5">
          <span className="block text-2xs text-text-secondary">{why}</span>
          <input type="date" defaultValue={s.due} aria-label="Scadenza"
            onChange={e => { if (e.target.value) { onDue(e.target.value); setOpen(false) } }}
            className="w-full bg-background border border-border-interactive rounded-lg px-2 py-1 text-2xs text-text-primary" />
          <button type="button" onClick={() => { onDue(null); setOpen(false) }}
            className="text-2xs text-gold-text hover:underline">torna alla regola</button>
        </span>
      )}
    </span>
  )
}

/**
 * Il gesto per togliere una riga, con la ragione quando non si può. (§294)
 *
 * Un pulsante che sparisce lascia chi guarda a chiedersi se ha sbagliato posto.
 * Uno spento, con scritto perché e cosa fare prima, insegna la regola una volta
 * e non si ripresenta. L'unico caso in cui sparisce davvero è il mese chiuso,
 * dove **nessuna** riga si tocca e ripeterlo su venti righe è rumore.
 *
 * Quando l'operazione si può fare ma ha una conseguenza che non si vede — la
 * rata che tornerà, l'IVA di una fattura che forse esiste — la conferma la
 * dice prima di eseguire.
 */
function RemoveButton({ check, label, onRemove, hideWhenBlocked }: {
  check: Removal
  label: string
  onRemove: () => void
  /** nel mese chiuso il pulsante non serve: lo dice già la testata */
  hideWhenBlocked?: boolean
}) {
  if (!check.can) {
    if (hideWhenBlocked) return null
    return (
      <button type="button" disabled title={`${check.why}. ${check.how}`}
        aria-label={`Non si può eliminare ${label}: ${check.why}`}
        className="text-text-tertiary/40 cursor-not-allowed">
        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    )
  }
  return (
    <button type="button"
      onClick={() => { if (!check.warn || window.confirm(`${check.warn}\n\nElimino «${label}»?`)) onRemove() }}
      aria-label={`Elimina ${label}`}
      title={check.warn ?? `Elimina «${label}»`}
      className={`hover:text-error press ${check.warn ? 'text-warning' : 'text-text-tertiary'}`}>
      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
    </button>
  )
}

export type InvRef = { id: string; number: string; date: string; total: number; who: string }
export type InvOption = {
  id: string; number: string; date: string; total: number; who: string
  /** su quante righe è già spesa, e quanto le resta di capienza */
  righe?: number; left?: number
}

/**
 * La fattura sotto una riga del conto economico. (§302)
 *
 * Il documento si poteva collegare **solo** dentro il dialogo del pagamento,
 * quindi su una riga già pagata — o su una da collegare prima di incassare —
 * non c'era strada. E il documento è la terza gamba del triangolo: la riga dice
 * a che mese appartiene, il movimento quando i soldi si sono mossi, la fattura è
 * l'unica cosa che vale davanti all'erario.
 *
 * Due cose che l'elenco dei candidati deve dire, e sono quelle che evitano
 * l'abbinamento sbagliato: **quanta capienza le resta** — una fattura da 3.000 €
 * già spesa su due righe non può coprirne una terza — e **se è già su altre
 * righe**, perché una fattura che copre due mesi è normale e una spesa tre volte
 * è un errore.
 */
function InvoiceCell({ inv, options, gross, disabled, onLink, onUnlink }: {
  inv?: InvRef
  options: InvOption[]
  /** il lordo della riga: serve a dire se una fattura la copre */
  gross: number
  disabled?: boolean
  onLink: (invoiceId: string) => void
  onUnlink: () => void
}) {
  const [open, setOpen] = useState(false)

  if (inv) {
    return (
      <span className="inline-flex items-baseline gap-1.5">
        <span className="text-2xs font-semibold text-text-secondary tabular" title={`${inv.who} · ${eur2(Math.abs(inv.total))}`}>
          {inv.number}
        </span>
        {!disabled && (
          <button type="button" onClick={onUnlink} aria-label={`Scollega la fattura ${inv.number}`}
            title="Scollega: la riga resta, il documento no"
            className="text-text-tertiary hover:text-error">
            <X className="w-3 h-3" aria-hidden="true" />
          </button>
        )}
      </span>
    )
  }

  /* §307 — in un mese chiuso non c'è niente da collegare, e un trattino non è
     un'informazione: era un segnaposto appeso sopra «senza fattura», cioè due
     segni per la stessa assenza. Chi mostra la cella dice già che il documento
     manca; qui si tace. */
  if (disabled) return null

  return (
    <span className="relative inline-block max-w-full">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        title={options.length
          ? `${options.length} document${options.length === 1 ? 'o' : 'i'} possibil${options.length === 1 ? 'e' : 'i'}`
          : 'Nessun documento con questo importo o questa controparte'}
        className={`text-2xs font-semibold ${options.length
          ? 'text-gold-text hover:underline' : 'text-text-tertiary'}`}>
        {options.length ? `collega · ${options.length}` : 'nessuna'}
      </button>
      {open && options.length > 0 && (
        <span className="absolute right-0 z-30 mt-1 w-72 bg-surface border border-border rounded-xl shadow-soft p-1.5 block">
          <span className="block text-2xs text-text-tertiary px-1.5 pb-1">
            Chi ha ancora capienza per {eur2(gross)} viene prima
          </span>
          {options.map(o => {
            const capiente = (o.left ?? Math.abs(o.total)) >= gross - 0.02
            return (
              <button key={o.id} type="button"
                onClick={() => { setOpen(false); onLink(o.id) }}
                className="w-full text-left px-1.5 py-1 rounded-lg hover:bg-surface-hover press">
                <span className="flex items-baseline gap-2">
                  <span className="text-2xs font-semibold text-text-primary">{o.number}</span>
                  <span className="text-2xs text-text-tertiary flex-1 truncate">{o.who}</span>
                  <span className="text-2xs tabular text-text-primary">{eur2(Math.abs(o.total))}</span>
                </span>
                <span className="block text-2xs text-text-tertiary">
                  {dayLabel(o.date)}
                  {(o.righe ?? 0) > 0 && <> · già su {o.righe} righ{o.righe === 1 ? 'a' : 'e'}</>}
                  {!capiente && (
                    <span className="text-warning"> · le restano {eur2(o.left ?? 0)}</span>
                  )}
                </span>
              </button>
            )
          })}
        </span>
      )}
    </span>
  )
}

export type CarryItem = {
  id: string
  status: CashStatus
  title: string
  sub: string
  amount: number
  month: string
  href?: string
  /** §290 — da quante chiusure di mese questa riga si sta trascinando */
  carry?: Carry | null
  /** §294 — se si può togliere, e se no perché. Guarda **il suo** mese */
  remove?: Removal
}

/**
 * Gli arretrati: quello che è maturato prima e non si è ancora mosso.
 *
 * Sta **dentro** Entrate e Uscite, sotto le righe del mese, e non in un riquadro
 * di totali da un'altra parte: è lì che si spunta, e una leva lontana dal suo
 * risultato non la usa nessuno. Ogni riga dice da che mese viene, quando era
 * attesa e di quanto è in ritardo — un elenco di importi senza date è una lista
 * della spesa, non uno scadenzario.
 *
 * Le righe **in scadenza** non sono in ritardo e non vanno colorate come tali:
 * lo stipendio di luglio, ad agosto, è semplicemente il pagamento di agosto.
 */
function CarryBlock({ side, items, moved, showMoved, onPaid, onDue, onRemove }: {
  side: 'entrata' | 'uscita'
  items: CarryItem[]
  /** §224 — le righe di altri mesi che in questo mese si sono **mosse** */
  moved: CarryItem[]
  /** in lettura di cassa quelle righe fanno un totale: qui c'è chi lo fa */
  showMoved: boolean
  onPaid: (id: string) => void
  onDue: (id: string, d: string | null) => void
  /** §294 — togliere una riga che non arriverà mai, da dove la si guarda */
  onRemove: (id: string) => void
}) {
  const [open, setOpen] = useState(true)
  const [openMoved, setOpenMoved] = useState(false)
  const movedSum = Math.round(moved.reduce((n, i) => n + i.amount, 0))

  const movedBlock = showMoved && moved.length > 0 ? (
    <div className="mx-4 my-3 rounded-xl border border-border overflow-hidden">
      <button type="button" onClick={() => setOpenMoved(o => !o)} aria-expanded={openMoved}
        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left bg-background hover:bg-surface-hover">
        <ArrowRightLeft className="w-3.5 h-3.5 text-success shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block text-2xs font-bold text-text-primary">
            {moved.length} {side === 'entrata' ? 'incassi' : 'pagamenti'} di mesi precedenti,
            {' '}passati in questo mese
          </span>
          <span className="block text-2xs text-text-tertiary">
            Sono dentro i totali di cassa e fuori dalla competenza di questo mese
          </span>
        </span>
        <span className="text-2xs font-bold text-text-primary tabular shrink-0">{eur(movedSum)}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-text-tertiary shrink-0 transition-transform ${
          openMoved ? '' : '-rotate-90'}`} aria-hidden="true" />
      </button>
      {openMoved && (
        <ul className="divide-y divide-border/60">
          {moved.map(i => (
            <li key={i.id} className="flex items-center gap-2.5 px-3.5 py-1.5">
              <span className="min-w-0 flex-1">
                <span className="block text-2xs font-semibold text-text-primary truncate">{i.title}</span>
                <span className="block text-2xs text-text-tertiary truncate">
                  {monthLabel(i.month)}{i.sub && <> · {i.sub}</>}
                </span>
              </span>
              <CashPill s={i.status} />
              <span className="text-2xs font-bold text-text-primary tabular shrink-0 w-20 text-right">
                {eur(i.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  ) : null

  if (!items.length) return movedBlock

  const late = items.filter(i => isLate(i.status))
  const waiting = items.filter(i => !isLate(i.status))
  const lateSum = Math.round(late.reduce((n, i) => n + i.amount, 0))
  const waitSum = Math.round(waiting.reduce((n, i) => n + i.amount, 0))
  const oldest = late.reduce((n, i) => Math.max(n, i.status.days), 0)
  const worst: Band = late.some(i => i.status.band === 'grave') ? 'grave'
    : late.some(i => i.status.band === 'scaduto') ? 'scaduto'
    : late.length ? 'in_ritardo' : 'atteso'
  const verbo = side === 'entrata' ? 'incassare' : 'pagare'
  /* §290 — quante la chiusura si è portata dietro più di una volta. Un ritardo
     che sopravvive a due chiusure non è un ritardo: è un credito che nessuno sta
     inseguendo, e va detto sopra, non riga per riga. */
  const ripetute = items.filter(i => (i.carry?.times ?? 0) > 1).length

  /* Classi intere, mai composte: Tailwind legge il sorgente, e `border-${x}/40`
     non finisce nel CSS — il bordo sparirebbe proprio sulle righe che gridano. */
  const frame = worst === 'atteso' ? 'border-border'
    : worst === 'in_ritardo' ? 'border-warning/40' : 'border-error/40'

  return (
    <>
    {movedBlock}
    <div className={`mx-4 my-3 rounded-xl border overflow-hidden ${frame}`}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        className={`w-full flex items-start gap-2.5 px-3.5 py-3 text-left hover:bg-surface-hover ${
          BAND_TONE[worst].row || 'bg-background'}`}>
        <History className={`w-4 h-4 shrink-0 mt-0.5 ${
          worst === 'atteso' ? 'text-info' : worst === 'in_ritardo' ? 'text-warning' : 'text-error'}`} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-text-primary">
            Da mesi precedenti · {items.length} da {verbo}
          </span>
          <span className="block text-2xs text-text-secondary mt-0.5">
            {late.length > 0 ? (
              <>
                <strong className={worst === 'in_ritardo' ? 'text-warning' : 'text-error'}>
                  {late.length} in ritardo per {eur(lateSum)}
                </strong>
                {oldest > 0 && <> · il più vecchio da {oldest} giorni</>}
              </>
            ) : (
              <>niente in ritardo</>
            )}
            {waiting.length > 0 && <> · {waiting.length} in scadenza per {eur(waitSum)}</>}
            {ripetute > 0 && (
              <> · <strong className="text-warning">
                {ripetute} {ripetute === 1 ? 'si trascina' : 'si trascinano'} da più di una chiusura
              </strong></>
            )}
          </span>
        </span>
        <ChevronDown className={`w-4 h-4 text-text-tertiary shrink-0 transition-transform ${
          open ? '' : '-rotate-90'}`} aria-hidden="true" />
      </button>

      {open && (
        <ul className="divide-y divide-border/60">
          {items.map(i => (
            <li key={i.id}
              className={`flex items-center gap-2.5 pl-0 pr-3 py-2 hover:bg-surface-hover ${BAND_TONE[i.status.band].row}`}>
              {/* la striscia dice la gravità prima di ogni parola */}
              <span className={`w-1 self-stretch shrink-0 ${BAND_TONE[i.status.band].stripe}`} aria-hidden="true" />
              <span className="min-w-0 flex-1 pl-1.5">
                <span className="block text-2xs font-semibold text-text-primary truncate">
                  {i.href ? (
                    <Link href={i.href} className="hover:text-gold-text">{i.title}</Link>
                  ) : i.title}
                </span>
                <span className="block text-2xs text-text-tertiary truncate">
                  {monthLabel(i.month)}
                  {i.sub && <> · {i.sub}</>}
                  {' · '}attesa il {dayLabel(i.status.due)}
                  {/* §290 — «trascinata due volte» è un'altra cosa da «scaduta
                      ieri», e finora si leggevano identiche. */}
                  {i.carry && i.carry.times > 1 && (
                    <> · <span className="text-warning font-semibold">
                      {i.carry.times}ª chiusura che se la porta dietro
                    </span></>
                  )}
                </span>
              </span>
              <CashPill s={i.status} onDue={d => onDue(i.id, d)} />
              <span className="text-2xs font-bold text-text-primary tabular shrink-0 w-20 text-right">
                {eur(i.amount)}
              </span>
              {/* Sempre spuntabile, anche se il mese guardato è chiuso: la riga è
                  di un altro mese, e incassarla oggi è un fatto di oggi. */}
              <Check on={false}
                label={`Segna ${i.title} come ${side === 'entrata' ? 'incassata' : 'pagata'}`}
                onToggle={() => onPaid(i.id)} />
              {/* §294 — e l'altra risposta: questa riga non arriverà mai. Il
                  verdetto guarda **il suo** mese, non quello aperto. */}
              {i.remove && (
                <RemoveButton check={i.remove} label={i.title} onRemove={() => onRemove(i.id)} />
              )}
            </li>
          ))}
        </ul>
      )}

      {open && (
        <p className="flex items-start gap-2 text-2xs text-text-tertiary px-3.5 py-2.5 border-t border-border/60">
          <ArrowRightLeft className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          Spuntarne una registra <strong className="text-text-secondary">la data di oggi</strong>: da lì
          conta nella cassa di questo mese e sparisce da qui. Il suo mese di competenza non cambia — e
          se è chiuso non si riapre, perché il movimento è un fatto di adesso, non di allora.
        </p>
      )}
    </div>
    </>
  )
}

// ── pezzi ────────────────────────────────────────────────────────────────────

/**
 * §210 · §224 — le due letture del mese, in cima e non dentro un riquadro.
 *
 * **Competenza** è quello che il mese ha prodotto: il lavoro consegnato, la
 * fattura emessa, incassata o no. **Cassa** è quello che è passato dal conto in
 * questo mese, di qualunque competenza — lo stipendio di luglio pagato il 20
 * agosto è cassa di agosto, la fattura di giugno incassata adesso è cassa di
 * adesso. Prima «Incassato» erano le sole righe spuntate **di questo mese**, e
 * un mese non vedeva un euro di quello che stava davvero pagando.
 *
 * I due tasti non sono un filtro estetico: cambiano ogni totale della sezione,
 * compresi compensi e provvigioni, e per questo dichiarano **cosa entra e cosa
 * esce** prima che uno prema. Un selettore che non lo dice fa credere che il
 * numero più basso sia il numero vero.
 *
 * La leva sono le spunte nelle tabelle qui sotto: spuntare «incassato» o
 * «pagato» registra la data di oggi, e da lì la riga fa cassa in questo mese.
 */
type Flow = {
  inRev: { n: number; e: number }; inCost: { n: number; e: number }
  outRev: { n: number; e: number }; outCost: { n: number; e: number }
  ownRev: number; ownCost: number
}

function BasisSwitch({ basis, onChange, t, tCash, flow }: {
  basis: 'maturato' | 'incassato'
  onChange: (b: 'maturato' | 'incassato') => void
  t: PlTotals; tCash: PlTotals
  flow: Flow
}) {
  const movedIn = flow.inRev.n + flow.inCost.n
  const stayedOut = flow.outRev.n + flow.outCost.n
  const opts = [
    {
      key: 'maturato' as const, label: 'Competenza', icon: <FileText className="w-4 h-4" />,
      value: t.revenue.accrued,
      desc: 'Quello che il mese ha prodotto, incassato o no',
      side: `${flow.ownRev} entrate · ${flow.ownCost} uscite · ${eur(t.costs.actual)} di costi`,
    },
    {
      key: 'incassato' as const, label: 'Cassa', icon: <BadgeEuro className="w-4 h-4" />,
      value: tCash.revenue.accrued,
      desc: 'Quello che è passato dal conto in questo mese, di qualunque competenza',
      side: (movedIn > 0 ? `${eur(flow.inRev.e + flow.inCost.e)} da altri mesi · ` : '')
        + `${eur(flow.outRev.e)} da incassare · ${eur(flow.outCost.e)} da pagare`,
    },
  ]
  const nothingTicked = basis === 'incassato' && tCash.revenue.accrued === 0 && tCash.costs.actual === 0 && flow.ownRev > 0

  return (
    <section aria-label="Base di lettura del mese"
      className="bg-surface border border-border rounded-2xl p-3 shadow-soft">
      <div className="grid gap-2 sm:grid-cols-2">
        {opts.map(o => {
          const on = basis === o.key
          return (
            <button key={o.key} onClick={() => onChange(o.key)} aria-pressed={on}
              className={`text-left rounded-xl border p-3 transition-colors press ${
                on ? 'border-gold bg-gold-dim' : 'border-border hover:bg-surface-hover'
              }`}>
              <div className="flex items-center gap-2">
                <span className={on ? 'text-gold-text' : 'text-text-tertiary'}>{o.icon}</span>
                <span className="text-sm font-bold text-text-primary flex-1">{o.label}</span>
                {on && <CheckCircle2 className="w-4 h-4 text-gold-text shrink-0" aria-hidden="true" />}
                <span className="text-base font-bold text-text-primary tabular">{eur(o.value)}</span>
              </div>
              <p className="text-2xs text-text-secondary mt-1">{o.desc}</p>
              <p className="text-2xs text-text-tertiary mt-0.5 tabular">{o.side}</p>
            </button>
          )
        })}
      </div>
      <p className="flex items-start gap-2 text-2xs text-text-tertiary mt-2 px-1">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        {nothingTicked ? (
          <span className="text-warning">
            Non è ancora passato niente dal conto in questo mese: la cassa vale zero. Metti le spunte
            «incassato» sulle entrate e «pagato» sulle uscite qui sotto e i numeri si muovono.
          </span>
        ) : basis === 'incassato' ? (
          <span>
            Tutti i totali di questa pagina — compensi e provvigioni compresi — leggono i movimenti di
            questo mese.
            {movedIn > 0 && (
              <> Sono entrati <strong className="text-text-secondary tabular">{eur(flow.inRev.e)}</strong> di
              incassi e <strong className="text-text-secondary tabular">{eur(flow.inCost.e)}</strong> di
              pagamenti maturati prima.</>
            )}
            {' '}Restano fuori <strong className="text-text-secondary tabular">{eur(flow.outRev.e)}</strong> di
            entrate e <strong className="text-text-secondary tabular">{eur(flow.outCost.e)}</strong> di costi
            di questo mese, che si muoveranno più avanti.
          </span>
        ) : (
          <span>
            Tutti i totali di questa pagina leggono la competenza: il lavoro consegnato in questo mese.
            Passa a «Cassa» per gli stessi numeri sul denaro che è davvero passato dal conto — è lì che
            si vede che il costo del lavoro di questo mese uscirà il 20 del prossimo.
          </span>
        )}
      </p>
    </section>
  )
}

function Kpi({ icon, label, value, hint, tone, trend, trendGoodIsDown }: {
  icon: React.ReactNode; label: string; value: string; hint?: string
  tone?: 'success' | 'error'
  trend?: { text: string; up: boolean }
  /** sui costi crescere è male: il colore segue il significato, non la direzione */
  trendGoodIsDown?: boolean
}) {
  const good = trend ? (trendGoodIsDown ? !trend.up : trend.up) : false
  return (
    <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
      <div className="flex items-center gap-2 mb-1.5">{icon}
        <span className="text-2xs font-semibold text-text-secondary uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-xl font-bold text-text-primary tabular">{value}</div>
      {hint && <div className={`text-2xs mt-0.5 ${tone === 'error' ? 'text-error' : tone === 'success' ? 'text-success' : 'text-text-tertiary'}`}>{hint}</div>}
      {trend && (
        <div className={`text-2xs mt-0.5 font-semibold ${good ? 'text-success' : 'text-error'}`}>{trend.text}</div>
      )}
    </div>
  )
}

/**
 * Un numero con la sua etichetta. L'etichetta **non si taglia**: «Target costi 35%
 * growth + …» non dice niente, e un'etichetta illeggibile vale meno di una riga in
 * più di altezza.
 */
function Mini({ icon, label, hint, value, negative, extra }: {
  icon: React.ReactNode
  /** cosa è, in due parole: è la riga che si cerca con l'occhio */
  label: string
  /** come si ottiene: la formula, non il nome ripetuto */
  hint?: string
  value: string
  /** il numero è una cifra negativa e va letta come tale, non solo col segno */
  negative?: boolean
  /** la qualifica del numero: dice sempre *di cosa* parla, mai un valore nudo */
  extra?: React.ReactNode
}) {
  return (
    <div className="h-full flex flex-col px-3 py-2.5 rounded-xl border border-border">
      <span className="flex items-center gap-1.5 min-w-0">
        <span className="shrink-0">{icon}</span>
        <span className="text-2xs font-semibold text-text-secondary truncate">{label}</span>
      </span>
      <span className={`mt-1.5 text-base font-bold tabular ${negative ? 'text-error' : 'text-text-primary'}`}>
        {value}
      </span>
      {extra && <span className="text-2xs font-semibold leading-snug">{extra}</span>}
      {/* la spiegazione in fondo e allineata fra le schede: si legge quando serve,
          e non spinge il numero — che è la cosa per cui la scheda esiste — in basso */}
      {hint && <span className="mt-auto pt-1.5 text-2xs text-text-tertiary leading-snug">{hint}</span>}
    </div>
  )
}

function Text({ value, onSave, disabled }: { value: string; onSave: (v: string) => void; disabled?: boolean }) {
  const [v, setV] = useState(value)
  return (
    <input value={v} disabled={disabled} aria-label="Descrizione"
      onChange={e => setV(e.target.value)}
      onBlur={() => { if (v !== value) onSave(v) }}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      className="w-full min-w-[120px] bg-transparent text-sm text-text-primary border-b border-transparent focus:border-border-interactive outline-none disabled:text-text-secondary" />
  )
}

/**
 * Un importo modificabile.
 *
 * Con `money` si legge formattato — «2.767,31 €» — e si modifica in chiaro:
 * fuori dalla modifica un numero va letto, non decifrato, e i separatori delle
 * migliaia sono metà del lavoro. `null` nello stato significa «non in modifica»,
 * così il valore mostrato resta quello del server anche dopo un salvataggio.
 */
function Num({ value, onSave, disabled, strong, money, full }: {
  value: number; onSave: (v: number) => void
  disabled?: boolean; strong?: boolean; money?: boolean; full?: boolean
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? (money ? eur2(value) : String(value))
  return (
    <input value={shown} disabled={disabled} inputMode="decimal" aria-label="Importo"
      onFocus={() => setDraft(String(value))}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => {
        const n = Number((draft ?? '').replace(/\./g, '').replace(',', '.'))
        if (draft !== null && !Number.isNaN(n) && n !== value) onSave(n)
        setDraft(null)
      }}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      className={`${full ? 'w-full' : 'w-20'} bg-transparent text-right tabular text-sm rounded
                  border-b border-transparent focus:border-border-interactive outline-none
                  disabled:cursor-default ${
        strong ? 'text-text-primary font-semibold' : 'text-text-secondary'
      }`} />
  )
}

/**
 * Da dove viene la riga. Una riga coperta da un contratto porta al progetto;
 * una ferma all'MRR d'anagrafica lo dice, perché è lì che manca il contratto.
 */
function Origin({ line, projectNames, clientNames }: {
  line: RevenueLine
  projectNames: Record<string, string>
  clientNames: Record<string, string>
}) {
  // il nome del cliente non sta più nella label della riga di contratto: senza
  // questo, in tabella si leggerebbe il servizio senza sapere di chi è
  const client = line.client_id ? clientNames[line.client_id] : null

  /* §194 — dove si modifica, non solo da dove viene: chi guarda una riga sbagliata
     deve sapere in quale pagina si corregge, senza cercarla. */
  if (line.origin === 'contratto' && line.project_id) {
    return (
      <span className="flex items-center gap-1.5 flex-wrap">
        <Link href={`/progetti/${line.project_id}?tab=economics`}
          className="flex items-center gap-1 text-2xs text-text-tertiary hover:text-gold-text w-fit">
          <Briefcase className="w-3 h-3 shrink-0" />
          <span className="truncate max-w-[240px]">
            {client ? `${client} · ` : ''}{projectNames[line.project_id] ?? 'Progetto'}
          </span>
        </Link>
        {/* la sezione madre: importo, rate e scadenze si cambiano lì */}
        {line.client_id && (
          <Link href={`/clienti/${line.client_id}?tab=economics`}
            title="L'importo e la scadenza di questa rata si cambiano nell'economics del cliente"
            className="flex items-center gap-0.5 text-2xs text-info hover:underline shrink-0">
            <Lock className="w-2.5 h-2.5" aria-hidden="true" />modifica l&apos;accordo
          </Link>
        )}
      </span>
    )
  }
  if (line.origin === 'contratto' && client) {
    return <span className="text-2xs text-text-tertiary truncate max-w-[280px] block">{client}</span>
  }
  if (line.origin === 'anagrafica') {
    return (
      <span className="flex items-center gap-1 text-2xs text-warning w-fit"
        title="Viene dall'MRR in anagrafica: crea il contratto nel progetto per agganciarla">
        <AlertTriangle className="w-3 h-3 shrink-0" />senza contratto
      </span>
    )
  }
  return <span className="text-2xs text-text-tertiary">riga manuale</span>
}

function VatCell({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <div className="text-2xs font-semibold text-text-secondary uppercase tracking-wider truncate">{label}</div>
      <div className="text-sm font-bold text-text-primary tabular mt-0.5">{value}</div>
      <div className="text-2xs text-text-tertiary mt-0.5">{hint}</div>
    </div>
  )
}

const bulkBtn = 'text-2xs font-semibold border border-border rounded-lg px-2.5 py-1.5 text-text-secondary hover:text-text-primary hover:bg-surface press disabled:opacity-40'

/**
 * Bersaglio da 32px con la spunta da 20: sotto i 24px sul telefono si sbaglia,
 * e queste si premono decine di volte a fine mese.
 */
function Check({ on, onToggle, disabled, label }: { on: boolean; onToggle: () => void; disabled?: boolean; label: string }) {
  return (
    <button type="button" onClick={onToggle} disabled={disabled} role="checkbox" aria-checked={on}
      aria-label={label} title={label}
      className="w-8 h-8 grid place-items-center rounded-lg hover:bg-surface-active transition-colors disabled:opacity-40 no-tap-highlight press mx-auto">
      <span className={`w-5 h-5 rounded-md border-2 grid place-items-center transition-colors ${
        on ? 'bg-success border-success text-on-gold' : 'border-border-strong hover:border-border-interactive'
      }`}>
        {on && (
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" aria-hidden>
            <path d="M3.5 8.5l3 3 6-7" stroke="var(--color-surface)" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
    </button>
  )
}

/**
 * Il commerciale di una riga di ricavo.
 *
 * Si **legge**, non si scrive: il commerciale di un cliente sta in anagrafica, ed
 * è lì che si cambia. La tendina su ogni riga era un secondo posto dove scriverlo
 * — quindi due nomi possibili per lo stesso cliente nello stesso mese, e la
 * provvigione seguiva quello che qualcuno aveva toccato per ultimo.
 *
 * Tre stati, e tutti e tre vanno detti:
 *
 *   · **dall'anagrafica** — il caso normale. Spesso è un segnalatore senza account
 *     nel tool, e per questo si mostra il nome in chiaro e non un profilo;
 *   · **sulla riga** — una fotografia scattata quando la riga è nata. Non si
 *     riscrive: un mese chiuso non cambia commerciale perché l'anagrafica è
 *     cambiata dopo, ed è il motivo per cui la riga se lo porta dietro;
 *   · **nessuno** — la provvigione non resta in cassa, si divide fra i soci.
 */
/**
 * §207 — il tipo di lavoro di una riga nata da un contratto, in sola lettura.
 *
 * Non è un dettaglio di presentazione: growth e digital hanno due piani
 * compensi diversi — 15% sull'imponibile contro 6% sul margine — e finché il
 * campo era modificabile qui esistevano due risposte alla stessa domanda, una
 * sul contratto e una sulla riga, senza niente che dicesse quale valeva. La
 * percentuale sta scritta accanto al tipo perché è il motivo per cui conta.
 */
function Kind({ kind, clientId, config }: {
  kind: 'growth' | 'digital'
  clientId: string | null
  config: PlConfig
}) {
  const body = (
    <>
      <Lock className="w-2.5 h-2.5 shrink-0 text-text-tertiary" aria-hidden="true" />
      {kind === 'digital' ? 'Digital' : 'Growth'}
    </>
  )
  const cls = 'flex items-center gap-1 text-2xs font-semibold text-text-secondary'
  return (
    <div className="min-w-[74px]">
      {clientId ? (
        <Link href={`/clienti/${clientId}?tab=economics`} className={`${cls} hover:text-gold-text`}
          title="Il tipo di lavoro lo decide il contratto: si cambia nell'economics del cliente">
          {body}
        </Link>
      ) : (
        <span className={cls}>{body}</span>
      )}
      <span className="block text-2xs text-text-tertiary">
        provvigione {pc(pct.sales(config, kind))}
      </span>
    </div>
  )
}

function Owner({ line, clientNames }: {
  line: RevenueLine
  clientNames: Record<string, string>
}) {
  const o = ownerOf(line)
  const href = line.client_id ? `/clienti/${line.client_id}?tab=anagrafica` : null

  if (!o.name) {
    return (
      <div className="min-w-[110px]">
        <span className="text-2xs text-text-tertiary">—</span>
        <span className="block text-2xs text-gold-text">quota ai soci</span>
        {href && (
          <Link href={href} className="block text-2xs text-info hover:underline">
            assegnalo in anagrafica
          </Link>
        )}
      </div>
    )
  }

  return (
    <div className="min-w-[110px]">
      {href ? (
        <Link href={href} title="Il commerciale si cambia nell'anagrafica del cliente"
          className="text-2xs font-semibold text-text-primary hover:text-gold-text flex items-center gap-1">
          <Lock className="w-2.5 h-2.5 shrink-0 text-text-tertiary" aria-hidden="true" />
          <span className="truncate max-w-[120px]">{o.name}</span>
        </Link>
      ) : (
        <span className="text-2xs font-semibold text-text-primary">{o.name}</span>
      )}
      <span className="block text-2xs text-text-tertiary">
        {o.source === 'anagrafica'
          ? 'dall\'anagrafica'
          : `fotografia della riga${line.client_id && clientNames[line.client_id] ? '' : ''}`}
      </span>
    </div>
  )
}

/**
 * Da dove viene un compenso, riga per riga.
 *
 * Quattro colonne e nessuna interpretazione: la voce di ricavo (con cliente e
 * progetto), la base su cui si calcola, la percentuale applicata, l'importo. Il
 * totale in fondo deve tornare col numero chiuso: se non torna, si vede quale
 * riga lo rompe — che è tutto il punto di poter aprire un numero.
 */
function QuotaDetail({ rows, total, config, clientNames, projectNames, note }: {
  rows: QuotaRow[]
  total: number
  config: PlConfig
  clientNames: Record<string, string>
  projectNames: Record<string, string>
  note?: string
}) {
  if (!rows.length) {
    return (
      <p className="px-3 py-2.5 text-2xs text-text-tertiary border-t border-border">
        Nessuna riga di ricavo alimenta questo compenso in questo mese.
      </p>
    )
  }

  const REASON: Record<QuotaRow['reason'], string> = {
    erogato: 'erogato growth',
    digital: 'quota digital',
    residuo: 'residuo growth',
    provvigione: 'provvigione',
    'provvigione-divisa': 'provvigione divisa fra i soci',
  }
  const sum = rows.reduce((s, r) => s + r.amount, 0)

  return (
    <div className="border-t border-border bg-background/60">
      <div className="overflow-x-auto">
        <table className="w-full text-2xs">
          <thead>
            <tr className="text-text-tertiary uppercase tracking-wider">
              <th className="text-left font-semibold px-3 py-1.5">Voce</th>
              <th className="text-right font-semibold px-2 py-1.5">Base</th>
              <th className="text-right font-semibold px-2 py-1.5">%</th>
              <th className="text-right font-semibold px-3 py-1.5">Quota</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.lineId}-${r.reason}-${i}`} className="border-t border-border/60">
                <td className="px-3 py-1.5">
                  {/* il nome porta al lavoro da cui quella quota nasce: è lì che si
                      cambia l'importo o la scadenza, non qui */}
                  {r.projectId ? (
                    <Link href={`/progetti/${r.projectId}?tab=economics`}
                      title="Apri l'economics del progetto: importo e scadenza si cambiano lì"
                      className="text-text-primary font-semibold hover:text-gold-text hover:underline
                                 decoration-dotted underline-offset-2">
                      {r.label}
                    </Link>
                  ) : (
                    <span className="text-text-primary font-semibold">{r.label}</span>
                  )}
                  <span className="block text-text-tertiary">
                    {/* Cliente e progetto: senza, «Rata 3 di 6» non dice a chi. E
                        sono entrambi link, perché da una quota che non torna si va
                        a vedere l'accordo che l'ha generata — che è la domanda
                        successiva nove volte su dieci. */}
                    {r.clientId && (
                      <Link href={`/clienti/${r.clientId}?tab=economics`}
                        className="text-info hover:underline">
                        {clientNames[r.clientId] ?? 'cliente'}
                      </Link>
                    )}
                    {r.projectId && (
                      <> · <Link href={`/progetti/${r.projectId}?tab=economics`}
                        title="Apri l'economics di questo lavoro"
                        className="text-info hover:underline">
                        {projectNames[r.projectId] ?? 'progetto'}
                      </Link></>
                    )}
                    {' · '}{r.kind}{' · '}{REASON[r.reason]}
                  </span>
                </td>
                <td className="px-2 py-1.5 text-right tabular text-text-secondary">
                  {eur(r.base)}
                  {/* sul digital la base è il margine: si dice quanto è uscito prima */}
                  {r.external > 0 && (
                    <span className="block text-text-tertiary">− {eur(r.external)} subappalto</span>
                  )}
                </td>
                <td className="px-2 py-1.5 text-right tabular text-text-secondary">{pc1(r.pct)}</td>
                <td className="px-3 py-1.5 text-right tabular font-bold text-text-primary">{eur(r.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border">
              <td className="px-3 py-1.5 text-text-secondary font-semibold" colSpan={3}>Totale</td>
              <td className="px-3 py-1.5 text-right tabular font-bold text-text-primary">{eur(sum)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {Math.abs(sum - total) > 1 && (
        <p className="px-3 py-1.5 text-2xs text-error border-t border-border">
          Il dettaglio fa {eur(sum)} contro {eur(total)} del totale: differenza {eur(total - sum)}.
        </p>
      )}
      {note && <p className="px-3 py-1.5 text-2xs text-text-tertiary border-t border-border">{note}</p>}
      <p className="px-3 py-1.5 text-2xs text-text-tertiary border-t border-border">
        {/* da dove nasce: le righe del mese, che nascono dai contratti dei progetti */}
        Calcolato sulle <strong className="text-text-secondary">{rows.length} righe di ricavo
        di questo mese</strong>, che nascono dagli accordi dei progetti: si cambiano lì, e questa
        tabella si aggiorna.
      </p>
      <p className="px-3 py-1.5 text-2xs text-text-tertiary border-t border-border">
        Growth: {pc(config.growth_delivery_pct)} di erogato diviso fra i soci, {pc(config.growth_sales_pct)} di
        provvigione. Digital: {pc(config.digital_partner_pct)} a ciascun socio e {pc(config.digital_sales_pct)} di
        provvigione, calcolati sul <strong className="text-text-secondary">margine</strong> — ricavo meno i
        subappalti del progetto.
      </p>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-center py-8 border border-dashed border-border rounded-xl">
      <p className="text-2xs text-text-tertiary">{children}</p>
    </div>
  )
}

/**
 * Come far uscire l'erogato di un socio: spesa o fattura.
 *
 * È una decisione da prendere ogni mese, e le due strade non sono equivalenti.
 * La **spesa dal sottoconto** porta a costo quello che comunque si sarebbe speso
 * — la cena col cliente, il carburante per andarci — ma con la deducibilità della
 * sua famiglia: un pranzo vale il 75% e non recupera IVA. La **fattura del socio**
 * è deducibile per intero e l'IVA si detrae tutta, ma sposta l'imposta sulla
 * persona, che su quell'importo paga le sue.
 *
 * Il pannello non sceglie: mostra i due numeri, quanto è già uscito in ciascuna
 * forma e quanto resta. L'unica cosa che impedisce è farlo uscire due volte.
 */
function PayoutPanel({ p, month }: {
  p: PlTotals['perPartner'][number]
  month: string
}) {
  const router = useRouter()
  const [busy, start] = useTransition()
  const [amount, setAmount] = useState<string>('')
  const [ref, setRef] = useState('')

  const residuo = p.cash
  const spese = p.spendRows.filter(r => !r.invoice)
  const fatture = p.spendRows.filter(r => r.invoice)
  const deducibile = p.spendRows.reduce((n, r) => n + r.deductible, 0)

  return (
    <div className="border-t border-border bg-background px-3 py-3 space-y-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <MiniBox label="Spesa dal sottoconto" value={eur(p.viaSpend)}
          hint={spese.length ? `${spese.length} voci · deducibile ${eur(deducibile)}` : 'niente ancora'} />
        <MiniBox label="Fattura del socio" value={eur(p.viaInvoice)}
          hint={fatture.length ? 'deducibile al 100%, IVA detraibile' : 'nessuna fattura registrata'} />
        <MiniBox label={p.overspent > 0 ? 'Uscito in eccesso' : 'Ancora da far uscire'}
          value={eur(p.overspent > 0 ? p.overspent : residuo)}
          tone={p.overspent > 0 ? 'error' : residuo > 0 ? 'warning' : 'success'} />
      </div>

      {p.spendRows.length > 0 && (
        <ul className="space-y-1">
          {p.spendRows.map(r => (
            <li key={r.id} className="flex items-baseline gap-2 text-2xs">
              <span className={`shrink-0 px-1.5 py-0.5 rounded ${
                r.invoice ? 'bg-info-dim text-info' : 'bg-surface-active text-text-tertiary'}`}>
                {r.invoice ? 'fattura' : 'spesa'}
              </span>
              <span className="truncate text-text-secondary">{r.label}</span>
              <span className="text-text-tertiary shrink-0">
                deducibile {Math.round(r.deductiblePct * 100)}%
              </span>
              <span className="ml-auto tabular text-text-primary shrink-0">{eur(r.amount)}</span>
            </li>
          ))}
        </ul>
      )}

      {p.overspent > 0 ? (
        <p className="text-2xs text-text-secondary">
          È uscito <strong className="text-error">{eur(p.overspent)}</strong> più di quanto gli spetta
          questo mese: è un anticipo, si recupera dall&apos;erogato del mese prossimo.
        </p>
      ) : residuo > 0 ? (
        <div className="flex items-end gap-2 flex-wrap">
          <div>
            <label className="block text-2xs text-text-tertiary mb-1" htmlFor={`inv-${p.partner.id}`}>
              Fattura per il compenso
            </label>
            <input id={`inv-${p.partner.id}`} type="number" min={0} step={50}
              value={amount} onChange={e => setAmount(e.target.value)}
              placeholder={String(Math.round(residuo))}
              className="w-28 bg-surface border border-border-interactive rounded-lg px-2 py-1.5
                         text-2xs tabular text-text-primary" />
          </div>
          <div>
            <label className="block text-2xs text-text-tertiary mb-1" htmlFor={`ref-${p.partner.id}`}>
              Numero
            </label>
            <input id={`ref-${p.partner.id}`} value={ref} onChange={e => setRef(e.target.value)}
              placeholder="opzionale"
              className="w-28 bg-surface border border-border-interactive rounded-lg px-2 py-1.5
                         text-2xs text-text-primary" />
          </div>
          <button type="button" disabled={busy}
            onClick={() => start(async () => {
              const val = Number(amount || residuo)
              if (!Number.isFinite(val) || val <= 0) { toast.error('Serve un importo'); return }
              if (val > residuo + 0.01) {
                toast.error(`Restano solo ${eur(residuo)} da far uscire: il resto è già uscito come spesa`)
                return
              }
              try {
                await registerPartnerInvoice(month, p.partner.id, val, ref || null)
                toast.success(`Fattura di ${p.partner.label} registrata: ${eur(val)}`)
                setAmount(''); setRef('')
                router.refresh()
              } catch (e) { toast.error((e as Error).message) }
            })}
            className="px-3 py-1.5 rounded-lg bg-gold text-on-gold text-2xs font-bold
                       hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Receipt className="w-3.5 h-3.5" />}
            Registra
          </button>
          <p className="text-2xs text-text-tertiary basis-full">
            La spesa dal sottoconto porta a costo quello che si sarebbe speso comunque, ma con la
            deducibilità della sua famiglia. La fattura è deducibile per intero e l&apos;IVA si detrae
            tutta, però sposta l&apos;imposta sulla persona. Sopra i due numeri per decidere
          </p>
        </div>
      ) : (
        <p className="text-2xs text-success">
          Erogato del mese tutto uscito: {eur(p.viaSpend)} come spesa, {eur(p.viaInvoice)} come fattura.
        </p>
      )}
    </div>
  )
}

function MiniBox({ label, value, hint, tone }: {
  label: string; value: string; hint?: string; tone?: 'error' | 'warning' | 'success'
}) {
  const cls = tone === 'error' ? 'text-error' : tone === 'warning' ? 'text-warning'
    : tone === 'success' ? 'text-success' : 'text-text-primary'
  return (
    <div className="rounded-lg border border-border bg-surface px-2.5 py-2">
      <p className="text-2xs text-text-tertiary">{label}</p>
      <p className={`text-sm font-bold tabular ${cls}`}>{value}</p>
      {hint && <p className="text-2xs text-text-tertiary mt-0.5">{hint}</p>}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Uscite del mese
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Dove il preventivato di una voce è già stato deciso altrove.
 *
 * Una riga nata dal piano dei costi, dall'organico o da un movimento bancario ha
 * un preventivato **derivato**: riscriverlo qui creerebbe un secondo numero che
 * dice un'altra cosa, e da quel momento nessuno dei due sarebbe affidabile. Si
 * corregge alla fonte, e il lucchetto dice quale è.
 *
 * L'effettivo invece resta sempre scrivibile: quello è il fatto, e il fatto lo
 * conosce solo chi ha visto la fattura.
 */
function originOf(c: CostLine): { label: string; href: string } | null {
  if (c.partner_id || c.category === 'Spese soci' || c.category === 'Compenso soci') {
    return { label: 'dai sottoconti', href: '/economics/banca' }
  }
  if (c.category === 'Spese fuori piano') return { label: 'dai movimenti', href: '/economics/banca' }
  if (c.category === 'Personale' || c.category === 'Persone') {
    return { label: "dall'organico", href: '/economics/personale' }
  }
  if (c.project_id) return { label: 'dal subappalto', href: '/economics/costi' }
  if (c.cost_item_id) return { label: 'dal piano', href: '/economics/costi' }
  return null
}

/**
 * Le uscite del mese, raggruppate per area.
 *
 * Ventisei righe piatte non si leggono: la domanda che uno si fa davanti a questa
 * tabella non è «quanto costa Slack» ma «quanto pesa la struttura, quanto le
 * persone, quanto i lavori affidati fuori». L'area è il livello a cui esiste un
 * budget, quindi è il livello a cui ha senso sommare — e il confronto
 * preventivato/effettivo si legge per gruppo prima che per riga.
 *
 * «senza area» sta in cima e resta segnalata: una spesa senza area non pesa su
 * nessun budget, e un budget che non misura niente è un budget che mente.
 */
function CostSection({
  costs, centers, locked, pending, picked, setPicked, totals,
  statusOf, late, certOf, carry, carryMoved, showMoved, onPaidCarry, onDue,
  onUpdate, onCenter, onDelete, onAdd, onBulk, onSyncPlan,
  linkedTx, matchOptions, withInvoice, invoiceOf, invoiceOptions, onAttach, onDetach,
  onLinkInvoice, onUnlinkInvoice, onPayToggle, onRenameCenter,
}: {
  costs: CostLine[]
  centers: { id: string; name: string }[]
  locked: boolean
  pending: boolean
  picked: Set<string>
  setPicked: (s: Set<string>) => void
  totals: PlTotals['costs']
  /** §224 — quando quella riga è attesa, e di quanto è in ritardo */
  statusOf: (id: string) => CashStatus | undefined
  /** §226 — chi certifica quella spunta: la banca, o chi l'ha messa */
  certOf: (id: string) => Cert | undefined
  late: { count: number; amount: number; oldest: number }
  /** §224 — le uscite maturate prima e non ancora pagate */
  carry: CarryItem[]
  /** §224 — quelle di altri mesi uscite davvero in questo */
  carryMoved: CarryItem[]
  showMoved: boolean
  onPaidCarry: (id: string) => void
  onDue: (id: string, d: string | null) => void
  onUpdate: (id: string, patch: Partial<{ label: string; category: string; budget: number; actual: number; paid: boolean; cost_type: 'F' | 'V' }>) => void
  onCenter: (id: string, centerId: string | null) => void
  onDelete: (id: string, label: string) => void
  onAdd: () => void
  onBulk: (action: 'align' | 'paid' | 'unpaid' | 'zero' | 'delete', msg: string, ids?: string[]) => void
  onSyncPlan: () => void
  /** §254 — i movimenti agganciati a una riga: possono essere più di uno */
  linkedTx: Record<string, { txId: string; date: string; amount: number; who: string }[]>
  /** §247 — quali righe hanno una fattura sotto */
  withInvoice: Record<string, boolean>
  /** §302 — il documento sotto ogni riga, e i candidati per quelle che non l'hanno */
  invoiceOf: Record<string, InvRef>
  invoiceOptions: Record<string, InvOption[]>
  onLinkInvoice: (lineId: string, invoiceId: string) => void
  onUnlinkInvoice: (lineId: string) => void
  matchOptions: Record<string, { txId: string; date: string; amount: number; who: string; why: string }[]>
  onAttach: (costLineId: string, txIds: string[]) => void
  onDetach: (costLineId: string) => void
  /** §259 — la spunta apre la conferma invece di scrivere un booleano */
  onPayToggle: (id: string, label: string, gross: number, paid: boolean) => void
  /** §261 — il nome dell'area si corregge dall'intestazione del gruppo */
  onRenameCenter: (id: string, name: string) => void
}) {
  const [closed, setClosed] = useState<Set<string>>(new Set())
  const name = useMemo(() => new Map(centers.map(c => [c.id, c.name])), [centers])

  const groups = useMemo(() => {
    const map = new Map<string, CostLine[]>()
    for (const c of costs) {
      const k = c.center_id ?? ''
      map.set(k, [...(map.get(k) ?? []), c])
    }
    return Array.from(map, ([id, rows]) => ({
      id,
      label: id ? (name.get(id) ?? 'Area rimossa') : 'senza area',
      rows: rows.slice().sort((a, b) => b.actual - a.actual || b.budget - a.budget),
      budget: r2c(rows.reduce((n, c) => n + c.budget, 0)),
      actual: r2c(rows.reduce((n, c) => n + c.actual, 0)),
      paid: rows.every(c => c.paid),
      unpaid: r2c(rows.filter(c => !c.paid).reduce((n, c) => n + c.actual, 0)),
    })).sort((a, b) => (a.id === '' ? -1 : b.id === '' ? 1 : b.actual - a.actual))
  }, [costs, name])

  // le righe rimaste a zero col preventivato pieno: è l'errore che gonfia il margine
  const daAllineare = costs.filter(c => c.actual === 0 && c.budget > 0)
  const allPicked = costs.length > 0 && picked.size === costs.length
  const toggle = (id: string) => {
    const next = new Set(picked)
    if (next.has(id)) next.delete(id); else next.add(id)
    setPicked(next)
  }

  return (
    <section className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
      <div className="flex items-end justify-between gap-3 px-5 py-4 border-b border-border flex-wrap">
        <div className="min-w-0 flex-1 basis-64">
          <h2 className="text-sm font-bold text-text-primary">Uscite</h2>
          {/* I pezzi devono fare il totale. «fissi + variabili» conta solo la
              struttura — i subappalti stanno fuori dal target del 35% (§188) e il
              personale ha la sua sezione — quindi da soli non arrivavano al numero
              grosso, e la differenza sembrava un errore invece di una scelta. */}
          <p className="text-2xs text-text-tertiary mt-0.5">
            {costs.length} voci · struttura {eur(totals.structural)}{' '}
            <span className="text-text-tertiary">
              ({eur(totals.fixed)} fissi + {eur(totals.variable)} variabili)
            </span>
            {totals.external > 0 && <> · subappalti {eur(totals.external)}</>}
            {totals.partners > 0 && <> · spese soci {eur(totals.partners)}</>}
            {' '}· con IVA {eur(totals.gross)}
            {late.count > 0 && (
              <span className="text-error"> · {eur(late.amount)} in ritardo</span>
            )}
          </p>
        </div>
        <div className="text-right ml-auto shrink-0">
          <p className="text-xl font-bold text-text-primary tabular">{eur(totals.actual)}</p>
          <p className="text-2xs text-text-tertiary">
            preventivato {eur(totals.budget)}
            {Math.abs(totals.actual - totals.budget) >= 1 && (
              <span className={totals.actual > totals.budget ? 'text-error' : 'text-success'}>
                {' '}· {totals.actual > totals.budget ? '+' : '−'}{eur(Math.abs(totals.actual - totals.budget))}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Un effettivo a zero su un preventivato pieno non è «non speso»: è «non
          ancora guardato», e a fine mese si legge come un costo che non c'è stato. */}
      {!locked && daAllineare.length > 0 && (
        <div className="flex items-center gap-3 px-5 py-2.5 bg-warning-dim border-b border-warning/30 flex-wrap">
          <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0" aria-hidden="true" />
          <p className="text-2xs text-text-secondary flex-1 min-w-[200px]">
            <strong className="text-text-primary">{daAllineare.length} voci</strong> hanno il
            preventivato ma non l&apos;effettivo, per {eur(daAllineare.reduce((n, c) => n + c.budget, 0))}:
            finché restano a zero il margine del mese risulta più alto del vero
          </p>
          <button onClick={() => onBulk('align', `${daAllineare.length} voci allineate al preventivato`,
              daAllineare.map(c => c.id))}
            disabled={pending}
            className="text-2xs font-bold px-3 py-1.5 rounded-lg bg-gold text-on-gold hover:opacity-90 press disabled:opacity-50">
            Allineale al preventivato
          </button>
        </div>
      )}

      {!locked && picked.size > 0 && (
        <div className="flex items-center gap-2 flex-wrap px-5 py-2.5 bg-gold-dim border-b border-gold/30">
          <span className="text-2xs font-semibold text-text-primary">
            {picked.size} selezionat{picked.size > 1 ? 'e' : 'a'}
          </span>
          <button onClick={() => onBulk('align', 'Effettivo allineato al preventivato')} disabled={pending} className={bulkBtn}>
            = preventivato
          </button>
          <button onClick={() => onBulk('paid', 'Segnate come pagate')} disabled={pending} className={bulkBtn}>Segna pagate</button>
          <button onClick={() => onBulk('unpaid', 'Segnate come non pagate')} disabled={pending} className={bulkBtn}>Non pagate</button>
          <button onClick={() => onBulk('zero', 'Effettivo azzerato')} disabled={pending} className={bulkBtn}>Azzera</button>
          <button onClick={() => { if (confirm(`Eliminare ${picked.size} voci?`)) onBulk('delete', 'Voci eliminate') }}
            disabled={pending}
            className="text-2xs font-semibold text-error border border-error/40 rounded-lg px-2.5 py-1.5 hover:bg-surface press">
            Elimina
          </button>
          <button onClick={() => setPicked(new Set())} className="ml-auto text-2xs font-semibold text-text-secondary hover:text-text-primary">
            Deseleziona
          </button>
        </div>
      )}

      {costs.length === 0 ? (
        <div className="p-5"><Empty>
          Nessuna uscita. «Prepara il mese» porta qui il piano dei costi, i subappalti e il costo dell&apos;organico.
        </Empty></div>
      ) : (
        <div>
          {/* Intestazione, gruppi e righe condividono COST_GRID: colonne diverse
              per tipo di riga sono colonne che non si possono confrontare, ed è
              esattamente il confronto che questa tabella serve a rendere possibile. */}
          <div style={COST_GRID}
            className="grid items-center gap-x-2 px-4 py-2 border-b border-border/60
                       text-2xs text-text-tertiary uppercase tracking-wider">
            <div className="flex justify-center">
              {!locked && (
                <Check on={allPicked} label="Seleziona tutte le voci"
                  onToggle={() => setPicked(allPicked ? new Set() : new Set(costs.map(c => c.id)))} />
              )}
            </div>
            <span className="truncate">Voce</span>
            <span className="text-center" title="Fisso o variabile">F/V</span>
            <span className="text-right">Preventivato</span>
            <span className="text-right">Effettivo</span>
            <span className="text-center">Pagato e prova</span>
            <span />
          </div>

          {groups.map(g => {
            const open = !closed.has(g.id)
            const delta = r2c(g.actual - g.budget)
            return (
              <div key={g.id || 'none'} className="border-b border-border/60 last:border-b-0">
                <button type="button" aria-expanded={open}
                  onClick={() => {
                    const n = new Set(closed)
                    if (n.has(g.id)) n.delete(g.id); else n.add(g.id)
                    setClosed(n)
                  }}
                  style={COST_GRID}
                  className={`w-full grid items-center gap-x-2 px-4 py-2.5 text-left hover:bg-surface-hover ${
                    g.id === '' ? 'bg-warning-dim' : 'bg-background'}`}>
                  <span className="flex justify-center">
                    <ChevronDown className={`w-4 h-4 text-text-tertiary transition-transform ${
                      open ? '' : '-rotate-90'}`} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex items-baseline gap-2">
                    {/* §261 — il nome dell'area si corregge da qui, dove lo si
                        legge. Prima bisognava andare in Costi e budget, e
                        un'area che si chiama male resta chiamata male: il posto
                        dove si nota un nome sbagliato è il posto dove si guarda
                        il totale, non quello dove si configura il piano.
                        Il gruppo «senza area» non ha un nome da correggere —
                        quelle righe hanno bisogno di un'area, non di un titolo. */}
                    {g.id && !locked ? (
                      <span onClick={e => e.stopPropagation()}>
                        <Draft value={g.label} label="Nome dell'area"
                          onSave={(v: string) => onRenameCenter(g.id, v)}
                          className="text-sm font-bold text-text-primary bg-transparent border-b
                                     border-transparent hover:border-border focus:border-border-interactive
                                     outline-none max-w-[16rem]" />
                      </span>
                    ) : (
                      <span className={`text-sm font-bold truncate ${
                        g.id === '' ? 'text-warning' : 'text-text-primary'}`}>{g.label}</span>
                    )}
                    <span className="text-2xs text-text-tertiary shrink-0">
                      {g.rows.length} {g.rows.length === 1 ? 'voce' : 'voci'}
                    </span>
                    {g.unpaid > 0 && (
                      <span className="text-2xs text-warning shrink-0 hidden sm:inline">
                        {eur(g.unpaid)} da pagare
                      </span>
                    )}
                  </span>
                  <span />
                  <span className="text-2xs text-text-tertiary tabular text-right">{eur(g.budget)}</span>
                  <span className="text-right">
                    <span className="block text-sm font-bold text-text-primary tabular">{eur(g.actual)}</span>
                    {Math.abs(delta) >= 1 && (
                      <span className={`block text-2xs tabular ${delta > 0 ? 'text-error' : 'text-success'}`}>
                        {delta > 0 ? '+' : '−'}{eur(Math.abs(delta))}
                      </span>
                    )}
                  </span>
                  <span className="flex justify-center">
                    {g.paid && (
                      <span className="text-success text-2xs font-bold" title="Tutte pagate"
                        aria-label="Tutte pagate">✓</span>
                    )}
                  </span>
                  <span />
                </button>

                {open && (
                  <ul>
                    {g.rows.map(c => {
                      const origin = originOf(c)
                      const scarto = r2c(c.actual - c.budget)
                      const cs = statusOf(c.id)
                      return (
                        <li key={c.id} style={COST_GRID}
                          className={`group grid items-center gap-x-2 px-4 py-1.5 border-t border-border/40
                                      hover:bg-surface-hover ${
                            picked.has(c.id) ? 'bg-gold-dim'
                              : cs && isLate(cs) ? BAND_TONE[cs.band].row : ''}`}>
                          <div className="flex justify-center">
                            {!locked && (
                              <Check on={picked.has(c.id)} label={`Seleziona ${c.label}`}
                                onToggle={() => toggle(c.id)} />
                            )}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-baseline gap-2">
                              <Text value={c.label} disabled={locked || !!origin}
                                onSave={v => onUpdate(c.id, { label: v })} />
                              {/* §224 — quando esce davvero. Il costo del lavoro
                                  di questo mese si paga il 20 del prossimo, e
                                  finché non lo si vede scritto sembra in ritardo. */}
                              {cs && <CashPill s={cs} disabled={locked} onDue={d => onDue(c.id, d)} />}
                              <CertMark c={certOf(c.id)} />
                            </div>
                            <div className="flex items-center gap-1.5 -mt-0.5">
                              <span className="text-2xs text-text-tertiary truncate">{c.category}</span>
                              {origin && (
                                <Link href={origin.href} title={`Il preventivato viene ${origin.label}: si corregge lì`}
                                  className="text-2xs text-info hover:underline shrink-0 flex items-center gap-0.5">
                                  <Lock className="w-2.5 h-2.5" aria-hidden="true" />{origin.label}
                                </Link>
                              )}
                              {!locked && (
                                <select value={c.center_id ?? ''} aria-label={`Area di ${c.label}`}
                                  onChange={e => onCenter(c.id, e.target.value || null)}
                                  className={`bg-transparent border-0 text-2xs max-w-[130px] cursor-pointer
                                              focus:bg-background rounded py-0 ${
                                    c.center_id
                                      ? 'text-text-tertiary opacity-0 group-hover:opacity-100 focus:opacity-100'
                                      : 'text-warning font-semibold'}`}>
                                  <option value="">senza area</option>
                                  {centers.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                                </select>
                              )}
                            </div>
                          </div>

                          <button type="button" disabled={locked}
                            onClick={() => onUpdate(c.id, { cost_type: c.cost_type === 'F' ? 'V' : 'F' })}
                            title={c.cost_type === 'F' ? 'Costo fisso: c\'è comunque' : 'Costo variabile: segue il lavoro venduto'}
                            className="text-2xs font-bold text-text-tertiary hover:text-text-primary
                                       disabled:hover:text-text-tertiary">
                            {c.cost_type}
                          </button>

                          {/* Preventivato: bloccato dove lo scrive la sua fonte */}
                          <div className="text-right">
                            {origin ? (
                              <span className="text-2xs text-text-tertiary tabular"
                                title={`Il preventivato viene ${origin.label}: si corregge lì`}>
                                {eur2(c.budget)}
                              </span>
                            ) : (
                              <Num value={c.budget} disabled={locked} money full
                                onSave={v => onUpdate(c.id, { budget: v })} />
                            )}
                          </div>

                          {/* Effettivo: sempre scrivibile, è il fatto */}
                          <div className="text-right">
                            <Num value={c.actual} disabled={locked} strong money full
                              onSave={v => onUpdate(c.id, { actual: v })} />
                            {c.actual === 0 && c.budget > 0 && !locked ? (
                              <button onClick={() => onUpdate(c.id, { actual: c.budget })}
                                className="block ml-auto text-2xs text-gold-text hover:underline">
                                = {eur(c.budget)}
                              </button>
                            ) : Math.abs(scarto) >= 1 ? (
                              <span className={`block text-2xs tabular ${scarto > 0 ? 'text-error' : 'text-success'}`}>
                                {scarto > 0 ? '+' : '−'}{eur(Math.abs(scarto))}
                              </span>
                            ) : null}
                          </div>

                          <div className="flex flex-col items-center gap-1">
                            <Check on={c.paid} disabled={locked} label={`${c.label} pagato`}
                              onToggle={() => onPayToggle(c.id, c.label,
                                Math.round((c.actual > 0 ? c.actual : c.budget)
                                  * (c.vat_applied ? 1 + c.vat_rate : 1) * 100) / 100, c.paid)} />
                            {/* §246 — «Uscito davvero dai conti» e «Uscite» devono
                                combaciare, e combaciano solo se ogni riga sa quale
                                movimento l'ha pagata. Su luglio erano 61 movimenti
                                e zero agganciati. */}
                            <MatchCell lineId={c.id} side="uscita" disabled={locked}
                              linked={linkedTx[c.id] ?? []} options={matchOptions[c.id] ?? []}
                              gross={Math.round((c.actual > 0 ? c.actual : c.budget)
                                * (c.vat_applied ? 1 + c.vat_rate : 1) * 100) / 100}
                              onAttach={ids => onAttach(c.id, ids)} onDetach={() => onDetach(c.id)} />
                            {/* §302 — il documento del fornitore, collegabile da
                                qui e non solo dentro il dialogo del pagamento.
                                §247 — se la riga è pagata e non ce l'ha, l'IVA
                                non si detrae e in verifica quel costo non si
                                difende: il caso resta segnalato, ma adesso ha
                                anche il gesto per chiuderlo. */}
                            {/* §307 — **una cosa sola per il documento.** Prima
                                ce n'erano due incolonnate — la cella e l'avviso
                                «senza fattura» — e in un mese chiuso diventavano
                                un trattino con una scritta sotto. Se il documento
                                c'è, o si può collegare, comanda la cella; se
                                manca e non c'è niente da collegare, comanda
                                l'avviso. Mai entrambe. */}
                            {invoiceOf[c.id] || (invoiceOptions[c.id] ?? []).length > 0 ? (
                              <InvoiceCell inv={invoiceOf[c.id]} disabled={locked}
                                options={invoiceOptions[c.id] ?? []}
                                gross={Math.round((c.actual > 0 ? c.actual : c.budget)
                                  * (c.vat_applied ? 1 + c.vat_rate : 1) * 100) / 100}
                                onLink={invId => onLinkInvoice(c.id, invId)}
                                onUnlink={() => onUnlinkInvoice(c.id)} />
                            ) : c.paid ? (
                              <Link href="/economics/fatturazione"
                                title="Pagata e nessun documento con questo importo: caricala o scrivila a mano in Fatturazione"
                                className="text-2xs font-semibold text-warning hover:underline whitespace-nowrap">
                                senza fattura
                              </Link>
                            ) : null}
                          </div>

                          <div className="flex justify-center">
                            <RemoveButton
                              check={canRemove({
                                side: 'uscita', paid: c.paid, paid_on: c.paid_on,
                                invoiced: !!withInvoice[c.id], installment_id: c.installment_id,
                              }, !locked)}
                              label={c.label} hideWhenBlocked={locked}
                              onRemove={() => onDelete(c.id, c.label)} />
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* §224 — le uscite maturate prima che nessuno ha ancora pagato */}
      <CarryBlock side="uscita" items={carry} moved={carryMoved} showMoved={showMoved}
        onPaid={onPaidCarry} onDue={onDue}
        onRemove={id => onDelete(id, carry.find(x => x.id === id)?.title ?? 'la voce')} />

      {!locked && (
        <div className="px-5 py-3 border-t border-border flex items-center gap-4 flex-wrap">
          <button onClick={onAdd} disabled={pending}
            className="flex items-center gap-1.5 text-2xs font-semibold text-gold-text hover:opacity-80">
            <Plus className="w-3.5 h-3.5" />Voce di costo
          </button>
          <button onClick={onSyncPlan} disabled={pending}
            className="flex items-center gap-1.5 text-2xs font-semibold text-text-secondary hover:text-text-primary">
            <RotateCcw className="w-3.5 h-3.5" />Riallinea i preventivati al piano
          </button>
          <p className="text-2xs text-text-tertiary basis-full">
            Le voci col lucchetto hanno il preventivato scritto dalla loro fonte — piano dei costi,
            organico, movimenti — e si correggono lì, poi si riallinea. L&apos;effettivo si scrive
            sempre qui: quello lo sa solo chi ha visto la fattura
          </p>
        </div>
      )}
    </section>
  )
}

const r2c = (n: number) => Math.round(n * 100) / 100

/**
 * Le colonne delle uscite, una volta sola.
 *
 * Selezione · voce · F/V · preventivato · effettivo · pagato · elimina. La usano
 * l'intestazione, le righe di gruppo e le righe di voce: se ognuna avesse le sue
 * larghezze i numeri non starebbero incolonnati, e due numeri che non si toccano
 * non si confrontano.
 */
const COST_GRID = {
  /* §261 — la colonna dello stato era 2,25rem e ci dovevano stare la casella,
     il chip del movimento e «senza fattura»: si accavallavano sull'importo, che
     è il numero che si legge per primo. Ora ha lo spazio che serve, e i tre
     pezzi stanno incolonnati invece che sovrapposti. */
  gridTemplateColumns: '2rem minmax(0,1fr) 1.5rem 6.5rem 7rem 8.5rem 1.5rem',
} as const

function SubBadge({ status }: { status: 'pianificato' | 'nel mese' | 'pagato' | 'orfano' | 'scostato' }) {
  const ui = {
    pagato: { t: 'pagato', c: 'bg-success-dim text-success' },
    'nel mese': { t: 'nel mese', c: 'bg-info-dim text-info' },
    pianificato: { t: 'da portare', c: 'bg-surface-active text-text-tertiary' },
    scostato: { t: 'scostato', c: 'bg-warning-dim text-warning' },
    orfano: { t: 'senza patto', c: 'bg-error/15 text-error' },
  }[status]
  return <span className={`shrink-0 px-1.5 py-0.5 rounded font-semibold ${ui.c}`}>{ui.t}</span>
}

// ═══════════════════════════════════════════════════════════════════════════
// §202 — Ripartizione del maturato
// ═══════════════════════════════════════════════════════════════════════════

type Slice = {
  key: string
  label: string
  value: number
  /** il colore, come classe di sfondo */
  tone: string
  /** una riga sola che dice cos'è. Non due, non un paragrafo */
  hint: string
}

/**
 * Dove vanno i soldi del mese, in tre letture.
 *
 * Prima era una barra con la legenda a capo e sotto due paragrafi rossi: le
 * percentuali c'erano, ma per capire *cosa* fosse una voce bisognava sapere già la
 * risposta. Qui ogni voce ha **una riga di spiegazione**, e le tre viste
 * rispondono a tre domande diverse:
 *
 *   · **tutto** — come si chiude l'imponibile del mese. Sette voci che non si
 *     sovrappongono e fanno il totale: è la vista che dimostra che i conti tornano.
 *   · **growth** — come il piano divide l'imponibile growth: 15/30/35/10/10, e
 *     chiude al 100% da sola.
 *   · **digital** — prima il subappalto, poi il margine diviso fra commerciale,
 *     soci, struttura e cassa. Anche questa chiude da sola.
 *
 * Passare il mouse su una voce la accende nella barra e spegne le altre: è il modo
 * più corto di rispondere a «quale pezzo è questo».
 */
function Distribution({ t: accrual, tCash, config, mode }: {
  t: PlTotals; tCash: PlTotals; config: PlConfig
  /* §210 — la lettura non si sceglie più qui: è quella della pagina. Due
     selettori per la stessa domanda davano due risposte contemporaneamente, e
     dai quattro numeri in cima non si capiva quale delle due stessero seguendo. */
  mode: 'maturato' | 'incassato'
}) {
  const [view, setView] = useState<'tutto' | 'growth' | 'digital'>('tutto')
  const [hover, setHover] = useState<string | null>(null)
  const t = mode === 'incassato' ? tCash : accrual

  const k = useMemo(() => {
    const of = (kind: 'growth' | 'digital') => {
      const own = t.lines.filter(x => x.line.kind === kind)
      const s = (f: (x: (typeof own)[number]) => number) =>
        r2c(own.reduce((n, x) => n + f(x), 0))
      return {
        base: s(x => x.s.base), external: s(x => x.s.external), margin: s(x => x.s.margin),
        sales: s(x => x.s.sales), delivery: s(x => x.s.delivery),
        costTarget: s(x => x.s.costTarget), riskFund: s(x => x.s.riskFund),
        residual: s(x => x.s.residual), residualToPartners: s(x => x.s.residualToPartners),
        partnersPool: s(x => x.s.partnersPool), companyQuota: s(x => x.s.companyQuota),
        retained: s(x => x.s.retained),
      }
    }
    return { growth: of('growth'), digital: of('digital') }
  }, [t])

  const { total, slices, note } = useMemo(() => {
    if (view === 'growth') {
      const g = k.growth
      return {
        total: g.base,
        note: 'Le cinque quote fanno il 100% dell’imponibile growth: è il piano, non un consuntivo.',
        slices: [
          { key: 'g-sales', label: 'Commerciale', value: g.sales, tone: 'bg-info',
            hint: `${pc(config.growth_sales_pct)} a chi ha portato il cliente. Senza commerciale si divide fra i soci.` },
          { key: 'g-erog', label: 'Erogato ai soci', value: g.delivery, tone: 'bg-accent',
            hint: `${pc(config.growth_delivery_pct)} in parti uguali: sul growth il lavoro lo fanno i soci.` },
          { key: 'g-target', label: 'Target costi', value: g.costTarget, tone: 'bg-error',
            hint: `${pc(config.cost_target_pct)} stanziato per persone, software e sede. È un obiettivo, non una spesa.` },
          { key: 'g-risk', label: 'Fondo rischio', value: g.riskFund, tone: 'bg-orange',
            hint: `${pc(config.risk_fund_pct)} messo da parte per i mesi che vanno male.` },
          { key: 'g-res', label: 'Residuo', value: g.residual, tone: 'bg-success',
            hint: config.growth_residual_to_company
              ? 'Resta in cassa TwoBee.' : 'Si divide fra i soci.' },
        ].filter(x => x.value > 0) as Slice[],
      }
    }
    if (view === 'digital') {
      const d = k.digital
      return {
        total: d.base,
        note: 'Prima si paga chi ha erogato, poi si divide quello che resta: il ricavo lordo non è distribuibile.',
        slices: [
          { key: 'd-ext', label: 'Subappalti', value: d.external, tone: 'bg-orange',
            hint: 'Il lavoro affidato fuori: esce dal margine prima di ogni quota, perché è già di qualcun altro.' },
          { key: 'd-sales', label: 'Commerciale', value: d.sales, tone: 'bg-info',
            hint: `${pc(config.digital_sales_pct)} del margine.` },
          { key: 'd-partners', label: 'Ai soci', value: d.partnersPool, tone: 'bg-gold',
            hint: `${pc(config.digital_partner_pct)} del margine a ciascuno, non da spartire.` },
          { key: 'd-target', label: 'Struttura', value: d.costTarget, tone: 'bg-error',
            hint: `${pc(config.digital_cost_target_pct)} del margine per coprire persone, software e sede.` },
          { key: 'd-company', label: 'Cassa TwoBee', value: d.companyQuota, tone: 'bg-success',
            hint: `${pc(config.digital_company_pct)} del margine che resta all’azienda.` },
          { key: 'd-risk', label: 'Fondo rischio', value: d.riskFund, tone: 'bg-orange',
            hint: `Attivo su alcune righe: ${pc(config.digital_risk_fund_pct)} del margine, ${pc(config.digital_risk_cut_pct)} in meno a ciascun socio.` },
          { key: 'd-retained', label: 'Non assegnato', value: d.retained, tone: 'bg-border-strong',
            hint: 'Le quote non fanno 100%: succede con un numero di soci diverso da tre.' },
        ].filter(x => x.value > 0) as Slice[],
      }
    }
    return {
      /* La base è l'imponibile **intero**, lo stesso numero della scorecard: prima
         era al netto delle partite di giro e i due non si trovavano. L'anticipo
         non è distribuibile, ma non per questo va sottratto in silenzio: diventa
         una fetta col suo nome, e la barra chiude sul totale vero. */
      total: t.revenue.accrued,
      note: 'Le voci non si sovrappongono e fanno l’imponibile: è la vista che dimostra che i conti tornano.',
      slices: [
        { key: 'sales', label: 'Commerciale', value: t.plan.sales, tone: 'bg-info',
          hint: `${pc(config.growth_sales_pct)} sul growth e ${pc(config.digital_sales_pct)} sul margine digital, a chi ha portato il cliente.` },
        { key: 'erog', label: 'Erogato growth ai soci', value: t.plan.delivery, tone: 'bg-accent',
          hint: `${pc(config.growth_delivery_pct)} dell’imponibile growth, in parti uguali.` },
        { key: 'res', label: 'Residuo ai soci', value: t.plan.residualToPartners, tone: 'bg-accent',
          hint: 'Il residuo growth quando i soci lo dividono invece di lasciarlo in cassa.' },
        { key: 'dig', label: 'Digital ai soci', value: t.plan.digitalPartners, tone: 'bg-gold',
          hint: `${pc(config.digital_partner_pct)} del margine a ciascun socio — margine, non ricavo.` },
        { key: 'ext', label: 'Subappalti', value: t.costs.external, tone: 'bg-orange',
          hint: 'Lavori affidati fuori: già tolti dal margine dei loro progetti.' },
        { key: 'struct', label: 'Costi di struttura', value: t.costs.structural, tone: 'bg-error',
          hint: 'Persone, software, sede: quello che c’è comunque, venduto o non venduto.' },
        { key: 'cassa', label: 'Cassa TwoBee', value: t.margin.company, tone: 'bg-success',
          hint: mode === 'incassato'
            ? 'Quello che resta di quanto è davvero entrato, meno quanto è davvero uscito: si muove con le spunte «pagato».'
            : 'Quello che resta sul maturato. Ci stanno dentro il fondo rischio e lo scostamento dal target costi.' },
        { key: 'giro', label: 'Partite di giro', value: t.plan.passThrough, tone: 'bg-info-dim',
          hint: 'Anticipo che torna al cliente — il budget pubblicitario: è fatturato e fa IVA, ma su di esso non si prende nessuna quota.' },
      ].filter(x => x.value !== 0) as Slice[],
    }
  }, [view, k, t, config, mode])

  const positives = slices.filter(x => x.value > 0)
  const negatives = slices.filter(x => x.value < 0)
  const used = r2c(positives.reduce((n, x) => n + x.value, 0))
  const scale = Math.max(total, used, 1)
  const rest = Math.max(0, r2c(total - used))
  const over = Math.max(0, r2c(used - total))
  const w = (v: number) => `${(v / scale) * 100}%`
  const dim = (key: string) => (hover && hover !== key ? 'opacity-30' : 'opacity-100')

  return (
    <section className="bg-surface border border-border rounded-2xl p-5 shadow-soft">
      <div className="flex items-end justify-between gap-3 mb-3 flex-wrap">
        <div>
          <h2 className="text-sm font-bold text-text-primary">
            Ripartizione dell&apos;{mode === 'incassato' ? 'incassato' : 'imponibile maturato'}
          </h2>
          <p className="text-2xs text-text-tertiary mt-0.5">{note}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
        {/* tre domande diverse, tre viste: ognuna chiude sulla sua base */}
        <div className="flex gap-1 bg-background border border-border rounded-xl p-1">
          {([
            ['tutto', 'Tutto', t.revenue.accrued],
            ['growth', 'Growth', k.growth.base],
            ['digital', 'Digital', k.digital.base],
          ] as const).map(([v, lab, amount]) => (
            <button key={v} onClick={() => { setView(v); setHover(null) }} aria-pressed={view === v}
              disabled={amount <= 0}
              className={`px-2.5 py-1 rounded-lg text-2xs font-semibold press disabled:opacity-30 ${
                view === v ? 'bg-gold text-on-gold' : 'text-text-secondary hover:bg-surface-hover'}`}>
              {lab} <span className={view === v ? 'opacity-80' : 'text-text-tertiary'}>{eur(amount)}</span>
            </button>
          ))}
        </div>
        </div>
      </div>

      {/* §307 — quattro righe di testo diventavano il primo blocco della sezione,
          prima di qualunque numero. Il fatto è uno: si stanno leggendo solo le
          righe spuntate, e quante sono. Il resto — che i compensi restano quelli
          del maturato (§204) — sta già scritto in fondo, dove parla dei compensi. */}
      {mode === 'incassato' && (
        <p className="text-2xs text-text-secondary mb-3 flex items-baseline gap-1.5 flex-wrap">
          <Info className="w-3 h-3 shrink-0 self-center text-info" aria-hidden="true" />
          <span>
            Solo le righe spuntate: <strong className="text-text-primary tabular">{eur(tCash.revenue.accrued)}</strong>
            {' '}incassati su {eur(accrual.revenue.accrued)} ·{' '}
            <strong className="text-text-primary tabular">{eur(tCash.costs.actual)}</strong>
            {' '}pagati su {eur(accrual.costs.actual)}
          </span>
        </p>
      )}

      {/* §203 — il margine, dove è la cosa che conta: sul digital è la base di ogni
          quota, e senza vederlo le percentuali sotto non si possono controllare. */}
      {view === 'digital' && k.digital.base > 0 && (
        <div className="rounded-xl border border-border bg-background px-3.5 py-2.5 mb-3">
          <p className="text-2xs text-text-secondary">
            Margine{' '}
            <strong className="text-sm text-text-primary tabular">{eur(k.digital.margin)}</strong>
            {' '}= ricavo {eur(k.digital.base)}
            {k.digital.external > 0 && <> − {eur(k.digital.external)} di subappalti</>}
            {' '}· è la base di ogni quota qui sotto
            {k.digital.base > 0 && (
              <span className="text-text-tertiary">
                {' '}({Math.round((k.digital.margin / k.digital.base) * 100)}% del ricavo)
              </span>
            )}
          </p>
        </div>
      )}

      {/* la barra: passando sopra una voce si accende solo quella */}
      <div className="relative flex h-4 rounded-full overflow-hidden bg-surface-active gap-px">
        {positives.map(x => (
          <button key={x.key} type="button"
            onMouseEnter={() => setHover(x.key)} onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(x.key)} onBlur={() => setHover(null)}
            aria-label={`${x.label}: ${eur(x.value)}`}
            className={`${x.tone} ${dim(x.key)} transition-opacity`}
            style={{ width: w(x.value) }} />
        ))}
        {/* §307 — quello che nessuna voce spiega ha un **nome e una riga**, e un
            colore suo. Era dipinto `bg-success`, lo stesso di «Cassa TwoBee»: due
            cose diverse con lo stesso colore, e il solo posto dove aveva un nome
            era un tooltip che galleggiava sopra l'elenco. Su un mese in lettura
            di cassa erano 7.232 € che sembravano un blocco verde qualunque. */}
        {rest > 0 && (
          <span className={`bg-border-strong ${dim('rest')} transition-opacity`}
            style={{ width: w(rest) }} aria-label={`Non ancora destinato: ${eur(rest)}`} />
        )}
        {over > 0 && (
          <span aria-hidden="true" className="absolute top-0 bottom-0 w-0.5 bg-text-primary"
            style={{ left: w(total) }}
            title={`Qui finisce il maturato: oltre la tacca ci sono ${eur(over)} scoperti`} />
        )}
      </div>

      {/* le voci: una riga ciascuna, con una riga di spiegazione */}
      <ul className="mt-3 divide-y divide-border/50">
        {[...positives, ...negatives, ...(rest > 0 ? [{
          key: 'rest', label: 'Non ancora destinato', value: rest, tone: 'bg-border-strong',
          hint: mode === 'incassato'
            ? 'Incassato che nessuna voce ha ancora preso: i costi di questo mese non sono tutti pagati, e finché non lo sono la loro quota resta qui.'
            : 'Imponibile che le quote non hanno assegnato: succede quando le percentuali del piano non fanno cento.',
        } as Slice] : [])].map(x => (
          <li key={x.key}
            onMouseEnter={() => setHover(x.key)} onMouseLeave={() => setHover(null)}
            className={`flex items-start gap-2.5 py-1.5 rounded-lg px-1 -mx-1 transition-colors ${
              hover === x.key ? 'bg-surface-hover' : ''}`}>
            <span className={`w-2.5 h-2.5 rounded-sm shrink-0 mt-1 ${
              x.value < 0 ? 'border border-error' : x.tone}`} aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="text-2xs font-semibold text-text-primary">{x.label}</span>
              <span className="block text-2xs text-text-tertiary leading-snug">{x.hint}</span>
            </span>
            <span className="text-right shrink-0">
              <span className={`block text-2xs font-bold tabular ${
                x.value < 0 ? 'text-error' : 'text-text-primary'}`}>{eur(x.value)}</span>
              {total > 0 && (
                <span className="block text-2xs text-text-tertiary tabular">{pc(x.value / total)}</span>
              )}
            </span>
          </li>
        ))}
      </ul>

      {over > 0 && (
        <p className="text-2xs text-error mt-2.5 flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            Destinato {eur(used)} su {eur(total)}: <strong>{eur(over)} scoperti</strong>. La tacca
            segna dove finisce il maturato — il margine digital è distribuito per intero e la
            struttura la deve coprire il growth.
          </span>
        </p>
      )}

      {/* Quattro numeri, e ognuno risponde a una domanda diversa: quanto metto da
          parte, quanto potevo spendere, quanto è rimasto lordo, quanto resta
          all'azienda. Prima l'etichetta portava anche la formula e in una colonna
          stretta andava a capo una parola per riga, spingendo il numero — la
          ragione per cui la scheda esiste — in fondo a una scheda mezza vuota. */}
      {view === 'tutto' && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mt-4">
          <Mini icon={<ShieldAlert className="w-3.5 h-3.5 text-orange" />}
            label="Fondo rischio" value={eur(t.plan.riskFund)}
            hint={`${pc(config.risk_fund_pct)} del growth, messi da parte`} />

          <Mini icon={<Target className="w-3.5 h-3.5 text-text-tertiary" />}
            label="Target costi" value={eur(t.costs.target)}
            hint={`${pc(config.cost_target_pct)} del growth${
              config.digital_cost_target_pct > 0
                ? ` + ${pc(config.digital_cost_target_pct)} del margine digital` : ''}`}
            /* «−8.593 €» da solo non dice di cosa parla: sforato o risparmiato è
               la differenza fra un allarme e una buona notizia. */
            extra={<span className={t.costs.variance < 0 ? 'text-error' : 'text-success'}>
              {t.costs.variance < 0
                ? `sforato di ${eur(-t.costs.variance)}`
                : `${eur(t.costs.variance)} sotto il target`}
            </span>} />

          <Mini icon={<Wallet className="w-3.5 h-3.5 text-gold-text" />}
            label="Margine lordo" value={eur(t.margin.gross)} negative={t.margin.gross < 0}
            hint="maturato meno tutti i costi usciti"
            extra={t.revenue.accrued > 0
              ? <span className={t.margin.gross < 0 ? 'text-error' : 'text-success'}>
                  {pc(t.margin.gross / t.revenue.accrued)} sulle entrate
                </span>
              : undefined} />

          <Mini icon={<Building2 className="w-3.5 h-3.5 text-gold-text" />}
            label="Cassa TwoBee" value={eur(t.margin.company)} negative={t.margin.company < 0}
            hint={t.margin.company < 0
              ? 'quello che resta del mese: qui è scoperto'
              : 'quello che resta del mese'}
            extra={t.plan.digitalCompany > 0
              ? <span className="text-text-tertiary">di cui {eur(t.plan.digitalCompany)} dal digital</span>
              : undefined} />
        </div>
      )}

      <p className="text-2xs text-text-tertiary mt-3">
        Il fondo rischio e lo scostamento dal target stanno dentro «Cassa TwoBee»: sono destinazioni
        di quello che resta, non prelievi in più.{' '}
        <Link href="/economics/banca" className="text-info hover:underline">
          Il cumulato e il ponte col saldo in banca
        </Link>{' '}dicono quanto è rimasto per davvero.
      </p>
    </section>
  )
}
