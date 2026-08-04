/**
 * Fiscale e controllo tasse — calcoli puri, nessun I/O.
 *
 * Cosa fa: mette insieme quello che il conto economico sa già (fatturato, IVA,
 * costi, incassi) e ne ricava le tre cose che servono per non trovarsi
 * scoperti — **quando** si paga, **quanto**, e **quanto hai messo da parte**.
 *
 * Cosa non fa: il commercialista. L'imponibile fiscale non è il margine
 * civilistico — deducibilità parziali, ammortamenti, riprese in aumento e
 * diminuzione lo cambiano. Qui si producono stime dichiarate come tali, con
 * l'assunzione scritta accanto a ogni numero. Le scadenze sono quelle ordinarie
 * per una SRL con anno solare: proroghe e casi particolari si verificano.
 *
 * Il valore vero non è la stima: è l'anticipo. Sapere a marzo che a giugno
 * escono trentamila euro cambia le decisioni di marzo.
 */

import { shiftMonth } from '@/lib/pl'
import type { QuarterVat } from '@/lib/vat'
import {
  maxiDeduction, hyperAmortization, relevantMeasures, expiredMeasures,
  type CompanyMeasure,
} from '@/lib/incentives'

export type TaxConfig = {
  ires_pct: number
  irap_pct: number
  irap_applies: boolean
  set_aside_pct: number
  irap_addback_pct: number
  /** §184 — maggiorazione della deduzione sul costo dei nuovi assunti (solo IRES) */
  maxi_deduction_pct: number
  maxi_deduction_protected_pct: number
  /** iper-ammortamento 2026: maggiorazione nella prima fascia di investimento */
  hyper_amort_pct: number
  hyper_amort_cap: number
}

/**
 * L'IRES resta al 24%: l'aliquota premiale al 20% valeva solo il 2025 e la legge
 * di bilancio 2026 non l'ha prorogata. Metterla qui come default farebbe stimare
 * imposte più basse del vero, che è il tipo di errore che si scopre a giugno.
 */
export const DEFAULT_TAX_CONFIG: TaxConfig = {
  ires_pct: 0.24, irap_pct: 0.039, irap_applies: true,
  set_aside_pct: 0.30, irap_addback_pct: 0,
  maxi_deduction_pct: 0.2, maxi_deduction_protected_pct: 0.3,
  hyper_amort_pct: 1.8, hyper_amort_cap: 2_500_000,
}

export type Provision = { id: string; month: string; kind: 'iva' | 'imposte'; amount: number; note: string | null }

// ── Scadenzario ──────────────────────────────────────────────────────────────

export type DeadlineKind = 'iva' | 'imposte' | 'dichiarazione'

export type Deadline = {
  id: string
  date: string
  label: string
  detail: string
  kind: DeadlineKind
  /** importo quando è calcolabile: le dichiarazioni non ne hanno uno */
  amount: number | null
  daysLeft: number
  past: boolean
}

const days = (from: string, to: string) =>
  Math.round((new Date(to + 'T00:00:00').getTime() - new Date(from + 'T00:00:00').getTime()) / 86400000)

/**
 * Il calendario di una SRL con anno solare, regime IVA trimestrale.
 *
 * Gli importi IVA arrivano dal motore delle liquidazioni; quelli delle imposte
 * dalla stima sull'anno in corso — e sono stime, quindi si dicono tali.
 */
