/**
 * Tenuta di cassa — calcoli puri, nessun I/O. (§225, §233)
 *
 * Il conto economico dice se il mese ha prodotto margine. Non dice se i soldi
 * ci sono, e sono due domande che si rispondono con numeri diversi: un mese può
 * chiudere in utile e lasciarti senza un euro sul conto il 20, perché il margine
 * è **imponibile e di competenza** mentre dal conto esce il **lordo, quando
 * scade**. Questa sezione mette i due mondi nella stessa schermata: il saldo
 * vero della banca contro quello che questo mese deve ancora far uscire.
 *
 * **La scala ha due metà, e non sono simmetriche** (§233). Prima tutto quello
 * che esce comunque — uscite scoperte, IVA, compensi maturati — e sotto quello
 * che *potrebbe* entrare. L'ordine non è estetico: le uscite sono certe, gli
 * incassi no, e mescolarli in un'unica sequenza faceva sembrare un fatto una
 * speranza. Il fondo della prima metà (`floor`) è il numero che conta: dice
 * dove arrivi **se nessuno paga**, che è l'unica cosa che dipende da te.
 *
 * **Un arretrato non è un incasso atteso** (§233). Una fattura ancora in
 * scadenza la paga il cliente che paga sempre; una scaduta da cinquanta giorni
 * è una telefonata da fare, e sommarle in un unico «se incassi tutto» dava un
 * numero che nessuno poteva usare. Da qui i **tre esiti** in testa: se non
 * incassi niente · se pagano i puntuali · se rientrano anche gli arretrati.
 *
 * **L'IVA è la leva, e va detta.** L'IVA che i clienti pagano entra in banca e
 * resta lì fino alla liquidazione: nel frattempo paga fornitori e stipendi. È
 * legittimo e lo fanno tutti, ma non è capitale — è un debito con una data.
 * Perciò si toglie sempre, e la riga dichiara **se scade in questo mese**
 * (`vatDueInMonth`): ad agosto è un bonifico da fare il 20, a settembre è un
 * accantonamento da non spendere. Sono due cose diverse e la scala lo scrive,
 * perché un'azienda in utile che resta senza soldi ha quasi sempre contato
 * l'IVA due volte, una come cassa e una come margine.
 */

import { monthOf, endOfMonth, daysBetween } from '@/lib/cash-calendar'
import { shiftMonth } from '@/lib/pl'
import { eur } from '@/lib/money'

export type RunwayLine = {
  id: string
  label: string
  side: 'entrata' | 'uscita'
  /** **lordo**: dal conto passa il totale della fattura, IVA compresa */
  gross: number
  /** quando è attesa: la calcola `dueOf`, qui arriva già decisa */
  due: string
  /** mese di competenza, per dire da dove viene un arretrato */
  month: string
}

/** Una scadenza fiscale che pesa sulla cassa: IVA, e domani le imposte. */
export type CashDue = { date: string; amount: number; label: string }

export type StepKey = 'ora' | 'paghi' | 'iva' | 'compensi' | 'puntuali' | 'arretrati'

export type Scenario = {
  key: StepKey
  label: string
  balance: number
  /** cosa è stato aggiunto o tolto rispetto al gradino prima */
  delta: number
  /**
   * `obbligo` esce comunque · `incasso` può non arrivare. Non è una sfumatura:
   * è la ragione per cui i due blocchi non si sommano nello stesso totale.
   */
  kind: 'saldo' | 'obbligo' | 'incasso'
  /** quante righe ci sono dietro il delta, dove la domanda ha senso */
  count: number
  why: string
}

