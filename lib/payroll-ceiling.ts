/**
 * Quanto costa **davvero** una persona al mese — calcoli puri, nessun I/O. (§235)
 *
 * `personCost` risponde a «quanto costa in media», partendo dal contratto: RAL,
 * aliquote di listino, dodicesimi. Serve a preventivare un'assunzione che non
 * c'è ancora, e su chi lavora già è la risposta sbagliata — perché il contratto
 * non sa delle trasferte, non sa che l'apprendista paga il 3,11% e non il
 * 30%, e non sa che a dicembre esce una mensilità in più.
 *
 * Qui si parte dai **documenti**: il cedolino dice le competenze, l'imponibile e
 * il TFR maturato; l'F24 dice quanto è uscito davvero di contributi. E si
 * risponde a una domanda diversa: **quanto devo mettere da parte ogni mese
 * perché nessun mese mi sorprenda.**
 *
 * Tre numeri, e sono tre cose diverse:
 *
 *   · **ordinario** — il mese normale, quello che il cedolino descrive.
 *   · **punta** — il mese peggiore dell'anno, quello con la mensilità in più.
 *     Un budget costruito sull'ordinario va sotto proprio a dicembre, che è il
 *     mese in cui va sotto anche la cassa.
 *   · **tetto** — l'annuo diviso dodici. È il numero da mettere a budget: più
 *     alto dell'ordinario, più basso della punta, e sommato dodici volte fa
 *     esattamente quello che uscirà.
 *
 * **Quello che non è un costo si toglie e si dice.** L'indennità della L.
 * 207/2024 esce nella busta ma rientra come credito nell'F24 (a giugno 2026:
 * 75,25 + 31,79 = 107,04, ed è esattamente il credito del modello). Contarla
 * come costo del personale gonfia il conto economico di soldi che tornano
 * indietro il mese dopo.
 *
 * **Le trasferte sono un rimborso, non retribuzione**: escono dal conto e vanno
 * a budget, ma sono variabili — 57 € a giugno per uno, 213 € per l'altra — e
 * confonderle col costo fisso fa sembrare strutturale una cosa che dipende da
 * quanti clienti si vanno a trovare. Nel tetto ci sono, in riga separata.
 */

import type { PayrollParams, Payslip, F24, ContractKind } from '@/lib/payroll'
import { contractSpec } from '@/lib/payroll'

const r2 = (n: number) => Math.round(n * 100) / 100
const nonNeg = (n: number) => (n > 0 ? n : 0)

/**
 * La banda in cui un'aliquota datore ordinaria può stare nel terziario.
 * Fuori di qui il numero non è un'aliquota: è un errore di trascrizione o un
 * F24 che contiene altro (conguagli, rate, sanzioni), e va detto invece di
 * spalmato su qualcuno.
 */
export const EMPLOYER_BAND = { min: 0.24, max: 0.36 }

export type SplitPerson = {
  personId: string
  kind: ContractKind
  /** imponibile previdenziale del mese, dal cedolino */
  base: number
  /** trattenuta previdenziale del lavoratore, dal cedolino */
  employee: number
  /** aliquota datore applicata: nota per l'apprendista, ricavata per gli altri */
  rate: number
  /** contributi a carico azienda attribuiti a questa persona */
  employer: number
  /**
   * `f24` = ricavato dal modello del mese · `legge` = aliquota di legge, e per
   * un apprendista o un tirocinio è un fatto, non una stima · `listino` = il
   * parametro di configurazione, che è l'unica vera supposizione.
   */
  source: 'f24' | 'legge' | 'listino'
}

export type EmployerSplit = {
  people: SplitPerson[]
  /** l'aliquota ordinaria **ricavata** dall'F24, non quella di listino */
  rateOrdinary: number
  /** quanto dell'INPS del modello resta dopo trattenute e apprendisti */
  residual: number
  /** true = l'aliquota ricavata sta nella banda e la ripartizione tiene */
  reconciled: boolean
  why: string
}