export function fiscalCalendar(
  year: number, today: string, vat: QuarterVat[], estimate: TaxEstimate | null,
): Deadline[] {
  const out: Deadline[] = []
  const at = (date: string, id: string, label: string, detail: string, kind: DeadlineKind, amount: number | null = null) => {
    out.push({ id, date, label, detail, kind, amount, daysLeft: days(today, date), past: days(today, date) < 0 })
  }

  // liquidazioni IVA: importi veri, non stime
  for (const q of vat) {
    if (q.deferred) continue
    at(q.deadline, `iva-${q.quarter.year}-${q.quarter.q}`,
      `Liquidazione IVA ${q.label}`,
      q.annual
        ? 'Il quarto trimestre si versa con la dichiarazione annuale, senza l\'1%.'
        : `Saldo del trimestre più l'1% dell'opzione trimestrale.`,
      'iva', q.toPay > 0 ? q.toPay : null)
  }

  // comunicazioni liquidazioni periodiche: non si paga, ma si dimentica
  const lipe: [string, string][] = [
    [`${year}-05-31`, '1º trimestre'], [`${year}-09-30`, '2º trimestre'],
    [`${year}-11-30`, '3º trimestre'], [`${year + 1}-02-28`, '4º trimestre'],
  ]
  for (const [date, q] of lipe) {
    at(date, `lipe-${date}`, `Comunicazione LIPE ${q}`,
      'Comunicazione dei dati delle liquidazioni periodiche: non è un versamento, ma la sanzione c\'è.',
      'dichiarazione')
  }

  at(`${year}-12-27`, 'acconto-iva', 'Acconto IVA',
    'Si calcola col metodo storico (88% del versamento di dicembre o del 4º trimestre precedente), previsionale o analitico. Se dicembre sarà più leggero dell\'anno scorso, il previsionale costa meno.',
    'iva')

  if (estimate) {
    // saldo dell'anno prima + primo acconto: è la data che svuota la cassa
    at(`${year}-06-30`, 'saldo-acconto', 'Saldo imposte + 1º acconto',
      'Saldo IRES/IRAP dell\'anno precedente e primo acconto (40%) su quello in corso. È la scadenza che pesa di più.',
      'imposte', estimate.total > 0 ? Math.round(estimate.total * 0.4) : null)
    at(`${year}-11-30`, 'secondo-acconto', '2º acconto imposte',
      'Secondo acconto (60%) sull\'anno in corso.',
      'imposte', estimate.total > 0 ? Math.round(estimate.total * 0.6) : null)
  }

  at(`${year}-04-30`, 'dich-iva', 'Dichiarazione IVA annuale',
    'Riepilogo dell\'anno precedente.', 'dichiarazione')
  at(`${year}-10-31`, 'dich-redditi', 'Dichiarazione dei redditi',
    'Redditi SC e IRAP dell\'anno precedente.', 'dichiarazione')

  return out.sort((a, b) => a.date.localeCompare(b.date))
}

// ── Stima delle imposte ──────────────────────────────────────────────────────

export type TaxEstimate = {
  /** mesi di conto economico effettivamente registrati */
  monthsBooked: number
  revenueYtd: number
  costsYtd: number
  marginYtd: number
  /** §191 — quanto dei costi non abbassa l'imponibile */
  nonDeductibleCosts: number
  /** margine proiettato a fine anno sulla media dei mesi registrati */
  marginProjected: number
  /** deduzioni extracontabili che valgono solo ai fini IRES (maxi-deduzione) */
  extraDeductions: number
  /** base IRES: margine proiettato meno le deduzioni extracontabili */
  iresBase: number
  ires: number
  irap: number
  total: number
  /** quanto mettere via ogni mese da qui a fine anno per arrivarci coperti */
  monthlySetAside: number
}

/**
 * Le imposte dell'anno, proiettate.
 *
 * Base: il margine dei mesi registrati, portato a dodici mesi sulla media.
 * Non è l'imponibile fiscale — quello lo fa il commercialista — ma sbaglia
 * per difetto o per eccesso di poco, e serve a sapere l'ordine di grandezza
 * con nove mesi d'anticipo invece che con nove mesi di ritardo.
 */