export type RunwayMonth = {
  month: string
  inflow: number
  outflow: number
  vat: number
  net: number
  balance: number
  /** quanto viene da righe già registrate: il resto è contratti e piano */
  fromOpen: number
  /**
   * §225 — la parte **stimata** dell'uscita: il costo del lavoro dei mesi che
   * nessuno ha ancora aperto. Il piano dei costi non lo contiene (§184: l'area
   * Personale la scrive l'organico, non il piano), quindi senza questa stima un
   * mese futuro sembrerebbe costare novemila euro in meno di quanto costerà.
   * È dichiarata riga per riga, non nascosta dentro il totale.
   */
  estimated: number
  /** §227 — compensi a soci e commerciali che escono in questo mese */
  payouts: number
  /** true = il mese è già aperto nel conto economico, quindi non si somma il piano */
  open: boolean
}

/** Uno dei tre esiti in testa: stesso mese, tre risposte a «e se». */
export type Outcome = {
  key: 'floor' | 'expected' | 'best'
  title: string
  value: number
  hint: string
}

export type Runway = {
  balance: number
  /** quota del saldo che è IVA incassata dai clienti e non ancora versata */
  vatHeld: number
  vatDeadline: string | null
  vatLabel: string
  vatDays: number | null
  /** §233 — la scadenza cade entro il mese guardato: è un bonifico, non un fondo */
  vatDueInMonth: boolean
  /** uscite scoperte entro il mese: certe, si pagano comunque */
  toPayGross: number
  toPayCount: number
  lateOut: number
  lateOutCount: number
  /** §233 — incassi **non ancora scaduti**: il cliente che paga sempre paga */
  dueIn: number
  dueInCount: number
  /** §233 — incassi **già scaduti**: quelli non arrivano da soli */
  lateIn: number
  lateInCount: number
  /** giorni di ritardo del credito più vecchio: zero se non ce n'è */
  lateInOldest: number
  toCollectGross: number
  toCollectCount: number
  /** §227 — compensi maturati e non ancora erogati: non sono righe di costo */
  payoutsOpen: number
  /** §227 — da quale mese si contano: prima c'è un mese chiuso, ed è liquidato */
  payoutsSince: string | null
  /** dove arrivi **se nessuno paga**: uscite, IVA e compensi tolti */
  floor: number
  /** e se pagano quelli ancora in scadenza */
  expected: number
  /** e se rientrano anche gli arretrati */
  best: number
  /** §227 — fino all'IVA il conto reggeva: sono i compensi a portarlo sotto */
  holdsWithoutPayouts: boolean
  /**
   * §237 — la stessa scala **senza** erogare i compensi.
   *
   * È l'unica voce della scala che si può spostare: l'IVA ha una data e le
   * fatture dei fornitori pure, i compensi no — «la decisione è quando, non
   * se». Perciò è anche l'ultimo gradino, ed è l'unico con un interruttore:
   * quello che si vuole sapere è **quanto respiro dà rimandarli**, e senza il
   * secondo numero quel respiro te lo devi calcolare a mente.
   *
   * `null` quando non c'è niente da erogare: un interruttore che non cambia
   * niente è peggio di un interruttore assente.
   */
  alt: { floor: number; expected: number; best: number; verdict: Runway['verdict'] } | null
  outcomes: Outcome[]
  scenarios: Scenario[]
  /** `negativo` = non ci arrivi nemmeno incassando tutto · `stretto` = dipendi dai clienti · `regge` */
  verdict: 'negativo' | 'stretto' | 'regge'
  headline: string
  months: RunwayMonth[]
  /** il primo mese che chiude sotto zero, se accade */
  breaks: string | null
  lowest: { month: string; balance: number } | null
}

const r2 = (n: number) => Math.round(n * 100) / 100
const sum = (xs: number[]) => r2(xs.reduce((a, b) => a + b, 0))
/* '2026-08-20' → '20 agosto': una data ISO dentro una frase si legge come un
   codice, e chi la incontra si ferma a decifrarla invece di leggere la frase. */
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']
const giorno = (iso: string) => {
  const [, m, d] = iso.split('-').map(Number)
  return `${d} ${MESI[(m ?? 1) - 1]}`
}
const nonNeg = (n: number) => (n > 0 ? n : 0)
const plur = (n: number, one: string, many: string) => (n === 1 ? one : many)