/**
 * §182 diceva «l'F24 non si ripartisce», ed è ancora vero: il modello è
 * aggregato e non nomina nessuno. Ma **può confermare una ripartizione**, ed è
 * un'altra cosa.
 *
 * Il totale INPS del DM10 è la somma di quattro pezzi di cui tre si conoscono
 * dai cedolini: le trattenute dei lavoratori, i contributi dell'apprendista
 * (aliquota di legge per anno, 3,11% il primo) e lo zero dei tirocini. Quello
 * che resta è il datore sugli ordinari, e diviso per il loro imponibile dà
 * l'aliquota vera — a giugno 2026: (802,00 − 246,62 − 43,82) / 1.730,00 =
 * **29,57%**, dove il listino diceva 30%.
 *
 * Il controllo è che l'aliquota ricavata stia in una banda plausibile. Se non
 * ci sta, il modello contiene altro e la ripartizione **non si fa**: si torna
 * all'aliquota di listino e la riga lo dichiara. Un numero ricavato per
 * differenza assorbe qualunque cosa ci sia dentro, e senza il controllo la
 * sanzione di un ritardato versamento diventerebbe il costo di una persona.
 */
export function splitEmployer(input: {
  slips: Payslip[]
  kinds: Map<string, ContractKind>
  /** l'aliquota di legge dell'apprendista, per anno: la sa già `apprenticeRate` */
  apprenticeRates?: Map<string, number>
  f24: F24 | null
  params: PayrollParams
}): EmployerSplit {
  const { slips, kinds, f24, params } = input

  const kindOf = (s: Payslip) => kinds.get(s.personId) ?? 'indeterminato'
  const rateOf = (s: Payslip) => {
    const k = kindOf(s)
    if (k === 'apprendistato') {
      return input.apprenticeRates?.get(s.personId) ?? params.inpsApprenticeY1Pct
    }
    return contractSpec(k).employment === 'subordinato' ? params.inpsEmployerPct : 0
  }

  const ordinary = slips.filter(s => kindOf(s) !== 'apprendistato'
    && contractSpec(kindOf(s)).employment === 'subordinato')
  const apprentices = slips.filter(s => kindOf(s) === 'apprendistato')

  const baseOrdinary = r2(ordinary.reduce((n, s) => n + s.contributoryBase, 0))
  /* Solo chi versa INPS entra nel confronto col DM10: la trattenuta di un
     tirocinante non ci passa, e sottrarla farebbe alzare l'aliquota di chi
     resta per un contributo che il modello non contiene. */
  const employeeInDm10 = r2([...ordinary, ...apprentices].reduce((n, s) => n + s.employeeContrib, 0))
  const apprenticeEmployer = r2(apprentices.reduce((n, s) => n + s.contributoryBase * rateOf(s), 0))

  const residual = f24 ? r2(f24.inps - employeeInDm10 - apprenticeEmployer) : 0
  const derived = f24 && baseOrdinary > 0 ? residual / baseOrdinary : 0
  const inBand = derived >= EMPLOYER_BAND.min && derived <= EMPLOYER_BAND.max
  const reconciled = !!f24 && baseOrdinary > 0 && inBand

  const rateOrdinary = reconciled ? Math.round(derived * 10000) / 10000 : params.inpsEmployerPct

  const people: SplitPerson[] = slips.map(s => {
    const k = kindOf(s)
    const isOrdinary = k !== 'apprendistato' && contractSpec(k).employment === 'subordinato'
    const rate = isOrdinary ? rateOrdinary : rateOf(s)
    /* Distinzione che cambia cosa scrive la pagina: il 3,11% dell'apprendista al
       primo anno e lo zero del tirocinio **sono di legge**, e chiamarli stima
       farebbe cercare una conferma che non serve. La supposizione vera è una
       sola: l'aliquota ordinaria presa dal parametro invece che dal modello. */
    const source: SplitPerson['source'] = isOrdinary
      ? (reconciled ? 'f24' : 'listino')
      : 'legge'
    return {
      personId: s.personId, kind: k, base: s.contributoryBase,
      employee: s.employeeContrib, rate,
      employer: r2(s.contributoryBase * rate),
      source,
    }
  })

  const why = !f24
    ? 'Nessun F24 per questo mese: i contributi datore restano quelli di listino.'
    : baseOrdinary === 0
      ? 'Nessun dipendente ordinario in questo mese: non c\'è un\'aliquota da ricavare.'
      : reconciled
        ? `Aliquota ricavata dal modello: ${(rateOrdinary * 100).toFixed(2).replace('.', ',')}% `
          + `(INPS ${fmt(f24.inps)} − trattenute ${fmt(employeeInDm10)} − apprendisti ${fmt(apprenticeEmployer)} `
          + `su ${fmt(baseOrdinary)} di imponibile).`
        : `L'aliquota che ne uscirebbe è ${(derived * 100).toFixed(2).replace('.', ',')}%, fuori dalla banda `
          + `${EMPLOYER_BAND.min * 100}–${EMPLOYER_BAND.max * 100}%: il modello contiene altro (conguagli, rate, `
          + 'sanzioni) e la ripartizione non si fa. Vale il listino.'

  return { people, rateOrdinary, residual, reconciled, why }
}