export function estimateTaxes(
  revenueYtd: number, costsYtd: number, monthsBooked: number, cfg: TaxConfig, monthsLeft: number,
  /**
   * Deduzioni extracontabili dell'anno: la maxi-deduzione sulle nuove assunzioni
   * e la maggiorazione da iper-ammortamento. Non passano dal conto economico —
   * si applicano in dichiarazione — e valgono **solo ai fini IRES**: sulla base
   * IRAP non incidono, e sommarle lì darebbe un'imposta più bassa del vero.
   */
  extraDeductions = 0,
  /**
   * §191 — la parte dei costi che le imposte non riconoscono: il 25% dei pasti, il
   * 80% del carburante a uso promiscuo, la spesa non inerente. È già uscita dalla
   * cassa ma non abbassa l'imponibile, quindi va **riaggiunta** al margine prima
   * di proiettarlo: senza, la stima promette un'imposta più bassa di quella che
   * arriverà, ed è il tipo di sorpresa che si scopre a giugno.
   */
  nonDeductibleCosts = 0,
): TaxEstimate {
  const deducible = Math.round((costsYtd - Math.max(0, nonDeductibleCosts)) * 100) / 100
  const marginYtd = Math.round((revenueYtd - deducible) * 100) / 100
  const projected = monthsBooked > 0
    ? Math.round((marginYtd / monthsBooked) * 12 * 100) / 100
    : 0

  const base = Math.max(0, projected)
  const extra = Math.max(0, extraDeductions)
  const iresBase = Math.max(0, base - extra)
  const ires = Math.round(iresBase * cfg.ires_pct)
  // base IRAP più larga: il costo del personale non è del tutto deducibile
  const irapBase = base + Math.max(0, deducible) * cfg.irap_addback_pct
  const irap = cfg.irap_applies ? Math.round(irapBase * cfg.irap_pct) : 0
  const total = ires + irap

  return {
    monthsBooked, revenueYtd, costsYtd, marginYtd,
    nonDeductibleCosts: Math.max(0, nonDeductibleCosts),
    marginProjected: projected,
    extraDeductions: extra, iresBase,
    ires, irap, total,
    monthlySetAside: monthsLeft > 0 ? Math.round(total / monthsLeft) : total,
  }
}

// ── Accantonamenti ───────────────────────────────────────────────────────────

export type SetAside = {
  iva: number
  imposte: number
  total: number
  /** quanto servirebbe avere da parte oggi */
  neededIva: number
  neededTaxes: number
  needed: number
  gap: number
  coveredPct: number
}

export function setAsideStatus(
  provisions: Provision[], vatDue: number, taxEstimate: number, monthsBooked: number,
): SetAside {
  const iva = provisions.filter(p => p.kind === 'iva').reduce((s, p) => s + p.amount, 0)
  const imposte = provisions.filter(p => p.kind === 'imposte').reduce((s, p) => s + p.amount, 0)
  // delle imposte dell'anno serve, a oggi, la quota dei mesi già maturati
  const neededTaxes = Math.round(taxEstimate * (Math.min(12, monthsBooked) / 12))
  const needed = Math.round(vatDue + neededTaxes)
  const total = Math.round((iva + imposte) * 100) / 100

  return {
    iva, imposte, total,
    neededIva: Math.round(vatDue), neededTaxes, needed,
    gap: Math.round(needed - total),
    coveredPct: needed > 0 ? total / needed : 1,
  }
}

// ── Diagnosi e ottimizzazioni ────────────────────────────────────────────────

export type TaxFinding = {
  id: string
  severity: 'critico' | 'attenzione' | 'opportunità'
  title: string
  detail: string
  action?: string
  /** quanto vale, quando è quantificabile */
  value?: number
}

const eur = (n: number) => `€${Math.round(n).toLocaleString('it-IT')}`
const pc = (n: number) => `${Math.round(n * 100)}%`