export function cashRunway(i: {
  month: string
  today: string
  /** saldo **reale**: solo i movimenti veri della banca, più le aperture */
  balance: number
  /** tutte le righe scoperte, di qualunque mese, con la loro scadenza */
  open: RunwayLine[]
  /** i mesi che verranno secondo contratti e piano, IVA inclusa */
  planned: { month: string; cashIn: number; cashOut: number; open: boolean }[]
  /** le scadenze fiscali che cadranno: IVA per trimestre */
  dues: CashDue[]
  /** IVA a debito già maturata: è dentro il saldo e non è tua */
  vatHeld: number
  vatDeadline: string | null
  vatLabel: string
  vatDays?: number | null
  /**
   * §225 — quanto costa il lavoro in un mese, uscita di cassa. Serve ai mesi
   * futuri **non ancora aperti**: il piano dei costi non contiene l'area
   * Personale (§184), quindi senza questo il previsionale prometterebbe una
   * cassa che non c'è. Si applica al mese k solo se il mese k−1 non ha righe
   * registrate — perché il costo del lavoro di un mese esce in quello dopo, e
   * dove le righe ci sono è già contato.
   */
  payroll?: number
  /**
   * §227 — i compensi **maturati e non ancora erogati**, da `payoutViews`.
   *
   * Mancavano, ed era il buco più grosso della sezione: i compensi non sono
   * righe di conto economico — non si scrivono, si ricalcolano — quindi «se
   * paghi tutto» pagava fornitori, stipendi e subappalti e **non** i soci né i
   * commerciali. Sul conto vero valgono 22.237 € contro un margine di cassa di
   * 15.205: senza questa riga la sezione diceva «regge» a un mese che non
   * regge.
   *
   * §227 — nel rotolo dei mesi entra con `byMonth`: il compenso di un mese esce
   * in **quello dopo**, come il costo del lavoro, e i bonifici già usciti sono
   * imputati dal più vecchio. `since` dice da quando si conta — prima c'è un
   * mese chiuso, e chiudere un mese ne liquida i compensi.
   */
  payouts?: {
    open: number; people: number; never: number
    byMonth?: { month: string; amount: number }[]
    since?: string | null
  }
  horizon?: number
}): Runway {
  const m = monthOf(i.month)
  const end = endOfMonth(m)

  /* Quello che **questo mese** deve vedere passare dal conto: le righe che
     scadono entro la fine del mese, arretrati compresi. Un arretrato non è di
     un altro mese, è di adesso: è la bolletta che qualcuno doveva pagare e non
     ha pagato, e la cassa la sente oggi. */
  const dueByEnd = i.open.filter(l => l.due <= end)
  const outs = dueByEnd.filter(l => l.side === 'uscita')
  const ins = dueByEnd.filter(l => l.side === 'entrata')

  /* §233 — la riga divide gli incassi in due, e la divisione è la parte utile:
     una fattura ancora nei termini la paga il cliente che paga sempre, una
     scaduta da cinquanta giorni è una telefonata. Un unico «se incassi tutto»
     le prometteva uguali. */
  const lateOf = (l: RunwayLine) => l.due < i.today
  const outsLate = outs.filter(lateOf)
  const insLate = ins.filter(lateOf)
  const insOnTime = ins.filter(l => !lateOf(l))

  const toPayGross = sum(outs.map(l => l.gross))
  const lateOut = sum(outsLate.map(l => l.gross))
  const lateIn = sum(insLate.map(l => l.gross))
  const dueIn = sum(insOnTime.map(l => l.gross))
  const toCollectGross = r2(dueIn + lateIn)
  const lateInOldest = insLate.reduce((n, l) => Math.max(n, daysBetween(l.due, i.today)), 0)

  const vatHeld = r2(nonNeg(i.vatHeld))
  /* Se la scadenza cade entro il mese è un bonifico da fare, altrimenti è un
     fondo da non toccare. Si toglie in tutti e due i casi — non sono soldi tuoi
     nemmeno il giorno prima — ma chiamarli con lo stesso nome fa preparare il
     bonifico sbagliato. */
  const vatDueInMonth = !!i.vatDeadline && i.vatDeadline <= end && vatHeld > 0
  const payoutsOpen = r2(nonNeg(i.payouts?.open ?? 0))

  const afterPay = r2(i.balance - toPayGross)
  const afterVat = r2(afterPay - vatHeld)
  const floor = r2(afterVat - payoutsOpen)
  const expected = r2(floor + dueIn)
  const best = r2(expected + lateIn)

  // ── la scala: prima quello che esce comunque, poi quello che può entrare ───
  const scenarios: Scenario[] = [{
    key: 'ora', label: 'Sul conto adesso', balance: r2(i.balance), delta: 0,
    kind: 'saldo', count: 0,
    why: 'Saldo reale: solo i movimenti arrivati dall\'estratto conto, non le spunte.',
  }]

  if (outs.length > 0) {
    scenarios.push({
      key: 'paghi', label: 'Paghi tutte le uscite scoperte',
      balance: afterPay, delta: r2(-toPayGross), kind: 'obbligo', count: outs.length,
      why: `${outs.length} ${plur(outs.length, 'uscita scoperta', 'uscite scoperte')} entro il mese, IVA inclusa`
        + (lateOut > 0
          ? `, di cui ${eur(lateOut)} su ${outsLate.length} già ${plur(outsLate.length, 'scaduta', 'scadute')}.`
          : '.')
        + ' Non è uno scenario: queste escono comunque.',
    })
  }

  if (vatHeld > 0) {
    scenarios.push({
      key: 'iva',
      label: vatDueInMonth ? `Versi l'IVA del ${i.vatLabel}` : `Metti da parte l'IVA del ${i.vatLabel}`,
      balance: afterVat, delta: r2(-vatHeld), kind: 'obbligo', count: 0,
      why: vatDueInMonth
        ? `${eur(vatHeld)} già incassati dai clienti per conto dello Stato, e in questo mese scadono: `
          + `il ${i.vatDeadline ? giorno(i.vatDeadline) : 'giorno della liquidazione'} vanno versati. `
          + 'Fino a lì finanziano fornitori e stipendi, ma non sono capitale.'
        : `${eur(vatHeld)} già incassati dai clienti per conto dello Stato. In questo mese **non** si versano `
          + `— la scadenza è il ${i.vatDeadline ? giorno(i.vatDeadline) : 'giorno della liquidazione'} — `
          + 'ma sono sul conto e non sono tuoi: spenderli è prenderli a prestito.',
    })
  }

  /* §227 — quello che spetta a chi ha lavorato. Non è una spesa che si può
     decidere di non fare — è già maturata — ma non ha una scadenza come l'IVA:
     la decisione è **quando**, non se. Per questo sta in fondo agli obblighi e
     lo dice. */
  if (payoutsOpen > 0.5) {
    const p = i.payouts!
    scenarios.push({
      key: 'compensi', label: 'Eroghi i compensi maturati',
      balance: floor, delta: r2(-payoutsOpen), kind: 'obbligo', count: p.people,
      why: `${eur(payoutsOpen)} spettano a ${p.people} fra soci e commerciali per lavoro già consegnato. `
        + 'Non sono righe del conto economico — non si scrivono, si ricalcolano — per questo non compaiono '
        + 'in nessun costo.'
        + (p.never > 0
          ? ` ${p.never} ${plur(p.never, 'persona non ha', 'persone non hanno')} mai ricevuto un bonifico.`
          : '')
        + ' A differenza dell\'IVA non hanno una data: la scelta è quando, non se.',
    })
  }

  if (dueIn > 0) {
    scenarios.push({
      key: 'puntuali', label: 'Incassi quello che non è ancora scaduto',
      balance: expected, delta: dueIn, kind: 'incasso', count: insOnTime.length,
      why: `${insOnTime.length} ${plur(insOnTime.length, 'fattura ancora nei termini', 'fatture ancora nei termini')} `
        + `per ${eur(dueIn)} IVA inclusa. Chi paga di solito paga: è la parte credibile di quello che deve entrare.`,
    })
  }

  if (lateIn > 0) {
    scenarios.push({
      key: 'arretrati', label: 'E rientrano anche gli arretrati',
      balance: best, delta: lateIn, kind: 'incasso', count: insLate.length,
      why: `${insLate.length} ${plur(insLate.length, 'incasso già scaduto', 'incassi già scaduti')} per ${eur(lateIn)}`
        + (lateInOldest > 0 ? `, il più vecchio da ${lateInOldest} giorni` : '')
        + '. Questi non arrivano da soli: è la telefonata da fare, non una previsione.',
    })
  }

  // ── i tre esiti, in testa: la stessa domanda con tre risposte ─────────────
  const outcomes: Outcome[] = [{
    key: 'floor', title: 'Se non incassi niente', value: floor,
    hint: 'dopo uscite'
      + (vatHeld > 0 ? ', IVA' : '')
      + (payoutsOpen > 0.5 ? ' e compensi' : '')
      + ' · è la parte che dipende da te',
  }]
  if (dueIn > 0) {
    outcomes.push({
      key: 'expected', title: 'Se pagano i puntuali', value: expected,
      hint: `${insOnTime.length} ${plur(insOnTime.length, 'fattura ancora nei termini', 'fatture ancora nei termini')} `
        + `per ${eur(dueIn)}`,
    })
  }
  if (lateIn > 0) {
    outcomes.push({
      key: 'best', title: 'Se rientrano gli arretrati', value: best,
      hint: `${insLate.length} ${plur(insLate.length, 'scaduto', 'scaduti')} per ${eur(lateIn)}`
        + (lateInOldest > 0 ? `, il più vecchio da ${lateInOldest} giorni` : ''),
    })
  }

  // ── il verdetto ────────────────────────────────────────────────────────────
  const verdict: Runway['verdict'] = best < 0 ? 'negativo' : floor < 0 ? 'stretto' : 'regge'
  const holdsWithoutPayouts = floor < 0 && afterVat >= 0 && payoutsOpen > 0.5
  /* Il caso da spiegare bene: fino all'IVA il conto regge, sono i compensi a
     farlo cadere. Dirlo come «negativo» e basta farebbe cercare un problema che
     non c'è, e la risposta giusta non è tagliare una spesa: è scegliere quando
     erogare. */
  const perColpaDeiCompensi = holdsWithoutPayouts
    ? ` Fino all'IVA il conto regge: sono i **${eur(payoutsOpen)} di compensi maturati** a portarlo sotto, `
      + 'e quella non è una spesa da decidere — è già maturata, si sceglie solo quando erogarla.'
    : ''

  const headline = best < 0
    ? `Anche incassando tutto, arretrati compresi, mancano ${eur(-best)} per chiudere il mese.`
      + perColpaDeiCompensi
    : expected < 0
      ? `Il mese chiude **solo se rientrano gli arretrati**: ${eur(lateIn)} già scaduti, e senza quelli `
        + `resti sotto di ${eur(-expected)}. Non è una previsione, è una telefonata da fare.`
        + perColpaDeiCompensi
      : floor < 0
        ? `Senza incassare niente il conto va sotto di ${eur(-floor)}; con le ${insOnTime.length} fatture `
          + `ancora nei termini torna a ${eur(expected)}. Il mese regge, ma **dipende dai clienti**.`
          + perColpaDeiCompensi
        : `Regge anche se nessuno paga: restano ${eur(floor)} dopo le uscite`
          + (vatHeld > 0 ? (vatDueInMonth ? ', l\'IVA versata' : ', l\'IVA accantonata') : '')
          + (payoutsOpen > 0.5 ? ' e i compensi erogati.' : '.')

  // ── il rotolo dei mesi ────────────────────────────────────────────────────
  const horizon = i.horizon ?? 6
  const plannedBy = new Map(i.planned.map(p => [monthOf(p.month), p]))
  const months: RunwayMonth[] = []
  let run = i.balance
  let breaks: string | null = null
  let lowest: { month: string; balance: number } | null = null

  for (let k = 0; k < horizon; k++) {
    const mk = shiftMonth(m, k)
    const mEnd = endOfMonth(mk)
    /* Gli scoperti già scaduti pesano sul **primo** mese del rotolo: lasciarli
       nel mese in cui erano attesi li farebbe sparire dalla curva, che è
       esattamente il posto dove servono. */
    const belongs = (l: RunwayLine) => (k === 0 ? l.due <= mEnd : monthOf(l.due) === mk)
    const own = i.open.filter(belongs)
    const openIn = sum(own.filter(l => l.side === 'entrata').map(l => l.gross))
    const openOut = sum(own.filter(l => l.side === 'uscita').map(l => l.gross))

    /* Sul mese già aperto nel conto economico le righe ci sono: sommarci anche
       il piano conterebbe due volte lo stesso canone. */
    const p = plannedBy.get(mk)
    const planIn = p && !p.open ? p.cashIn : 0
    const planOut = p && !p.open ? p.cashOut : 0

    /* Il costo del lavoro di un mese esce in quello dopo (§224). Dove il mese
       prima ha righe registrate è già dentro `open`; dove non ce le ha nessuno
       lo conta, e il piano non lo prevede — allora si stima e lo si dice. */
    const prevOpen = k === 0 || plannedBy.get(shiftMonth(m, k - 1))?.open === true
    const estimated = k > 0 && !prevOpen ? r2(i.payroll ?? 0) : 0

    /* §227 — i compensi maturati che escono in questo mese. Non sono righe di
       costo — non si scrivono, si ricalcolano — quindi senza questa somma il
       rotolo prometteva una cassa che i soci devono ancora prendersi. */
    const payoutOut = sum((i.payouts?.byMonth ?? [])
      .filter(x => (k === 0 ? monthOf(x.month) <= mk : monthOf(x.month) === mk))
      .map(x => x.amount))

    const vat = sum(i.dues.filter(d => monthOf(d.date) === mk).map(d => d.amount))
    const inflow = r2(openIn + planIn)
    const outflow = r2(openOut + planOut + estimated + payoutOut)
    const net = r2(inflow - outflow - vat)
    run = r2(run + net)

    months.push({
      month: mk, inflow, outflow, vat, net, balance: run,
      fromOpen: r2(openIn - openOut), estimated, payouts: payoutOut, open: !!p?.open,
    })
    if (run < 0 && !breaks) breaks = mk
    if (!lowest || run < lowest.balance) lowest = { month: mk, balance: run }
  }

  /* §237 — i tre esiti se i compensi si rimandano. Non spariscono: restano da
     erogare, e sono i primi soldi che escono appena entra qualcosa. */
  const alt = payoutsOpen > 0.5
    ? {
        floor: afterVat,
        expected: r2(afterVat + dueIn),
        best: r2(afterVat + dueIn + lateIn),
        verdict: (r2(afterVat + dueIn + lateIn) < 0 ? 'negativo'
          : afterVat < 0 ? 'stretto' : 'regge') as Runway['verdict'],
      }
    : null

  return {
    balance: r2(i.balance),
    vatHeld, vatDeadline: i.vatDeadline, vatLabel: i.vatLabel,
    vatDays: i.vatDays ?? null, vatDueInMonth,
    toPayGross, toPayCount: outs.length, lateOut, lateOutCount: outsLate.length,
    dueIn, dueInCount: insOnTime.length,
    lateIn, lateInCount: insLate.length, lateInOldest,
    toCollectGross, toCollectCount: ins.length,
    payoutsOpen, payoutsSince: i.payouts?.since ?? null,
    floor, expected, best, holdsWithoutPayouts, alt,
    outcomes, scenarios, verdict, headline, months, breaks, lowest,
  }
}