const fmt = (n: number) => `${Math.round(n)} €`

// ── il tetto ────────────────────────────────────────────────────────────────

export type CeilingRow = {
  label: string
  amount: number
  kind: 'retribuzione' | 'contributi' | 'inail' | 'tfr' | 'rimborso' | 'giro'
  /** da dove viene: un documento, l'F24, o una stima dichiarata */
  source: 'cedolino' | 'f24' | 'stima'
}

export type Ceiling = {
  personId: string
  who: string
  /** §236 — il netto promesso alla persona: il pavimento vero del costo */
  targetNet: number | null
  /** quanto manca al netto concordato: va aggiunto, non è una scelta */
  topUp: number
  /** la parte di trasferte e bonus che serve ad arrivare al patto: struttura */
  guaranteed: number
  /** quello che si è dato **oltre** il patto: l'unica parte davvero comprimibile */
  compressible: number
  /** `cedolino` = letto dai documenti · `contratto` = nessun cedolino, si stima */
  basis: 'cedolino' | 'contratto'
  /** il mese normale, tutto compreso, al netto delle partite di giro */
  ordinary: number
  /** parte che non cambia: retribuzione, contributi, TFR */
  fixed: number
  /** rimborsi e trasferte: escono davvero, ma cambiano ogni mese */
  variable: number
  /** mensilità aggiuntive erogate a parte (non ratealizzate nel mese) */
  extraMonths: number
  /** quanto costa una di quelle mensilità, tutto compreso */
  extraCost: number
  /** il mese peggiore dell'anno */
  peak: number
  /** **il numero da mettere a budget**: annuo diviso dodici */
  monthly: number
  yearly: number
  /** anticipi che rientrano (L. 207/2024): escono dalla busta, non sono costo */
  passThrough: number
  rows: CeilingRow[]
  /** cosa non viene da un documento, in chiaro */
  estimates: string[]
}

/**
 * Il tetto di una persona, dal suo cedolino.
 *
 * **Le mensilità aggiuntive si contano dai ratei, non dal contratto.** Se il
 * cedolino porta un rateo di quattordicesima, quella mensilità è già dentro
 * l'imponibile di ogni mese e non va aggiunta; quelle che il contratto prevede e
 * il cedolino non ratealizza escono in un mese solo, e valgono **dodici volte il
 * rateo** — che è come il consulente le calcola. Michele: 128,48 × 12 = 1.541,76,
 * cioè 168 ore alla sua paga oraria. Contare due volte la quattordicesima
 * sarebbe l'errore facile, e sarebbe un errore da 1.500 € l'anno a testa.
 */