export type TaxInput = {
  today: string
  vat: QuarterVat[]
  nextVat: QuarterVat | null
  estimate: TaxEstimate
  aside: SetAside
  /** costi dell'anno su cui NON è stata segnata l'IVA */
  costsWithoutVat: number
  costsWithVat: number
  /** IVA già dovuta su fatture non ancora incassate */
  vatOnUnpaid: number
  /** quota del fatturato dell'anno concentrata nell'ultimo trimestre */
  q4Share: number
  /** voci di piano che parlano di formazione, welfare, R&D */
  hasWelfare: boolean
  hasTraining: boolean
  rndSpend: number
  deadlines: Deadline[]

  // ── §184: quello che le agevolazioni stanno già facendo (o non facendo) ─────
  /** aliquota IRES in uso: serve a tradurre una deduzione in imposta */
  iresPct?: number
  /** assunzioni a tempo indeterminato dell'anno e loro costo */
  newHires?: number
  newHiresCost?: number
  /** quota di quel costo che riguarda categorie meritevoli di maggior tutela */
  protectedCost?: number
  /** contributi non versati quest'anno grazie agli esoneri */
  contribRelief?: number
  /** esoneri che il tool vede disponibili e non attivati */
  reliefAvailable?: number
  /** persone in regime impatriati */
  impatriates?: number
  /** investimenti in beni strumentali registrati nell'anno */
  investments?: number
}

/**
 * Cosa non torna e cosa si può migliorare.
 *
 * Regole, non intelligenza artificiale: ognuna nasce da un numero che il
 * sistema ha già e finisce con una cosa da fare. Le opportunità fiscali sono
 * segnalazioni da portare al commercialista, non istruzioni: il tool sa cosa
 * hai speso, non conosce la tua situazione fiscale completa.
 */
export function taxInsights(i: TaxInput): TaxFinding[] {
  const out: TaxFinding[] = []

  // ── attendibilità della stima: prima del numero, non dopo ─────────────────
  // Una previsione d'imposta costruita su costi non ancora registrati è più
  // alta del vero, e su un numero del genere si prendono decisioni sbagliate.
  const costShare = i.estimate.revenueYtd > 0 ? i.estimate.costsYtd / i.estimate.revenueYtd : 0
  if (i.estimate.revenueYtd > 0 && costShare < 0.2) {
    out.push({
      id: 'estimate-unreliable', severity: 'critico',
      title: 'La stima delle imposte è gonfiata: mancano i costi effettivi',
      detail: `Nel conto economico ci sono ${eur(i.estimate.revenueYtd)} di ricavi e ${eur(i.estimate.costsYtd)} di costi registrati. Le uscite hanno il preventivato ma non la spesa reale, quindi il margine — e le imposte che ne derivano — sono più alti del vero.`,
      action: 'Registra le uscite effettive del mese prima di fidarti di questi numeri: la stima si corregge da sola.',
    })
  } else if (i.estimate.monthsBooked > 0 && i.estimate.monthsBooked < 3) {
    out.push({
      id: 'few-months', severity: 'attenzione',
      title: `Proiezione su ${i.estimate.monthsBooked} mes${i.estimate.monthsBooked === 1 ? 'e' : 'i'}`,
      detail: 'Con pochi mesi registrati la media mensile è instabile: un mese forte o debole sposta la stima annua di parecchio.',
      action: 'Rileggila fra un paio di mesi, quando la base sarà più solida.',
    })
  }

  // ── scadenze ──────────────────────────────────────────────────────────────
  const soon = i.deadlines.filter(d => !d.past && d.daysLeft <= 30 && (d.amount ?? 0) > 0)
  for (const d of soon) {
    out.push({
      id: `due-${d.id}`, severity: d.daysLeft <= 10 ? 'critico' : 'attenzione',
      title: `${d.label}: ${eur(d.amount!)} fra ${d.daysLeft} giorni`,
      detail: d.detail,
      action: 'Verifica di avere la cassa: è un versamento, non una stima.',
      value: d.amount!,
    })
  }

  const late = i.deadlines.filter(d => d.past && d.daysLeft >= -20 && (d.amount ?? 0) > 0)
  for (const d of late) {
    out.push({
      id: `late-${d.id}`, severity: 'critico',
      title: `${d.label}: scaduta da ${-d.daysLeft} giorni`,
      detail: `${eur(d.amount!)} che dovevano essere versati. Il ravvedimento operoso costa meno prima che dopo.`,
      action: 'Parlane col commercialista oggi, non a fine mese.',
    })
  }

  // ── accantonamento ────────────────────────────────────────────────────────
  if (i.aside.gap > 0 && i.aside.needed > 0) {
    out.push({
      id: 'set-aside', severity: i.aside.coveredPct < 0.5 ? 'critico' : 'attenzione',
      title: `Mancano ${eur(i.aside.gap)} di accantonamento`,
      detail: `Fra IVA e imposte maturate servirebbero ${eur(i.aside.needed)} da parte; ne risultano ${eur(i.aside.total)} (${pc(i.aside.coveredPct)}).`,
      action: `Metti via ${eur(i.estimate.monthlySetAside)} al mese da qui a dicembre e la scadenza di giugno non ti sorprende.`,
      value: i.aside.gap,
    })
  } else if (i.aside.needed > 0) {
    out.push({
      id: 'set-aside-ok', severity: 'opportunità',
      title: 'Accantonamento in linea',
      detail: `${eur(i.aside.total)} da parte contro ${eur(i.aside.needed)} maturati. È la differenza fra un\'azienda che dorme e una che si sveglia a giugno.`,
    })
  }

  // ── IVA sugli acquisti mai portata in detrazione ──────────────────────────
  if (i.costsWithoutVat > 0) {
    const lost = i.costsWithoutVat * 0.22
    const share = i.costsWithoutVat / Math.max(1, i.costsWithoutVat + i.costsWithVat)
    out.push({
      id: 'vat-not-claimed', severity: share > 0.8 ? 'critico' : 'attenzione',
      title: `${eur(lost)} di IVA sugli acquisti forse non detratta`,
      detail: `${eur(i.costsWithoutVat)} di uscite (${pc(share)} del totale) sono registrate senza IVA. Se quelle fatture l'IVA ce l'hanno, è credito che stai regalando: si scomputa dall'IVA sulle vendite e abbassa ogni liquidazione.`,
      action: 'Nel conto economico, spunta «IVA» sulle righe di costo che hanno una fattura italiana con IVA.',
      value: lost,
    })
  }

  // ── IVA su fatture non incassate ──────────────────────────────────────────
  if (i.vatOnUnpaid > 0) {
    out.push({
      id: 'vat-unpaid', severity: i.vatOnUnpaid > 2000 ? 'attenzione' : 'opportunità',
      title: `${eur(i.vatOnUnpaid)} di IVA su fatture non incassate`,
      detail: 'L\'IVA si versa per competenza, non per cassa: su queste fatture la giri allo Stato prima di aver visto i soldi. È un anticipo che fai tu.',
      action: 'Sollecita gli insoluti prima della liquidazione, o valuta col commercialista l\'IVA per cassa se il profilo clienti lo giustifica.',
      value: i.vatOnUnpaid,
    })
  }

  // ── stagionalità: un quarto trimestre grosso pesa a giugno ────────────────
  if (i.q4Share > 0.35) {
    out.push({
      id: 'q4-heavy', severity: 'attenzione',
      title: `${pc(i.q4Share)} del fatturato si concentra nell'ultimo trimestre`,
      detail: 'Le imposte su quel margine si versano a giugno dell\'anno dopo, quando l\'incasso è lontano. È lo scarto che svuota la cassa d\'estate.',
      action: 'Accantona di più nei mesi forti, non in quelli deboli.',
    })
  }

  // ── §184: agevolazioni, quantificate con i numeri che il tool ha già ──────
  const iresPct = i.iresPct ?? DEFAULT_TAX_CONFIG.ires_pct

  if ((i.newHires ?? 0) > 0 && (i.newHiresCost ?? 0) > 0) {
    const md = maxiDeduction({
      newHiresCost: i.newHiresCost!, payrollIncrease: i.newHiresCost!,
      protectedCost: i.protectedCost ?? 0, headcountIncrease: true,
      pct: DEFAULT_TAX_CONFIG.maxi_deduction_pct,
      protectedPct: DEFAULT_TAX_CONFIG.maxi_deduction_protected_pct,
      iresPct,
    })
    out.push({
      id: 'maxi-deduzione', severity: 'opportunità',
      title: `${eur(md.iresSaving)} di IRES in meno per le assunzioni dell'anno`,
      detail: `${i.newHires} assunzion${i.newHires === 1 ? 'e' : 'i'} a tempo indeterminato per ${eur(i.newHiresCost!)} di costo: la maxi-deduzione maggiora la deduzione del 20% — del 30% sulle categorie meritevoli di maggior tutela — e vale ${eur(md.extraDeduction)} di deduzione in più. `
        + 'Vale solo ai fini IRES, non IRAP, e presuppone l\'incremento occupazionale: dipendenti a fine anno sopra la media dell\'anno prima, sia a tempo indeterminato sia in totale.',
      action: 'Porta al commercialista l\'elenco delle assunzioni e il conteggio dell\'incremento: è una deduzione extracontabile, si applica in dichiarazione.',
      value: md.iresSaving,
    })
  }

  if ((i.contribRelief ?? 0) > 0) {
    out.push({
      id: 'esoneri-attivi', severity: 'opportunità',
      title: `${eur(i.contribRelief!)} di contributi non versati grazie agli esoneri`,
      detail: 'Sono nel costo del personale come minor costo, quindi alzano il margine — e con lui l\'imposta. Un esonero non è cassa in più a fine anno: è cassa in più ogni mese e imposta in più a giugno.',
      action: 'Tienine conto nell\'accantonamento: il margine agevolato è comunque margine tassato.',
    })
  }

  if ((i.reliefAvailable ?? 0) > 0) {
    out.push({
      id: 'esoneri-mancati', severity: 'attenzione',
      title: `${eur(i.reliefAvailable!)} di esoneri contributivi non attivati`,
      detail: 'Ci sono rapporti che avrebbero diritto a un\'agevolazione contributiva e non l\'hanno. Gli esoneri decorrono dalla comunicazione all\'INPS: i mesi passati non si recuperano.',
      action: 'Il dettaglio per persona sta nella sezione Personale, tab Agevolazioni.',
      value: i.reliefAvailable!,
    })
  }

  if ((i.investments ?? 0) > 0) {
    const h = hyperAmortization(i.investments!, iresPct)
    out.push({
      id: 'iper-ammortamento', severity: 'opportunità',
      title: `Iper-ammortamento: ${eur(h.iresSaving)} di IRES sugli investimenti dell'anno`,
      detail: `${eur(i.investments!)} di beni strumentali danno ${eur(h.extraCost)} di costo deducibile in più (maggiorazione del ${pc(h.effectivePct)}), spalmati sugli anni di ammortamento. Vale per i beni 4.0 acquistati dal 2026 al settembre 2028, e sostituisce i crediti Transizione 4.0 e 5.0.`,
      action: 'Serve la comunicazione al GSE e l\'interconnessione del bene: senza, la maggiorazione non spetta. Verifica quali acquisti sono davvero 4.0 prima di contarci.',
      value: h.iresSaving,
    })
  }

  if ((i.impatriates ?? 0) > 0) {
    out.push({
      id: 'impatriati-fiscale', severity: 'opportunità',
      title: `${i.impatriates} person${i.impatriates === 1 ? 'a' : 'e'} in regime impatriati`,
      detail: 'Il beneficio è loro, non della società: il costo aziendale e la sua deducibilità non cambiano. Va sorvegliato il requisito di permanenza — quattro anni di residenza italiana — perché la decadenza è retroattiva e ricade sulla persona.',
      action: 'Conserva la documentazione della residenza estera e della qualificazione: in verifica la chiedono a te come sostituto d\'imposta.',
    })
  }

  // ── opportunità ───────────────────────────────────────────────────────────
  if (i.rndSpend > 0) {
    out.push({
      id: 'rnd', severity: 'opportunità',
      title: 'Lo sviluppo interno può valere più di un costo',
      detail: `Ci sono ${eur(i.rndSpend)} l'anno fra AI, repository e infrastruttura su un prodotto che state costruendo in casa. Un software sviluppato internamente può essere capitalizzato invece che spesato, e in certi casi rientra nei crediti d'imposta per ricerca e sviluppo.`,
      action: 'Portane l\'elenco al commercialista: cambia l\'imponibile, non solo la forma del bilancio.',
    })
  }

  if (!i.hasWelfare) {
    out.push({
      id: 'welfare', severity: 'opportunità',
      title: 'Nessuna spesa di welfare aziendale',
      detail: 'I fringe benefit e i piani welfare sono deducibili per l\'azienda e non tassati in busta: a parità di costo aziendale il netto per la persona è più alto di un aumento.',
      action: 'Se stai pensando ad aumenti, confronta prima le due strade.',
    })
  }

  if (!i.hasTraining) {
    out.push({
      id: 'training', severity: 'opportunità',
      title: 'Nessuna spesa di formazione a piano',
      detail: 'Per un\'agenzia che vende competenza certificata è insolito. Oltre alla deducibilità, la formazione del personale ha avuto negli anni crediti d\'imposta dedicati.',
      action: 'Verifica le misure in vigore prima di programmare i corsi dell\'anno.',
    })
  }

  // ── regime IVA ────────────────────────────────────────────────────────────
  const debtQuarters = i.vat.filter(q => q.balance > 0).length
  const creditQuarters = i.vat.filter(q => q.balance < 0).length
  if (creditQuarters > debtQuarters && creditQuarters > 1) {
    out.push({
      id: 'vat-regime', severity: 'opportunità',
      title: 'Sei strutturalmente a credito IVA: il trimestrale ti costa',
      detail: `${creditQuarters} trimestri a credito contro ${debtQuarters} a debito. Col regime mensile il credito rientra prima e non paghi l'1% sui trimestri a debito.`,
      action: 'L\'opzione si esercita in dichiarazione: valutala col commercialista prima di fine anno.',
    })
  } else if (debtQuarters > 0) {
    const interest = i.vat.reduce((s, q) => s + q.interest, 0)
    if (interest > 200) {
      out.push({
        id: 'vat-interest', severity: 'opportunità',
        title: `${eur(interest)} l'anno di interessi per l'opzione trimestrale`,
        detail: 'È il prezzo per tenere l\'IVA tre mesi in più invece che uno. Conviene finché quella liquidità vale più dell\'1%.',
        action: 'Se la cassa è comoda, il mensile costa meno.',
      })
    }
  }

  const order = { critico: 0, attenzione: 1, 'opportunità': 2 }
  return out.sort((a, b) => order[a.severity] - order[b.severity] || (b.value ?? 0) - (a.value ?? 0))
}