export function monthlyCeiling(input: {
  person: {
    id: string; name: string; kind: ContractKind; months: number
    /**
     * §236 — il netto concordato. Su Michele e Sabrina trasferte e bonus non
     * sono un extra: sono **lo strumento** con cui si arriva a 1.500 e 1.600
     * netti. Trattarli come variabili faceva sembrare comprimibile la parte
     * che tiene in piedi il patto — e il primo mese senza trasferte la persona
     * si trova in busta duecento euro in meno di quelli promessi.
     */
    targetNet?: number | null
  }
  slip: Payslip
  /** contributi datore del mese: dall'F24 ripartito se c'è, altrimenti stimati */
  employer: number
  /** `f24` · `legge` (apprendista, tirocinio) · `listino` (l'unica supposizione) */
  employerSource: 'f24' | 'legge' | 'listino'
  params: PayrollParams
}): Ceiling {
  const { person, slip, params } = input
  const spec = contractSpec(person.kind)
  const estimates: string[] = []

  const base = slip.contributoryBase
  const employer = r2(nonNeg(input.employer))
  if (input.employerSource === 'listino' && employer > 0) {
    estimates.push('contributi datore dall\'aliquota di configurazione: '
      + 'nessun F24 del mese da cui ricavarla')
  }

  /* L'INAIL non passa dal DM10: si versa con l'autoliquidazione, una volta
     l'anno. Finché il documento non c'è resta una stima, e va detto — è piccola,
     ma una stima taciuta dentro un numero che si chiama «tetto» lo rende falso. */
  const inail = slip.inail ?? (spec.inail ? r2(base * params.inailPct) : 0)
  if (slip.inail == null && spec.inail && inail > 0) {
    estimates.push(`INAIL stimato allo ${(params.inailPct * 100).toFixed(2).replace('.', ',')}%: `
      + 'il tasso vero lo dice l\'autoliquidazione')
  }

  /* Quello che esce dalla busta ma rientra: l'indennità della L. 207/2024 si
     recupera come credito nell'F24. È una partita di giro, e nel costo non ci
     va — ma nella busta sì, quindi non si può semplicemente ignorarla. */
  const passThrough = r2(nonNeg(slip.allowances))

  const variable = r2(nonNeg(slip.travel) + nonNeg(slip.reimbursements))

  /* §236 — quanto di quelle trasferte serve ad arrivare al netto promesso.
     Sono esenti, quindi tolte dalla busta il netto scende di altrettanto: la
     parte che copre il patto è **struttura**, e solo l'eccedenza si può
     comprimere. Sui tre cedolini di giugno la parte comprimibile è zero — sono
     tutte lì per far tornare il netto. */
  const targetNet = person.targetNet && person.targetNet > 0 ? r2(person.targetNet) : null
  const netWithout = r2(slip.netPaid - variable)
  const needed = targetNet ? Math.max(0, r2(targetNet - netWithout)) : 0
  const guaranteed = targetNet ? Math.min(variable, needed) : 0
  const compressible = r2(variable - guaranteed)
  /* Quello che ancora manca al patto: non è una spesa da decidere, è una
     promessa scoperta. Va nel tetto o il tetto non è un tetto. */
  const topUp = targetNet ? Math.max(0, r2(targetNet - slip.netPaid)) : 0
  if (topUp > 0) {
    estimates.push(`mancano ${fmt(topUp)} al netto concordato di ${fmt(targetNet!)}: `
      + 'nel tetto ci sono, come rimborso esente. Erogati come bonus in busta costerebbero circa il doppio')
  }

  /* La retribuzione **non** è l'imponibile previdenziale: su un tirocinio
     l'imponibile è zero e l'indennità è ottocento euro, e leggere il costo
     dall'imponibile faceva costare zero una persona che si paga tutti i mesi.
     Si parte dal totale delle competenze e si tolgono le cose che competenze non
     sono — rimborsi e partite di giro. Sui tre cedolini di giugno torna al
     centesimo con l'imponibile di chi ce l'ha. */
  const pay = r2(nonNeg(slip.totalEarnings - variable - passThrough))
  const fixed = r2(pay + employer + inail + slip.otherEmployer + slip.tfrAccrued)
  const ordinary = r2(fixed + variable + topUp)

  /* Le mensilità che il cedolino **non** ratealizza: quelle escono tutte in un
     mese, e sono la ragione per cui un budget fatto sull'ordinario salta
     proprio a dicembre. */
  const ratei = [slip.thirteenth, slip.fourteenth].filter(x => x > 0)
  const extraMonths = Math.max(0, Math.round(person.months) - 12 - ratei.length)
  /* Una mensilità vale dodici volte il rateo: è il modo in cui la calcola il
     consulente, e si legge dal cedolino invece di ricostruirla dalla RAL. */
  const extraGross = ratei.length
    ? r2(Math.max(...ratei) * 12)
    : r2(pay)
  const extraRate = base > 0 ? employer / base : 0
  const extraTfr = pay > 0 && slip.tfrAccrued > 0 ? r2(extraGross * (slip.tfrAccrued / pay)) : 0
  const extraCost = extraMonths > 0
    ? r2(extraGross * (1 + extraRate + params.inailPct) + extraTfr)
    : 0
  if (extraMonths > 0 && !ratei.length) {
    estimates.push('mensilità aggiuntiva stimata pari a un mese di imponibile: '
      + 'il cedolino non porta un rateo da cui leggerla')
  }

  const yearly = r2(ordinary * 12 + extraCost * extraMonths)
  const monthly = r2(yearly / 12)
  const peak = r2(ordinary + extraCost)

  const rows: CeilingRow[] = [
    { label: 'Retribuzione', amount: pay, kind: 'retribuzione', source: 'cedolino' },
    ...(employer > 0
      ? [{ label: 'Contributi a carico azienda', amount: employer, kind: 'contributi' as const,
          source: (input.employerSource === 'f24' ? 'f24'
            : input.employerSource === 'legge' ? 'cedolino' : 'stima') as CeilingRow['source'] }]
      : []),
    ...(inail > 0 ? [{ label: 'INAIL', amount: inail, kind: 'inail' as const,
      source: (slip.inail == null ? 'stima' : 'cedolino') as CeilingRow['source'] }] : []),
    ...(slip.otherEmployer > 0
      ? [{ label: 'Altri oneri datore', amount: slip.otherEmployer, kind: 'contributi' as const, source: 'cedolino' as const }]
      : []),
    ...(slip.tfrAccrued > 0
      ? [{ label: 'TFR maturato', amount: slip.tfrAccrued, kind: 'tfr' as const, source: 'cedolino' as const }]
      : []),
    ...(guaranteed > 0
      ? [{ label: 'Trasferte a copertura del netto concordato', amount: guaranteed,
          kind: 'rimborso' as const, source: 'cedolino' as const }]
      : []),
    ...(compressible > 0
      ? [{ label: 'Trasferte oltre il netto concordato', amount: compressible,
          kind: 'rimborso' as const, source: 'cedolino' as const }]
      : []),
    ...(topUp > 0
      ? [{ label: 'Da aggiungere per arrivare al netto concordato', amount: topUp,
          kind: 'rimborso' as const, source: 'stima' as const }]
      : []),
    ...(passThrough > 0
      ? [{ label: 'Indennità recuperata in F24', amount: passThrough, kind: 'giro' as const, source: 'cedolino' as const }]
      : []),
  ]

  return {
    personId: person.id, who: person.name, basis: 'cedolino',
    targetNet, topUp, guaranteed, compressible,
    ordinary, fixed, variable: r2(variable + topUp), extraMonths, extraCost, peak, monthly, yearly,
    passThrough, rows, estimates,
  }
}

export type CeilingTotals = {
  people: Ceiling[]
  /** somma dei tetti: quanto mettere a budget ogni mese per il personale */
  monthly: number
  yearly: number
  /** il mese peggiore, se tutte le mensilità aggiuntive cadono insieme */
  peak: number
  /** trasferte, rimborsi e integrazioni: escono davvero, quasi mai si tagliano */
  variable: number
  /** §236 — la sola parte davvero comprimibile: quella oltre il netto promesso */
  compressible: number
  /** quanto manca, in tutto, ai netti concordati */
  topUp: number
  /** partite di giro escluse dal costo */
  passThrough: number
  /** quante persone hanno almeno una voce stimata */
  estimated: number
}

export function ceilingTotals(people: Ceiling[]): CeilingTotals {
  const sum = (f: (c: Ceiling) => number) => r2(people.reduce((n, c) => n + f(c), 0))
  return {
    people,
    monthly: sum(c => c.monthly),
    yearly: sum(c => c.yearly),
    peak: sum(c => c.peak),
    variable: sum(c => c.variable),
    compressible: sum(c => c.compressible),
    topUp: sum(c => c.topUp),
    passThrough: sum(c => c.passThrough),
    estimated: people.filter(c => c.estimates.length > 0).length,
  }
}