// ── Agevolazioni della società ───────────────────────────────────────────────

/**
 * Le misure da guardare, in ordine di utilità per **questa** azienda.
 *
 * Il catalogo sta in `lib/incentives.ts`; qui si sceglie cosa mostrare in base a
 * quello che il tool sa già — assunzioni fatte, welfare a piano, sviluppo
 * interno, investimenti. Dieci agevolazioni tutte uguali non le legge nessuno,
 * e quella che serve sta sempre in fondo.
 */
export function taxMeasures(f: {
  today: string
  newHires: number
  impatriates: number
  hasWelfare: boolean
  rndSpend: number
  investments: number
  zes: boolean
}): { live: CompanyMeasure[]; expired: CompanyMeasure[] } {
  return { live: relevantMeasures(f), expired: expiredMeasures(f.today) }
}

export { maxiDeduction, hyperAmortization }
export type { CompanyMeasure }

/** I mesi che restano nell'anno, oggi compreso. */
export const monthsLeftInYear = (today: string) => 12 - Number(today.slice(5, 7)) + 1

/** Le prossime N scadenze non ancora passate. */
export const upcoming = (all: Deadline[], n = 6) => all.filter(d => !d.past).slice(0, n)

/** Mese corrente in formato primo-del-mese, per i default. */
export const thisMonth = (today: string) => today.slice(0, 8) + '01'

export { shiftMonth }
