/**
 * Quanto costa davvero una persona.
 *
 * Il numero che serve non è lo stipendio: è il **costo azienda**, cioè lordo
 * più contributi più INAIL più il TFR che matura anche se non esce dal conto
 * corrente. Fra i due c'è in genere un 40-45% di differenza, ed è la ragione
 * per cui i piani del personale saltano.
 *
 * Tre principi, che spiegano tutte le scelte qui sotto:
 *
 * 1. **Nessuna aliquota è scritta nel codice.** Stanno in `hr_payroll_params`,
 *    con l'anno di validità e la fonte. Un'aliquota nel codice è un'aliquota
 *    che nessuno aggiorna, e una busta paga sbagliata non è un bug: è un danno.
 *
 * 2. **Costo di competenza ≠ uscita di cassa.** Il TFR matura ogni mese e si
 *    paga anni dopo; la tredicesima matura in dodicesimi ed esce a dicembre.
 *    Confonderli fa sembrare ricchi a novembre e poveri a dicembre, quindi qui
 *    si calcolano **entrambi** e si tengono separati.
 *
 * 3. **Il netto è una stima, e lo dice.** La busta vera dipende da detrazioni
 *    personali, familiari a carico, conguagli, addizionali del singolo comune.
 *    Qui si arriva vicino; «vicino» va scritto, non lasciato intendere.
 *
 * Non è consulenza del lavoro. È un modello che rende visibile un ordine di
 * grandezza che senza strumento nessuno ha.
 *
 * Le **agevolazioni** stanno in `lib/incentives.ts`: esoneri contributivi,
 * rientro dei cervelli, maxi-deduzione. Qui dentro si applicano — un esonero
 * abbassa i contributi datore, il regime impatriati abbassa la base IRPEF senza
 * toccare il costo aziendale — ma le regole di chi ne ha diritto stanno lì,
 * perché cambiano con una frequenza tutta loro.
 */

import {
  contribRelief, coveredMonthsInYear, impatriateView, incentiveByCode, incentiveEnds,
  checkIncentive, rankIncentives, maxiDeduction, monthsBetween,
  HIRING_INCENTIVES, IMPATRIATE_RULE,
  type HiringIncentive, type ImpatriateRule, type PersonFacts, type IncentiveVerdict,
} from '@/lib/incentives'

// ═══════════════════════════════════════════════════════════════════════════
// Tipologie contrattuali
// ═══════════════════════════════════════════════════════════════════════════

export type ContractKind =
  | 'indeterminato'
  | 'determinato'
  | 'apprendistato'
  | 'tirocinio'
  | 'cococo'
  | 'piva_ordinario'
  | 'piva_forfettario'
  | 'occasionale'
  | 'socio_compenso'
  | 'socio_fattura'
  | 'fornitore'

export type ContractSpec = {
  kind: ContractKind
  label: string
  /** una riga che dice cos'è, per chi non fa contratti di mestiere */
  what: string
  /** subordinato = busta paga; gli altri fatturano o prendono un compenso */
  employment: 'subordinato' | 'parasubordinato' | 'autonomo'
  /** matura TFR (art. 2120 c.c.): solo il lavoro subordinato */
  tfr: boolean
  /** mensilità aggiuntive tipiche; il CCNL può cambiarle */
  extraMonths: number
  /** l'azienda versa INAIL su questa persona */
  inail: boolean
  /** quello che l'azienda deve sapere prima di firmarlo */
  notes: string[]
}

/**
 * Il catalogo. La *struttura* di un contratto (matura TFR? ha la tredicesima?)
 * è legge e cambia di rado: sta qui. Le *aliquote* cambiano ogni anno: stanno
 * nei parametri.
 */
export const CONTRACTS: ContractSpec[] = [
  {
    kind: 'indeterminato', label: 'Tempo indeterminato', employment: 'subordinato',
    what: 'Il contratto pieno: nessuna scadenza, tutele complete, licenziamento solo per giusta causa o giustificato motivo.',
    tfr: true, extraMonths: 2, inail: true,
    notes: [
      'Costo azienda tipico: +40/45% sulla RAL fra contributi, INAIL e TFR.',
      'La tredicesima è quasi sempre prevista; la quattordicesima dipende dal CCNL.',
      'Il preavviso e il TFR maturato restano dovuti anche in caso di dimissioni.',
      'È l\'unico contratto che apre le agevolazioni pesanti: esonero strutturale under 30, nuovo esonero 2026, maxi-deduzione IRES del 120%.',
    ],
  },
  {
    kind: 'determinato', label: 'Tempo determinato', employment: 'subordinato',
    what: 'Come l’indeterminato ma con una scadenza. Serve una causale oltre i 12 mesi, e il tetto complessivo è 24 mesi.',
    tfr: true, extraMonths: 2, inail: true,
    notes: [
      'Contributo addizionale NASpI a carico azienda, che cresce a ogni rinnovo.',
      'Alla scadenza il TFR maturato si liquida: è un’uscita di cassa da mettere a piano.',
      'Superati i limiti di durata o di proroghe, si trasforma in indeterminato.',
    ],
  },
  {
    kind: 'apprendistato', label: 'Apprendistato professionalizzante', employment: 'subordinato',
    what: 'Contratto formativo per under 30: retribuzione ridotta per livelli e contribuzione fortemente agevolata.',
    tfr: true, extraMonths: 2, inail: true,
    notes: [
      'È il contratto più conveniente per un ingresso junior: aliquota azienda molto più bassa.',
      'Fino a nove dipendenti l’aliquota datore parte dal 3,11% e sale al 4,61% e all’11,61% nei tre anni; sopra i nove dipendenti è 11,61% fisso.',
      'Anche i contributi dell’apprendista sono più bassi — 5,84% invece del 9,19% — quindi a parità di lordo il netto è più alto.',
      'Obbliga a un piano formativo individuale e a un tutor: l’agevolazione si perde se manca.',
      'Le agevolazioni proseguono per un anno dopo la conferma in indeterminato, e in quei dodici mesi si aggiunge l’esonero strutturale under 30.',
    ],
  },
  {
    kind: 'tirocinio', label: 'Tirocinio / stage', employment: 'parasubordinato',
    what: 'Non è un rapporto di lavoro ma formativo. Indennità di partecipazione obbligatoria, importo minimo fissato dalla Regione.',
    tfr: false, extraMonths: 0, inail: true,
    notes: [
      'Nessun contributo previdenziale: solo INAIL e assicurazione RC.',
      'Non può coprire mansioni ordinarie: usarlo come lavoro a basso costo è il rischio più concreto.',
      'Durata massima e numero di tirocinanti sono limitati dalla normativa regionale.',
    ],
  },
  {
    kind: 'cococo', label: 'Co.co.co.', employment: 'parasubordinato',
    what: 'Collaborazione coordinata e continuativa: niente vincolo di orario, ma coordinamento col committente.',
    tfr: false, extraMonths: 0, inail: true,
    notes: [
      'Contributi in Gestione Separata INPS: due terzi azienda, un terzo collaboratore.',
      'Se la prestazione diventa etero-organizzata, si applica la disciplina del lavoro subordinato.',
      'Nessun TFR, nessuna tredicesima: il costo azienda è compenso più contributi.',
    ],
  },
  {
    kind: 'piva_ordinario', label: 'P.IVA regime ordinario', employment: 'autonomo',
    what: 'Fornitore vero e proprio: emette fattura con IVA, applica la ritenuta d’acconto se professionista.',
    tfr: false, extraMonths: 0, inail: false,
    notes: [
      'Per l’azienda il costo è l’imponibile della fattura: l’IVA è neutra, si detrae.',
      'La rivalsa di cassa o Gestione Separata è parte del compenso e va concordata prima.',
      'La ritenuta d’acconto non è un costo: è un anticipo d’imposta che si versa per suo conto.',
    ],
  },
  {
    kind: 'piva_forfettario', label: 'P.IVA forfettario', employment: 'autonomo',
    what: 'Regime agevolato sotto la soglia di ricavi: nessuna IVA in fattura, nessuna ritenuta, imposta sostitutiva.',
    tfr: false, extraMonths: 0, inail: false,
    notes: [
      'Per l’azienda è il fornitore più semplice: il costo è esattamente quello che fattura.',
      'Attenzione al vincolo di prevalenza: se fattura quasi solo a te, il regime può decadere.',
      'Non c’è IVA da detrarre: a parità di imponibile il fornitore forfettario non è più caro, ma nemmeno più economico.',
    ],
  },
  {
    kind: 'socio_compenso', label: 'Socio con compenso amministratore', employment: 'parasubordinato',
    what: 'Compenso deliberato all’amministratore: non è una busta paga e non è una fattura.',
    tfr: false, extraMonths: 0, inail: false,
    notes: [
      'Va deliberato in assemblea: senza delibera non è deducibile per la società.',
      'Contributi in Gestione Separata, con la quota a carico società.',
      'Non classificarlo come costo del personale senza sapere quale documento fiscale lo copre.',
    ],
  },
  {
    kind: 'socio_fattura', label: 'Socio che fattura', employment: 'autonomo',
    what: 'Il socio ha una sua partita IVA e fattura le prestazioni alla società.',
    tfr: false, extraMonths: 0, inail: false,
    notes: [
      'Deve essere una prestazione reale e a valore di mercato: il fisco guarda i rapporti fra parti correlate.',
      'Le fee commerciali e di delivery vanno tracciate col loro documento, non stimate.',
      'Costo per la società = imponibile della fattura, come per qualsiasi fornitore.',
    ],
  },
  {
    kind: 'fornitore', label: 'Fornitore operativo', employment: 'autonomo',
    what: 'Società o studio che eroga un servizio continuativo: agenzia, studio, software house.',
    tfr: false, extraMonths: 0, inail: false,
    notes: [
      'Nessun rapporto di lavoro: il costo è l’imponibile della fattura.',
      'Se la lavorazione è venduta a un cliente è un subappalto e sta nell’economics del progetto.',
    ],
  },
  {
    kind: 'occasionale', label: 'Prestazione occasionale', employment: 'autonomo',
    what: 'Prestazione saltuaria senza partita IVA, con ritenuta d’acconto del 20%.',
    tfr: false, extraMonths: 0, inail: false,
    notes: [
      'Oltre la soglia annua di compensi scatta l’obbligo di iscrizione alla Gestione Separata.',
      'Deve essere davvero occasionale: continuità e coordinamento la trasformano in altro.',
      'Adatta a un lavoro singolo, non a una collaborazione che si ripete ogni mese.',
    ],
  },
]

export const contractSpec = (kind: ContractKind): ContractSpec =>
  CONTRACTS.find(c => c.kind === kind) ?? CONTRACTS[0]

// ═══════════════════════════════════════════════════════════════════════════
// Parametri fiscali e contributivi
// ═══════════════════════════════════════════════════════════════════════════

export type IrpefBracket = { upTo: number | null; rate: number }

export type PayrollParams = {
  year: number
  /** contributi INPS a carico azienda, per tipologia */
  inpsEmployerPct: number
  /** apprendistato oltre i nove dipendenti: aliquota unica per tutta la durata */
  inpsApprenticePct: number
  /**
   * Apprendistato fino a nove dipendenti: l'aliquota cambia ogni anno di
   * contratto (1,5% · 3% · 10%, più l'1,61% di NASpI e fondi). È lo sconto più
   * grosso che esiste sul lavoro subordinato, e vale solo per le aziende piccole
   * — cioè quasi tutte quelle che lo userebbero.
   */
  inpsApprenticeY1Pct: number
  inpsApprenticeY2Pct: number
  inpsApprenticeY3Pct: number
  /** contributi a carico del lavoratore subordinato */
  inpsEmployeePct: number
  /** contributi a carico dell'apprendista: più bassi, quindi netto più alto */
  inpsApprenticeEmployeePct: number
  /** fino a nove dipendenti: decide quale aliquota apprendistato si applica */
  smallCompany: boolean
  /** unità produttiva nella ZES unica Mezzogiorno: alza i tetti degli esoneri */
  zes: boolean
  /** rientro dei cervelli: quota esente, tetto e durata (§184) */
  impatriatePct: number
  impatriateChildrenPct: number
  impatriateCap: number
  impatriateYears: number
  /**
   * Il catalogo degli esoneri in vigore, letto da `hr_incentives`. Viaggia coi
   * parametri per la stessa ragione delle aliquote: una misura cambia percentuale
   * o finestra a metà anno, e il codice non deve essere il posto dove si corregge.
   */
  incentives: HiringIncentive[]
  /** INAIL: dipende dalla lavorazione, per gli uffici è basso */
  inailPct: number
  /** contributo addizionale NASpI sui contratti a termine */
  fixedTermExtraPct: number
  /** Gestione Separata: co.co.co. e professionisti senza cassa */
  gestioneSeparataPct: number
  /** quota a carico azienda della Gestione Separata (2/3) */
  gestioneSeparataEmployerShare: number
  /** massimale annuo Gestione Separata */
  gestioneSeparataCap: number
  /** TFR: la RAL si divide per questo (art. 2120 c.c.) */
  tfrDivisor: number
  /** contributo al Fondo di garanzia, che riduce il TFR netto accantonato */
  tfrFundPct: number
  /** rivalutazione annua del TFR in azienda: 1,5% + 75% dell'inflazione */
  tfrRevalFixedPct: number
  tfrRevalInflationShare: number
  irpef: IrpefBracket[]
  /** addizionali: variano per regione e comune, qui la media impostata */
  regionalSurchargePct: number
  municipalSurchargePct: number
  /** detrazione base per lavoro dipendente e soglie */
  employeeDeduction: number
  employeeDeductionCap: number
  /** forfettario: imposta sostitutiva ordinaria e per i primi 5 anni */
  flatTaxPct: number
  flatTaxStartupPct: number
  /** coefficiente di redditività per le attività professionali */
  flatTaxProfitability: number
  /** soglia di ricavi del regime forfettario */
  flatTaxCeiling: number
  /** ritenuta d'acconto sui professionisti */
  withholdingPct: number
  /** IVA ordinaria */
  vatPct: number
  /** fringe benefit esenti: soglia ordinaria e con figli a carico */
  fringeBenefitCap: number
  fringeBenefitCapChildren: number
  /** buoni pasto elettronici esenti al giorno */
  mealVoucherExempt: number
  /** premi di risultato: imposta sostitutiva agevolata */
  productivityBonusPct: number
  productivityBonusCap: number
  /** da dove vengono questi numeri, e se qualcuno li ha verificati */
  source: string | null
  verifiedAt: string | null
}

/**
 * I valori di partenza.
 *
 * **Vanno verificati col commercialista prima di farci un piano.** Sono la
 * fotografia della normativa italiana per come è nota a chi ha scritto questo
 * file, non un dato ufficiale, e l'aliquota INPS in particolare dipende dal
 * CCNL applicato e dalla dimensione aziendale: per il terziario/commercio sta
 * fra il 29% e il 32%.
 *
 * L'interfaccia mostra `verifiedAt` accanto a ogni numero: finché è vuoto, la
 * sezione dichiara che sta stimando.
 */
export const DEFAULT_PAYROLL_PARAMS: PayrollParams = {
  year: 2026,
  inpsEmployerPct: 0.30,
  inpsApprenticePct: 0.1161,
  inpsApprenticeY1Pct: 0.0311,
  inpsApprenticeY2Pct: 0.0461,
  inpsApprenticeY3Pct: 0.1161,
  inpsEmployeePct: 0.0919,
  inpsApprenticeEmployeePct: 0.0584,
  smallCompany: true,
  zes: false,
  impatriatePct: IMPATRIATE_RULE.exemptPct,
  impatriateChildrenPct: IMPATRIATE_RULE.exemptPctWithChildren,
  impatriateCap: IMPATRIATE_RULE.incomeCap,
  impatriateYears: IMPATRIATE_RULE.years,
  incentives: HIRING_INCENTIVES,
  inailPct: 0.005,
  fixedTermExtraPct: 0.014,
  gestioneSeparataPct: 0.2607,
  gestioneSeparataEmployerShare: 2 / 3,
  gestioneSeparataCap: 120607,
  tfrDivisor: 13.5,
  tfrFundPct: 0.005,
  tfrRevalFixedPct: 0.015,
  tfrRevalInflationShare: 0.75,
  /* 2026: il secondo scaglione scende dal 35% al 33% (L. 199/2025). Valgono al
     massimo 440 € l'anno di IRPEF in meno, e sopra i 200.000 € di reddito il
     beneficio viene sterilizzato riducendo le detrazioni della stessa cifra. */
  irpef: [
    { upTo: 28000, rate: 0.23 },
    { upTo: 50000, rate: 0.33 },
    { upTo: null,  rate: 0.43 },
  ],
  regionalSurchargePct: 0.0173,
  municipalSurchargePct: 0.008,
  employeeDeduction: 1955,
  employeeDeductionCap: 28000,
  flatTaxPct: 0.15,
  flatTaxStartupPct: 0.05,
  flatTaxProfitability: 0.78,
  flatTaxCeiling: 85000,
  withholdingPct: 0.20,
  vatPct: 0.22,
  fringeBenefitCap: 1000,
  fringeBenefitCapChildren: 2000,
  // 2026: il buono pasto elettronico esente passa da 8 a 10 € al giorno
  mealVoucherExempt: 10,
  // 2026-2027: l'imposta sostitutiva sui premi di risultato scende all'1%, tetto 5.000 €
  productivityBonusPct: 0.01,
  productivityBonusCap: 5000,
  source: null,
  verifiedAt: null,
}

const r2 = (n: number) => Math.round(n * 100) / 100
const nonNeg = (n: number) => (n > 0 ? n : 0)
/** Percentuale leggibile: 0,0311 → «3,11», 0,30 → «30». */
const pcOf = (n: number) => {
  const v = n * 100
  return (Math.round(v * 100) / 100).toString().replace('.', ',')
}

// ═══════════════════════════════════════════════════════════════════════════
// La persona
// ═══════════════════════════════════════════════════════════════════════════

export type PersonInput = {
  name: string
  kind: ContractKind
  /** ISO YYYY-MM-DD. Decide quali contratti sono ancora possibili (§183) */
  birthDate: string | null
  /** figli a carico: alzano la soglia dei fringe benefit esenti */
  hasChildren: boolean
  childrenCount: number
  dependentSpouse: boolean
  /**
   * Subordinati: RAL annua lorda, **tredicesima e quattordicesima incluse**.
   * Autonomi: compenso annuo concordato.
   */
  gross: number
  /** quante mensilità compongono la RAL: 12, 13 o 14 */
  months: number
  /** 1 = full time, 0.5 = part time al 50% */
  fte: number
  /** benefit e welfare annui: costo per l'azienda, esenti entro la soglia */
  benefits: number
  /** buoni pasto: giorni lavorati all'anno per cui si erogano */
  mealDays: number
  mealValue: number
  /** autonomi: applica la rivalsa 4% di cassa o Gestione Separata */
  withRivalsa: boolean
  /** forfettario nei primi cinque anni: imposta sostitutiva al 5% */
  startupRate: boolean
  /** mese di ingresso e uscita nell'anno, per chi non c'è tutto l'anno */
  fromMonth: number
  toMonth: number

  // ── agevolazioni (§184) ────────────────────────────────────────────────────
  /** data di assunzione: da qui corrono la finestra e i mesi dell'esonero */
  hiredOn: string | null
  /** mai assunto a tempo indeterminato da nessuno: requisito degli esoneri giovani */
  neverStable: boolean
  /** codice dell'esonero applicato, dal catalogo in `lib/incentives.ts` */
  incentiveCode: string | null
  /** anno di apprendistato in corso: 1, 2 o 3. L'aliquota cambia ogni anno */
  apprenticeYear: number
  /** rientro dei cervelli: primo anno di residenza fiscale italiana */
  impatriateFrom: string | null
  /** almeno un figlio minore: la quota esente sale dal 50% al 60% */
  impatriateChildren: boolean
  /** categoria meritevole di maggior tutela: maxi-deduzione al 130% */
  protectedCategory: boolean
}

export const emptyPerson = (o: Partial<PersonInput> = {}): PersonInput => ({
  name: '', kind: 'indeterminato', gross: 0, months: 14, fte: 1,
  birthDate: null, hasChildren: false, childrenCount: 0, dependentSpouse: false,
  benefits: 0, mealDays: 0, mealValue: 0,
  withRivalsa: false, startupRate: false, fromMonth: 1, toMonth: 12,
  hiredOn: null, neverStable: false, incentiveCode: null, apprenticeYear: 1,
  impatriateFrom: null, impatriateChildren: false, protectedCategory: false, ...o,
})

// ── Agevolazioni applicate a una persona ─────────────────────────────────────

/** I fatti che servono al catalogo degli esoneri, presi dall'anagrafica. */
export const incentiveFacts = (p: PersonInput, prm: PayrollParams): PersonFacts => ({
  kind: p.kind, birthDate: p.birthDate, hiredOn: p.hiredOn,
  neverStable: p.neverStable, zes: prm.zes,
})

/** Le regole del regime impatriati, per come sono configurate quest'anno. */
export const impatriateRuleOf = (prm: PayrollParams): ImpatriateRule => ({
  ...IMPATRIATE_RULE,
  exemptPct: prm.impatriatePct,
  exemptPctWithChildren: prm.impatriateChildrenPct,
  incomeCap: prm.impatriateCap,
  years: prm.impatriateYears,
})

/**
 * L'aliquota datore per un apprendista.
 *
 * Fino a nove dipendenti cambia ogni anno di contratto; sopra i nove è fissa.
 * Non è un dettaglio: fra il primo anno di una azienda piccola (3,11%) e
 * l'aliquota ordinaria (30%) ci sono quasi ventisette punti di retribuzione.
 */
export function apprenticeRate(p: PersonInput, prm: PayrollParams): number {
  if (!prm.smallCompany) return prm.inpsApprenticePct
  const y = Math.min(3, Math.max(1, Math.round(p.apprenticeYear || 1)))
  return y === 1 ? prm.inpsApprenticeY1Pct
    : y === 2 ? prm.inpsApprenticeY2Pct
    : prm.inpsApprenticeY3Pct
}

/** L'aliquota datore che si applica davvero a questa persona, esoneri esclusi. */
export const employerRate = (p: PersonInput, prm: PayrollParams): number =>
  p.kind === 'apprendistato' ? apprenticeRate(p, prm) : prm.inpsEmployerPct

export type AppliedIncentive = {
  incentive: HiringIncentive
  /** euro di contributi datore che non si versano nell'anno */
  relief: number
  /** mesi dell'anno coperti */
  months: number
  /** mese in cui l'agevolazione finisce, per sapere quando il costo risale */
  endsOn: string | null
  /** false = configurata ma i requisiti non risultano: il tool non la applica */
  eligible: boolean
  blockers: string[]
}

/**
 * L'esonero configurato su una persona, con quanto vale quest'anno.
 *
 * Se i requisiti che il tool può controllare non tornano, il beneficio **non si
 * applica**: un costo abbassato da un'agevolazione che non spetta è la bugia più
 * costosa che un piano del personale può contenere.
 */
export function appliedIncentive(
  p: PersonInput, prm: PayrollParams, employerContribYear: number,
): AppliedIncentive | null {
  const i = incentiveByCode(p.incentiveCode, prm.incentives)
  if (!i) return null

  const v = checkIncentive(i, incentiveFacts(p, prm), `${prm.year}-12-31`)
  const months = coveredMonthsInYear(i, p.hiredOn, prm.year, p.fromMonth, p.toMonth)
  const present = Math.min(12, Math.max(0, p.toMonth - p.fromMonth + 1))
  const relief = v.eligible
    ? Math.min(employerContribYear, contribRelief(i, {
        employerContribYear, monthsPresent: present, monthsCovered: months, zes: prm.zes,
      }))
    : 0

  return {
    incentive: i, relief: r2(relief), months,
    endsOn: incentiveEnds(i, p.hiredOn),
    eligible: v.eligible, blockers: v.blockers,
  }
}

/** Gli esoneri possibili su questa persona, dal più conveniente. */
export function incentiveOptions(
  p: PersonInput, prm: PayrollParams, on = `${prm.year}-12-31`,
): (IncentiveVerdict & { value: number })[] {
  const gross = r2(nonNeg(p.gross) * Math.max(0, p.fte)) * employerRate(p, prm)
  return rankIncentives(incentiveFacts(p, prm), on, gross, prm.incentives)
}

export type CostBreakdown = {
  /** la retribuzione lorda, riproporzionata a FTE e mesi di presenza */
  gross: number
  /** contributi datore **al netto** dell'esonero: è quello che si versa */
  inpsEmployer: number
  /** contributi datore pieni, prima dell'esonero */
  inpsEmployerGross: number
  /** euro di contributi che l'esonero fa risparmiare quest'anno */
  relief: number
  /** l'esonero applicato, con quando finisce. null = nessuno */
  incentive: AppliedIncentive | null
  inail: number
  fixedTermExtra: number
  /** TFR maturato nell'anno, al netto del contributo al Fondo di garanzia */
  tfr: number
  benefits: number
  mealVouchers: number
  /** costo di competenza: tutto quello che pesa sul conto economico */
  total: number
  /** quello che esce davvero dal conto corrente nell'anno (il TFR resta dentro) */
  cash: number
  /**
   * Costo di **un mese in cui la persona c'è**, non l'annuo diviso dodici: chi
   * entra a giugno costa sette dodicesimi all'anno, ma nei mesi in cui lavora
   * costa quanto gli altri. Diviso per dodici, un tirocinante entrato a giugno
   * risultava costare 467 € invece di 800, e la riga del conto economico di
   * ottobre nasceva sbagliata.
   */
  monthly: number
  /** quanto costa in più della sola retribuzione */
  loadPct: number
}

/** Quanti mesi dell'anno la persona e' in organico. */
const monthsPresent = (p: PersonInput) => {
  const from = Math.min(Math.max(1, p.fromMonth), 12)
  const to = Math.min(Math.max(from, p.toMonth), 12)
  return to - from + 1
}

/** Quota dell'anno effettivamente coperta: chi entra a settembre non costa 12 mesi. */
const yearShare = (p: PersonInput) => monthsPresent(p) / 12

/** Quante mensilità l'anno: serve a leggere «quanto prende al mese». */
export const monthsOf = (p: PersonInput) => Math.max(1, p.months)

/**
 * Il costo annuo di una persona per l'azienda.
 *
 * Subordinati: retribuzione + contributi + INAIL + TFR + benefit.
 * Autonomi: la fattura, più l'eventuale rivalsa. Nessun contributo, nessun TFR
 * — ed è tutta la differenza fra le due colonne di un confronto.
 */
export function personCost(p: PersonInput, prm: PayrollParams): CostBreakdown {
  const spec = contractSpec(p.kind)
  const share = yearShare(p)
  const gross = r2(nonNeg(p.gross) * Math.max(0, p.fte) * share)

  const meal = r2(nonNeg(p.mealDays) * nonNeg(p.mealValue) * share)
  const benefits = r2(nonNeg(p.benefits) * share)

  if (spec.employment === 'autonomo') {
    // Il costo di un fornitore è quello che fattura. L'IVA non è un costo:
    // si detrae. La ritenuta non è un costo: è imposta sua, anticipata da noi.
    const rivalsa = p.withRivalsa && p.kind === 'piva_ordinario' ? r2(gross * 0.04) : 0
    const total = r2(gross + rivalsa + benefits + meal)
    return {
      gross, inpsEmployer: 0, inpsEmployerGross: 0, relief: 0, incentive: null,
      inail: 0, fixedTermExtra: 0, tfr: 0,
      benefits, mealVouchers: meal,
      total, cash: total, monthly: r2(total / monthsPresent(p)),
      loadPct: gross > 0 ? r2((total - gross) / gross) : 0,
    }
  }

  if (p.kind === 'cococo') {
    // Gestione Separata: due terzi all'azienda, un terzo al collaboratore.
    const base = Math.min(gross, prm.gestioneSeparataCap)
    const inps = r2(base * prm.gestioneSeparataPct * prm.gestioneSeparataEmployerShare)
    const inail = spec.inail ? r2(gross * prm.inailPct) : 0
    const total = r2(gross + inps + inail + benefits + meal)
    return {
      gross, inpsEmployer: inps, inpsEmployerGross: inps, relief: 0, incentive: null,
      inail, fixedTermExtra: 0, tfr: 0,
      benefits, mealVouchers: meal,
      total, cash: total, monthly: r2(total / monthsPresent(p)),
      loadPct: gross > 0 ? r2((total - gross) / gross) : 0,
    }
  }

  if (p.kind === 'tirocinio') {
    // Indennità di partecipazione: nessun contributo previdenziale, solo INAIL.
    const inail = r2(gross * prm.inailPct)
    const total = r2(gross + inail + benefits + meal)
    return {
      gross, inpsEmployer: 0, inpsEmployerGross: 0, relief: 0, incentive: null,
      inail, fixedTermExtra: 0, tfr: 0,
      benefits, mealVouchers: meal,
      total, cash: total, monthly: r2(total / monthsPresent(p)),
      loadPct: gross > 0 ? r2((total - gross) / gross) : 0,
    }
  }

  // ── lavoro subordinato ────────────────────────────────────────────────────
  const inpsGross = r2(gross * employerRate(p, prm))
  /* L'esonero taglia i contributi previdenziali, **non** l'INAIL: è scritto in
     tutte le misure e cambia il conto di qualche centinaio di euro. */
  const applied = appliedIncentive(p, prm, inpsGross)
  const inps = r2(nonNeg(inpsGross - (applied?.relief ?? 0)))
  const inail = r2(gross * prm.inailPct)
  const extra = p.kind === 'determinato' ? r2(gross * prm.fixedTermExtraPct) : 0
  // TFR: una mensilità ogni 13,5, meno il contributo al Fondo di garanzia
  const tfr = spec.tfr ? r2((gross / prm.tfrDivisor) - gross * prm.tfrFundPct) : 0

  const total = r2(gross + inps + inail + extra + tfr + benefits + meal)
  // Il TFR matura ma resta in azienda: quest'anno non è un'uscita di cassa.
  const cash = r2(total - tfr)

  return {
    gross,
    inpsEmployer: inps, inpsEmployerGross: inpsGross,
    relief: applied?.relief ?? 0, incentive: applied,
    inail, fixedTermExtra: extra, tfr,
    benefits, mealVouchers: meal,
    total, cash, monthly: r2(total / monthsPresent(p)),
    loadPct: gross > 0 ? r2((total - gross) / gross) : 0,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Quanto arriva a lui
// ═══════════════════════════════════════════════════════════════════════════

export type NetBreakdown = {
  gross: number
  socialContributions: number
  /** imponibile fiscale prima del regime impatriati */
  taxableIncome: number
  /** quota di reddito che il regime impatriati tiene fuori dall'IRPEF */
  exempt: number
  /** base IRPEF effettiva: imponibile meno la quota esente */
  taxableAfterExempt: number
  /** quota esente applicata: 0 quando il regime non c'è o è finito */
  impatriatePct: number
  irpef: number
  deductions: number
  surcharges: number
  /** netto annuo stimato. **null per un autonomo**: non è conoscibile da qui */
  net: number | null
  /** netto per mensilità: quello che si legge in busta */
  perMonth: number | null
  /** quanto del costo azienda arriva davvero alla persona */
  efficiency: number | null
}

/** IRPEF a scaglioni: ogni fetta di reddito paga la sua aliquota. */
export function irpefOn(taxable: number, brackets: IrpefBracket[]): number {
  let tax = 0
  let floor = 0
  for (const b of brackets) {
    const ceiling = b.upTo ?? Infinity
    if (taxable <= floor) break
    tax += (Math.min(taxable, ceiling) - floor) * b.rate
    floor = ceiling
  }
  return r2(tax)
}

/**
 * Il netto in busta, stimato.
 *
 * Manca tutto ciò che è personale: familiari a carico, altri redditi,
 * conguagli, addizionali del comune preciso. Per un dipendente standard
 * l'errore è contenuto, ma resta una stima e va presentata come tale.
 */
export function personNet(p: PersonInput, prm: PayrollParams): NetBreakdown {
  const spec = contractSpec(p.kind)
  const share = yearShare(p)
  const gross = r2(nonNeg(p.gross) * Math.max(0, p.fte) * share)

  if (spec.employment === 'autonomo') {
    /* §182: Two Bee conosce l'**importo pagato**, non il netto personale di chi
       fattura — le sue imposte dipendono dal suo regime, dai suoi altri redditi
       e dalle sue deduzioni, e nessuno di questi dati è nostro. `net` resta
       null: un numero inventato qui verrebbe letto come vero. */
    return {
      gross, socialContributions: 0, taxableIncome: gross,
      exempt: 0, taxableAfterExempt: gross, impatriatePct: 0,
      irpef: 0, deductions: 0,
      surcharges: 0, net: null, perMonth: null, efficiency: null,
    }
  }

  const contribPct = p.kind === 'cococo'
    ? prm.gestioneSeparataPct * (1 - prm.gestioneSeparataEmployerShare)
    : p.kind === 'tirocinio' ? 0
    : p.kind === 'apprendistato' ? prm.inpsApprenticeEmployeePct
    : prm.inpsEmployeePct

  const contributions = r2(gross * contribPct)
  const taxable = r2(nonNeg(gross - contributions))

  /* §184 — rientro dei cervelli: i contributi si pagano su tutto, l'IRPEF su
     metà (o sul 40% con un figlio minore). Per l'azienda non cambia un euro:
     è l'unica leva che alza il netto senza alzare il costo. */
  const imp = impatriateView(taxable, p.impatriateFrom, prm.year, p.impatriateChildren, impatriateRuleOf(prm))
  const base = r2(nonNeg(taxable - imp.exemptAmount))
  const grossTax = irpefOn(base, prm.irpef)

  // Detrazione da lavoro dipendente: piena sotto la soglia, poi si consuma.
  const deduction = spec.employment === 'subordinato'
    ? r2(base <= prm.employeeDeductionCap
        ? prm.employeeDeduction
        : nonNeg(prm.employeeDeduction * (1 - (base - prm.employeeDeductionCap) / prm.employeeDeductionCap)))
    : 0

  const netTax = r2(nonNeg(grossTax - deduction))
  // le addizionali seguono la base IRPEF: la quota esente non le paga
  const surcharges = r2(base * (prm.regionalSurchargePct + prm.municipalSurchargePct))
  const net = r2(nonNeg(taxable - netTax - surcharges))

  const cost = personCost(p, prm).total
  return {
    gross, socialContributions: contributions, taxableIncome: taxable,
    exempt: imp.exemptAmount, taxableAfterExempt: base,
    impatriatePct: imp.active ? imp.exemptPct : 0,
    irpef: netTax, deductions: deduction, surcharges,
    net, perMonth: r2(net / monthsOf(p)),
    efficiency: cost > 0 ? r2(net / cost) : 0,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TFR, tredicesima, quattordicesima
// ═══════════════════════════════════════════════════════════════════════════

export type Accruals = {
  /** TFR maturato nell'anno, già al netto del Fondo di garanzia */
  tfrYear: number
  tfrMonth: number
  /** rateo mensile della tredicesima e quando esce */
  thirteenth: number
  thirteenthMonthly: number
  /** quattordicesima, se il contratto la prevede */
  fourteenth: number
  fourteenthMonthly: number
  /** quanto esce di cassa a dicembre e a giugno */
  decemberCash: number
  juneCash: number
}

/**
 * Quello che matura senza uscire.
 *
 * La tredicesima è una mensilità già dentro la RAL: qui si isola il rateo, per
 * sapere quanto se ne sta accumulando e quanto uscirà tutto insieme. È il
 * numero che manca a chi si trova dicembre addosso.
 */
export function accruals(p: PersonInput, prm: PayrollParams): Accruals {
  const spec = contractSpec(p.kind)
  const share = yearShare(p)
  const gross = r2(nonNeg(p.gross) * Math.max(0, p.fte) * share)
  const m = monthsOf(p)

  const tfrYear = spec.tfr ? r2((gross / prm.tfrDivisor) - gross * prm.tfrFundPct) : 0
  const monthly = m > 0 ? r2(gross / m) : 0

  const thirteenth = spec.tfr && m >= 13 ? monthly : 0
  const fourteenth = spec.tfr && m >= 14 ? monthly : 0

  // sulle mensilità aggiuntive l'azienda versa comunque i suoi contributi
  const load = 1 + employerRate(p, prm) + prm.inailPct

  return {
    tfrYear, tfrMonth: r2(tfrYear / 12),
    thirteenth, thirteenthMonthly: r2(thirteenth / 12),
    fourteenth, fourteenthMonthly: r2(fourteenth / 12),
    decemberCash: r2(thirteenth * load),
    juneCash: r2(fourteenth * load),
  }
}

/** Rivalutazione annua del TFR lasciato in azienda: 1,5% + 75% dell'inflazione. */
export const tfrRevaluation = (stock: number, inflation: number, prm: PayrollParams) =>
  r2(stock * (prm.tfrRevalFixedPct + inflation * prm.tfrRevalInflationShare))

// ═══════════════════════════════════════════════════════════════════════════
// Assumere o affidare fuori
// ═══════════════════════════════════════════════════════════════════════════

export type FlatTaxView = {
  taxableIncome: number
  contributions: number
  tax: number
  net: number
  /** quanto deve fatturare per portare a casa il netto di un dipendente */
  breakEvenInvoice: number
}

/**
 * Un forfettario, dal suo lato: quanto gli resta di quello che fattura.
 * Serve al confronto — e serve a non proporre a una persona un passaggio a
 * P.IVA che sulla carta la fa guadagnare di più e nei fatti no.
 */
export function flatTaxNet(invoiced: number, prm: PayrollParams, startup: boolean): FlatTaxView {
  const taxable = r2(invoiced * prm.flatTaxProfitability)
  const contributions = r2(taxable * prm.gestioneSeparataPct)
  const tax = r2(nonNeg(taxable - contributions) * (startup ? prm.flatTaxStartupPct : prm.flatTaxPct))
  const net = r2(invoiced - contributions - tax)
  const keepRate = invoiced > 0 ? net / invoiced : 0
  return {
    taxableIncome: taxable, contributions, tax, net,
    breakEvenInvoice: keepRate > 0 ? r2(1 / keepRate) : 0,
  }
}

export type Comparison = {
  employeeCost: number
  employeeNet: number
  /** la fattura che darebbe allo stesso netto passando a forfettario */
  equivalentInvoice: number
  /** differenza di costo per l'azienda a parità di netto per la persona */
  companyDelta: number
  /** true quando alla stessa cifra netta il forfettario costa meno all'azienda */
  cheaperAsVat: boolean
}

/**
 * A parità di **netto per la persona**, quanto costa all'azienda tenerla
 * dipendente e quanto costerebbe come forfettario.
 *
 * È l'unico confronto onesto. Paragonare una RAL a una fattura non lo è: la
 * RAL contiene tredicesima, TFR, ferie e malattia pagate, la fattura no.
 */
export function compareEmployment(p: PersonInput, prm: PayrollParams): Comparison | null {
  // su chi già fattura non c'è niente da confrontare: il netto non è nostro
  const net = personNet(p, prm).net
  if (net === null) return null

  const cost = personCost(p, prm).total
  const keep = flatTaxNet(10000, prm, p.startupRate).net / 10000
  const invoice = keep > 0 ? r2(net / keep) : 0
  return {
    employeeCost: cost, employeeNet: net,
    equivalentInvoice: invoice,
    companyDelta: r2(cost - invoice),
    cheaperAsVat: invoice < cost,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Il totale che finisce nel conto economico
// ═══════════════════════════════════════════════════════════════════════════

export type TeamTotals = {
  headcount: number
  fte: number
  /** costo annuo di competenza dell'intero organico */
  yearCost: number
  /** costo mensile medio: è la riga «Persone» del conto economico */
  monthCost: number
  yearCash: number
  gross: number
  contributions: number
  /** contributi risparmiati grazie agli esoneri: è costo che non c'è */
  relief: number
  /** quanto costerebbe l'organico senza nessuna agevolazione */
  costBeforeRelief: number
  tfr: number
  benefits: number
  /** ripartizione per tipologia contrattuale */
  byKind: { kind: ContractKind; label: string; count: number; cost: number }[]
  /** quota di costo che va a chi è dipendente: sopra il 70% si è rigidi */
  internalShare: number
}

export function teamTotals(people: PersonInput[], prm: PayrollParams): TeamTotals {
  const rows = people.map(p => ({ p, c: personCost(p, prm) }))
  const s = (f: (x: { p: PersonInput; c: CostBreakdown }) => number) => r2(rows.reduce((t, x) => t + f(x), 0))

  const byKind = CONTRACTS
    .map(spec => ({
      kind: spec.kind, label: spec.label,
      count: rows.filter(x => x.p.kind === spec.kind).length,
      cost: r2(rows.filter(x => x.p.kind === spec.kind).reduce((t, x) => t + x.c.total, 0)),
    }))
    .filter(k => k.count > 0)

  const yearCost = s(x => x.c.total)
  const internal = r2(rows
    .filter(x => contractSpec(x.p.kind).employment === 'subordinato')
    .reduce((t, x) => t + x.c.total, 0))

  const relief = s(x => x.c.relief)
  return {
    headcount: people.length,
    fte: r2(people.reduce((t, p) => t + Math.max(0, p.fte) * yearShare(p), 0)),
    yearCost,
    monthCost: r2(yearCost / 12),
    yearCash: s(x => x.c.cash),
    gross: s(x => x.c.gross),
    contributions: s(x => x.c.inpsEmployer + x.c.inail + x.c.fixedTermExtra),
    relief,
    costBeforeRelief: r2(yearCost + relief),
    tfr: s(x => x.c.tfr),
    benefits: s(x => x.c.benefits + x.c.mealVouchers),
    byKind,
    internalShare: yearCost > 0 ? r2(internal / yearCost) : 0,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Dove si può risparmiare senza fare i furbi
// ═══════════════════════════════════════════════════════════════════════════

export type Hint = {
  id: string
  severity: 'opportunita' | 'attenzione' | 'nota'
  title: string
  detail: string
  /** quanto vale, quando è quantificabile */
  value?: number
  action?: string
}

/**
 * Gli esoneri: quelli attivi, quelli che stanno scadendo, quelli mancati.
 *
 * Tre domande diverse e tutte e tre urgenti. Un esonero attivo va sorvegliato
 * (i requisiti si perdono); uno che scade è un aumento di costo con una data
 * sopra; uno mancato è denaro lasciato sul tavolo ogni mese che passa, e non si
 * recupera a posteriori.
 */
function incentiveHints(
  people: PersonInput[], prm: PayrollParams, today: string, eur: (n: number) => string,
): Hint[] {
  const out: Hint[] = []
  const subordinati = people.filter(p => contractSpec(p.kind).employment === 'subordinato')

  // ── configurati ma senza requisiti: il tool non li applica e lo dice ───────
  for (const p of subordinati) {
    const c = personCost(p, prm)
    const a = c.incentive
    if (!a) continue

    if (!a.eligible) {
      out.push({
        id: `esonero-ko-${p.name}`, severity: 'attenzione',
        title: `${p.name}: l'esonero configurato non risulta spettante`,
        detail: `${a.incentive.label}. ${a.blockers.join(' ')} Il costo mostrato è quello pieno: il tool non sconta un'agevolazione che non può verificare.`,
        action: 'O si correggono i dati in anagrafica, o si toglie l\'esonero dalla persona.',
      })
      continue
    }

    // scadenza: il mese dopo il costo risale, e va visto prima
    const mesiUsati = p.hiredOn ? monthsBetween(p.hiredOn, today) : null
    const mesiRestanti = mesiUsati == null ? null : a.incentive.durationMonths - mesiUsati
    if (mesiRestanti !== null && mesiRestanti > 0 && mesiRestanti <= 6) {
      out.push({
        id: `esonero-scade-${p.name}`, severity: 'attenzione',
        title: `${p.name}: l'esonero finisce fra ${mesiRestanti} mes${mesiRestanti === 1 ? 'e' : 'i'}`,
        detail: `${a.incentive.label} scade con ${a.endsOn?.slice(0, 7) ?? 'la fine del periodo'}. Da lì i contributi tornano pieni: circa ${eur(a.relief / Math.max(1, a.months))} in più al mese su questa persona.`,
        action: 'Mettilo nel budget del mese in cui accade, non a consuntivo.',
      })
    }
  }

  // ── mancati: chi avrebbe diritto a un esonero e non ce l'ha ────────────────
  const senza = subordinati.filter(p => !p.incentiveCode)
  const opportunita = senza
    .map(p => ({ p, best: incentiveOptions(p, prm, today).find(o => o.eligible && o.value > 0) }))
    .filter((x): x is { p: PersonInput; best: IncentiveVerdict & { value: number } } => !!x.best)

  if (opportunita.length) {
    const totale = r2(opportunita.reduce((t, x) => t + x.best.value, 0))
    const nomi = opportunita.map(x => `${x.p.name || 'senza nome'} (${x.best.incentive.label}, ${eur(x.best.value)})`)
    out.push({
      id: 'esonero-disponibile', severity: 'opportunita',
      title: `${opportunita.length} person${opportunita.length === 1 ? 'a' : 'e'} con un esonero contributivo disponibile`,
      detail: `${nomi.join(' · ')}. Sono contributi che non andrebbero versati: ${eur(totale)} l'anno ai valori attuali. `
        + 'Quasi tutte le misure chiedono l\'incremento occupazionale netto e la regolarità contributiva, e non si recuperano a posteriori: contano dal mese in cui si comunicano.',
      value: totale,
      action: 'Attivalo dalla scheda della persona e fallo confermare al consulente: l\'esonero si chiede all\'INPS, non si applica da sé.',
    })
  }

  // ── esoneri attivi: quanto stanno valendo ─────────────────────────────────
  const attivi = subordinati
    .map(p => personCost(p, prm))
    .filter(c => c.incentive?.eligible && c.relief > 0)
  if (attivi.length) {
    const totale = r2(attivi.reduce((t, c) => t + c.relief, 0))
    out.push({
      id: 'esonero-attivo', severity: 'nota',
      title: `${eur(totale)} di contributi non versati grazie agli esoneri`,
      detail: `${attivi.length} rapport${attivi.length === 1 ? 'o' : 'i'} con un'agevolazione attiva quest'anno. È costo che non c'è — ma è anche costo che tornerà: ogni esonero ha una fine, e il piano deve sapere quando.`,
      action: 'Tieni le comunicazioni INPS e il DURC in ordine: un\'irregolarità contributiva fa perdere l\'esonero con effetto retroattivo.',
    })
  }

  return out
}

/**
 * Ottimizzazioni fiscali, non scorciatoie.
 *
 * Ogni voce è uno strumento previsto dalla legge — welfare, buoni pasto,
 * apprendistato, esoneri, premi di risultato — con il suo tetto e la sua
 * condizione. Dove c'è un rischio, si segnala il rischio: un'agevolazione presa
 * male costa più di quella che non hai preso.
 */
export function payrollHints(
  people: PersonInput[], prm: PayrollParams, revenue = 0, today = '2026-01-01',
  /** aliquota IRES: serve a dire quanto vale la maxi-deduzione. Sta in `tax_config` */
  iresPct = 0.24,
): Hint[] {
  const out: Hint[] = []
  const eur = (n: number) => `€${Math.round(n).toLocaleString('it-IT')}`
  const tot = teamTotals(people, prm)
  const subordinati = people.filter(p => contractSpec(p.kind).employment === 'subordinato')

  // ── esoneri contributivi: quelli attivi, quelli che scadono, quelli mancati ─
  out.push(...incentiveHints(people, prm, today, eur))

  // ── maxi-deduzione IRES sulle nuove assunzioni ─────────────────────────────
  const year = today.slice(0, 4)
  const nuovi = subordinati.filter(p =>
    p.hiredOn?.slice(0, 4) === year && (p.kind === 'indeterminato' || p.kind === 'apprendistato'))
  if (nuovi.length) {
    const costo = r2(nuovi.reduce((t, p) => t + personCost(p, prm).total, 0))
    const protetti = r2(nuovi.filter(p => p.protectedCategory).reduce((t, p) => t + personCost(p, prm).total, 0))
    const md = maxiDeduction({
      newHiresCost: costo, payrollIncrease: costo, protectedCost: protetti,
      headcountIncrease: true, pct: 0.2, protectedPct: 0.3, iresPct,
    })
    out.push({
      id: 'maxi-deduzione', severity: 'opportunita',
      title: `Maxi-deduzione sulle ${nuovi.length} assunzion${nuovi.length === 1 ? 'e' : 'i'} del ${year}`,
      detail: `Il costo di un nuovo assunto a tempo indeterminato si deduce maggiorato del 20% — del 30% per le categorie meritevoli di maggior tutela. Su ${eur(costo)} di costo fanno ${eur(md.extraDeduction)} di deduzione in più, cioè circa ${eur(md.iresSaving)} di IRES. `
        + 'Il conto assume che il costo del personale complessivo sia cresciuto almeno di questa cifra e che i dipendenti a fine anno siano più della media dell\'anno prima: se non è così la deduzione non spetta.',
      value: md.iresSaving,
      action: 'È extracontabile: si applica in dichiarazione, non nel conto economico. Serve il conteggio dell\'incremento occupazionale, che lo fa il commercialista.',
    })
  }

  // ── rientro dei cervelli ──────────────────────────────────────────────────
  const impatriati = subordinati.filter(p => p.impatriateFrom)
  if (impatriati.length) {
    const rule = impatriateRuleOf(prm)
    for (const p of impatriati) {
      const n = personNet(p, prm)
      const senza = personNet({ ...p, impatriateFrom: null }, prm)
      const v = impatriateView(n.taxableIncome, p.impatriateFrom, prm.year, p.impatriateChildren, rule)
      const beneficio = (senza.net ?? 0) - (n.net ?? 0)
      out.push({
        id: `impatriati-${p.name}`,
        severity: v.yearsLeft !== null && v.yearsLeft <= 1 ? 'attenzione' : 'nota',
        title: v.active
          ? `${p.name}: regime impatriati, ${v.yearsLeft} ann${v.yearsLeft === 1 ? 'o' : 'i'} ancora`
          : `${p.name}: il regime impatriati è finito`,
        detail: v.active
          ? `Il ${Math.round(v.exemptPct * 100)}% del reddito non entra nella base IRPEF: sono circa ${eur(Math.abs(beneficio))} l'anno di netto in più a costo aziendale invariato. Ultimo anno agevolato: ${v.lastYear}. `
            + `L'impegno è restare residenti in Italia ${rule.stayYears} anni dal trasferimento: uscire prima fa restituire tutto il beneficio con gli interessi.`
          : `L'ultimo anno agevolato era il ${v.lastYear}. Da quest'anno l'IRPEF è piena: a parità di lordo il netto scende di circa ${eur(Math.abs(beneficio))}, e se il netto era la cifra concordata il lordo va rifatto.`,
        value: v.active ? r2(Math.abs(beneficio)) : undefined,
        action: v.active
          ? 'Verifica ogni anno che il lavoro resti prestato prevalentemente in Italia: è il requisito che si perde senza accorgersene.'
          : 'Rimetti mano al lordo prima che la persona se ne accorga dalla busta.',
      })
    }
  } else if (subordinati.length > 0) {
    out.push({
      id: 'impatriati-leva', severity: 'nota',
      title: 'Chi assumi dall\'estero paga IRPEF su metà del reddito',
      detail: `Il regime impatriati esenta il ${Math.round(prm.impatriatePct * 100)}% del reddito di lavoro per ${prm.impatriateYears} anni — il ${Math.round(prm.impatriateChildrenPct * 100)}% con un figlio minore — entro ${eur(prm.impatriateCap)} l'anno. Serve elevata qualificazione e tre periodi d'imposta di residenza estera, sei o sette se si rientra per lo stesso datore o gruppo.`,
      action: 'È la leva che rende competitiva un\'offerta a chi lavora fuori: il costo aziendale non cambia, il suo netto sì.',
    })
  }

  if (!prm.verifiedAt) {
    out.push({
      id: 'params-unverified', severity: 'attenzione',
      title: 'Le aliquote non sono state verificate',
      detail: 'I valori in uso sono quelli impostati alla creazione della sezione. L\'aliquota INPS a carico azienda dipende dal CCNL applicato e dalla dimensione: fra il 29% e il 32% per il terziario. Un punto di differenza su un organico da 100.000 € è mille euro l\'anno.',
      action: 'Fatti confermare le aliquote dal consulente del lavoro e segna la data in configurazione.',
    })
  }

  // ── Welfare e fringe benefit: esenti da imposte e contributi entro soglia ──
  const senzaBenefit = subordinati.filter(p => p.benefits <= 0)
  if (senzaBenefit.length) {
    // §183: chi ha figli a carico ha una soglia doppia — il potenziale si somma
    // persona per persona, non moltiplicando per un tetto medio
    const potenziale = senzaBenefit.reduce((t, p) => t + fringeCapFor(p, prm), 0)
    const conFigli = senzaBenefit.filter(p => p.hasChildren).length
    out.push({
      id: 'fringe', severity: 'opportunita',
      title: `${senzaBenefit.length} person${senzaBenefit.length === 1 ? 'a' : 'e'} senza fringe benefit`,
      detail: `Entro ${eur(prm.fringeBenefitCap)} l'anno — ${eur(prm.fringeBenefitCapChildren)} per chi ha figli a carico — i beni e servizi non fanno reddito: niente IRPEF, niente contributi. Un aumento in busta della stessa cifra costa all'azienda circa il doppio e ne arriva alla persona poco più della metà.`
        + (conFigli ? ` ${conFigli} di loro ${conFigli === 1 ? 'ha' : 'hanno'} figli e quindi la soglia doppia.` : ''),
      value: potenziale,
      action: 'Rimborso utenze, buoni acquisto o piano welfare: stessa spesa, arriva tutta.',
    })
  }

  // ── Buoni pasto: esenti fino alla soglia giornaliera se elettronici ────────
  const senzaMensa = subordinati.filter(p => p.mealDays <= 0)
  if (senzaMensa.length) {
    const potenziale = senzaMensa.length * 220 * prm.mealVoucherExempt
    out.push({
      id: 'meal', severity: 'opportunita',
      title: `Buoni pasto non erogati a ${senzaMensa.length} person${senzaMensa.length === 1 ? 'a' : 'e'}`,
      detail: `Fino a ${eur(prm.mealVoucherExempt)} al giorno in formato elettronico sono esenti e integralmente deducibili. Su un anno pieno valgono circa ${eur(220 * prm.mealVoucherExempt)} netti a testa.`,
      value: potenziale,
      action: 'I buoni cartacei hanno una soglia di esenzione più bassa: usare gli elettronici.',
    })
  }

  // ── Apprendistato: il contratto d'ingresso più conveniente ────────────────
  /* §183: con la data di nascita il suggerimento diventa verificato invece che
     probabile. Chi ha superato i trent'anni sparisce dall'elenco, e chi ci sta
     per arrivare diventa urgente: la finestra si chiude e non si riapre. */
  const junior = subordinati.filter(p => {
    if (p.kind !== 'indeterminato' || p.gross <= 0 || p.gross >= 25000) return false
    const e = eligibility(p, today)
    return e.age === null || e.apprentice
  })
  if (junior.length) {
    /* L'aliquota da confrontare è quella che si applicherebbe davvero: fino a
       nove dipendenti il primo anno di apprendistato costa il 3,11% invece del
       30%, e con l'aliquota media il suggerimento valeva meno di metà del vero. */
    const apprenticePct = prm.smallCompany ? prm.inpsApprenticeY1Pct : prm.inpsApprenticePct
    const risparmio = junior.reduce((t, p) =>
      t + (p.gross * (prm.inpsEmployerPct - apprenticePct)), 0)
    const inScadenza = junior.filter(p => {
      const e = eligibility(p, today)
      return e.monthsLeft !== null && e.monthsLeft <= 12
    })
    const senzaData = junior.filter(p => !p.birthDate).length
    out.push({
      id: 'apprendistato', severity: inScadenza.length ? 'attenzione' : 'opportunita',
      title: inScadenza.length
        ? `${inScadenza.length} profil${inScadenza.length === 1 ? 'o' : 'i'} perde l'apprendistato entro l'anno`
        : `${junior.length} profil${junior.length === 1 ? 'o' : 'i'} junior a contribuzione piena`,
      detail: `Fino ai ${APPRENTICE_MAX_AGE} anni compiuti l'apprendistato professionalizzante abbatte l'aliquota a carico azienda dal ${Math.round(prm.inpsEmployerPct * 100)}% al ${pcOf(apprenticePct)}%${prm.smallCompany ? ' nel primo anno (fino a nove dipendenti)' : ''}. Su questi profili varrebbe circa ${eur(risparmio)} l'anno.`
        + (inScadenza.length ? ` ${inScadenza.map(p => p.name).filter(Boolean).join(', ')}: la finestra si chiude entro dodici mesi.` : '')
        + (senzaData ? ` ${senzaData} sen${senzaData === 1 ? 'za' : 'za'} data di nascita: l'età non è verificata.` : ''),
      value: r2(risparmio),
      action: 'Richiede piano formativo e tutor: senza quelli l\'agevolazione si perde in ispezione.',
    })
  }

  // ── Premi di risultato: imposta sostitutiva al posto dell'IRPEF ───────────
  if (subordinati.length >= 2) {
    out.push({
      id: 'premi', severity: 'opportunita',
      title: 'Premio di risultato al posto dell\'aumento',
      detail: `Fino a ${eur(prm.productivityBonusCap)} l'anno il premio legato a obiettivi misurabili sconta l'imposta sostitutiva al ${Math.round(prm.productivityBonusPct * 100)}% invece dell'IRPEF ordinaria. Convertito in welfare è esente del tutto.`,
      action: 'Serve un accordo aziendale depositato e indicatori verificabili: senza, è retribuzione normale.',
    })
  }

  // ── Rigidità: quanto dell'organico non si può spegnere ────────────────────
  if (tot.yearCost > 0 && tot.internalShare > 0.8) {
    out.push({
      id: 'rigidita', severity: 'attenzione',
      title: `${Math.round(tot.internalShare * 100)}% del costo del personale è a tempo indeterminato`,
      detail: 'Il lavoro subordinato è un costo fisso: c\'è anche nei mesi senza fatturato. Con questa quota, un trimestre storto si sente subito in cassa.',
      action: 'Il mix va scelto, non subìto: una parte variabile dà respiro quando serve.',
    })
  }

  // ── Incidenza sul fatturato ───────────────────────────────────────────────
  if (revenue > 0 && tot.yearCost > 0) {
    const inc = tot.yearCost / revenue
    if (inc > 0.5) {
      out.push({
        id: 'incidenza', severity: 'attenzione',
        title: `Il personale vale il ${Math.round(inc * 100)}% del fatturato`,
        detail: `${eur(tot.yearCost)} di costo del lavoro su ${eur(revenue)} fatturati. Sopra la metà del fatturato resta poco per struttura, imposte e margine.`,
        action: 'O sale il valore venduto per persona, o il mix di contratti va rivisto.',
      })
    }
  }

  // ── Il TFR non è cassa disponibile ────────────────────────────────────────
  if (tot.tfr > 0) {
    out.push({
      id: 'tfr', severity: 'nota',
      title: `${eur(tot.tfr)} di TFR maturano quest'anno`,
      detail: 'Restano in azienda ma sono un debito verso le persone: usarli come liquidità significa trovarseli scoperti alla prima uscita. La rivalutazione annua è dell\'1,5% più tre quarti dell\'inflazione.',
      action: 'Accantonarli davvero, o destinarli a un fondo pensione e togliersi il pensiero.',
    })
  }

  // ── Vincolo di prevalenza sui forfettari ──────────────────────────────────
  const forfettari = people.filter(p => p.kind === 'piva_forfettario')
  if (forfettari.length >= 2) {
    out.push({
      id: 'forfettari', severity: 'attenzione',
      title: `${forfettari.length} collaboratori in regime forfettario`,
      detail: 'Se una persona fattura in prevalenza a te, con orari e postazione tuoi, il rapporto può essere riqualificato come subordinato: i contributi si pagano allora tutti insieme, con sanzioni.',
      action: 'Autonomia reale, più committenti, nessun obbligo di presenza: la forma deve corrispondere alla sostanza.',
    })
  }

  return out
}

// ═══════════════════════════════════════════════════════════════════════════
// Il cedolino, la fattura, l'F24 — cioè i documenti veri (§182)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Da qui in giù non si stima: si legge.
 *
 * Il modello sopra serve a decidere («quanto mi costerebbe assumere?»), questo
 * a sapere («quanto è costato giugno?»). Sono due domande diverse e vanno
 * tenute separate: mescolarle produce numeri che sembrano consuntivi e sono
 * previsioni.
 */

export type Payslip = {
  id: string
  personId: string
  month: string
  basePay: number
  holidaysTaken: number
  leavePaid: number
  publicHolidays: number
  thirteenth: number
  fourteenth: number
  overtime: number
  bonus: number
  allowances: number
  reimbursements: number
  travel: number
  /** il totale scritto sul cedolino, trascritto e non ricalcolato */
  totalEarnings: number
  contributoryBase: number
  taxableBase: number
  employeeContrib: number
  irpef: number
  surcharges: number
  otherDeductions: number
  rounding: number
  netPaid: number
  /** NULL = non ancora avuto dal consulente. Diverso da zero. */
  employerContrib: number | null
  inail: number | null
  otherEmployer: number
  tfrAccrued: number
  netPaidOn: string | null
  f24PaidOn: string | null
  paymentStatus: 'da_pagare' | 'pagato' | 'parziale'
}

export type CollabInvoice = {
  id: string
  personId: string
  month: string
  number: string | null
  taxable: number
  pensionFund: number
  vat: number
  vatDeductible: boolean
  withholding: number
  totalInvoice: number
  /** quello che esce dalla banca: la ritenuta la versa Two Bee allo Stato */
  amountToPay: number
  paidOn: string | null
  paymentStatus: 'da_pagare' | 'pagata' | 'parziale'
  hasDocument: boolean
}

export type F24 = {
  month: string
  erarioGross: number
  creditOffset: number
  erarioBalance: number
  inps: number
  inail: number
  other: number
  total: number
  paidOn: string | null
  /** true solo col prospetto individuale del consulente */
  individualDetail: boolean
}

export type TfrMovement = {
  personId: string
  month: string
  kind: 'fondo' | 'liquidazione' | 'anticipo' | 'rivalutazione'
  amount: number
}

/**
 * I tre valori, tenuti separati per costruzione.
 *
 * `economic` va nel conto economico, `cash` nel flusso di cassa, `net` è quello
 * che ha preso la persona. Non si sommano fra loro: il netto è **dentro** la
 * cassa, e i contributi datore sono dentro il costo economico ma escono con
 * l'F24, non col bonifico dello stipendio.
 */
export type ThreeViews = {
  /** costo di competenza del mese: competenze + oneri datore + TFR */
  economic: number
  /** uscita di banca del mese: netto + F24 di competenza + fatture pagate */
  cash: number
  /** quanto ha ricevuto la persona. null per una P.IVA: non è conoscibile */
  net: number | null
  /** costo maturato che non è ancora uscito (il TFR, e ciò che è da pagare) */
  accrued: number
  /** true quando gli oneri del datore sono stimati, non letti da un documento */
  estimated: boolean
}

/**
 * Il costo di un cedolino.
 *
 * Se `employer_contrib` è NULL il consulente non ha ancora mandato il prospetto:
 * si stima con l'aliquota dei parametri e si alza `estimated`. Una stima
 * dichiarata è utile; una stima travestita da consuntivo è una bugia che si
 * scopre a fine anno.
 */
export function payslipViews(s: Payslip, kind: ContractKind, prm: PayrollParams): ThreeViews {
  const spec = contractSpec(kind)

  const rate = kind === 'apprendistato' ? prm.inpsApprenticePct
    : spec.employment === 'subordinato' ? prm.inpsEmployerPct
    : 0
  /* «Stimato» solo dove ci sarebbe qualcosa da stimare: su un tirocinio gli
     oneri datoriali sono zero per legge, e uno zero certo non è una stima. */
  const hasEmployerCharges = rate > 0 || spec.inail
  const estimated = hasEmployerCharges && (s.employerContrib == null || s.inail == null)

  const employer = s.employerContrib ?? r2(s.contributoryBase * rate)
  const inail = s.inail ?? (spec.inail ? r2(s.contributoryBase * prm.inailPct) : 0)

  /* L'arrotondamento è denaro che esce davvero: sta nel netto ma non nelle
     competenze, quindi va aggiunto anche al costo. Senza, costo e cassa
     divergono di qualche centesimo a testa e la quadratura del mese non torna
     più — e una quadratura che non torna per poco è peggio di una che sbaglia
     di molto, perché nessuno la va a cercare. */
  const economic = r2(s.totalEarnings + s.rounding + employer + inail + s.otherEmployer + s.tfrAccrued)
  /* La cassa del mese: il netto più le trattenute che escono con l'F24 —
     contributi del lavoratore, IRPEF, addizionali — più gli oneri del datore.
     Il TFR resta fuori: matura adesso, esce quando la persona se ne va. */
  const cash = r2(s.netPaid + s.employeeContrib + s.irpef + s.surcharges + s.otherDeductions
    + employer + inail + s.otherEmployer)

  return { economic, cash, net: s.netPaid, accrued: s.tfrAccrued, estimated }
}

/** Quanto pesa e quanto esce per una fattura di collaborazione. */
export function invoiceViews(i: CollabInvoice): ThreeViews {
  // l'IVA detraibile si recupera: non è un costo, e contarla gonfia il P&L
  const nonDeductibleVat = i.vatDeductible ? 0 : i.vat
  return {
    economic: r2(i.taxable + i.pensionFund + nonDeductibleVat),
    cash: r2(i.amountToPay),
    // Two Bee conosce l'importo pagato, non le imposte personali di chi fattura
    net: null,
    accrued: i.paidOn ? 0 : r2(i.amountToPay),
    estimated: false,
  }
}

export type MonthLedger = {
  economic: number
  cash: number
  /** netti effettivamente corrisposti ai dipendenti */
  netPayroll: number
  /** importi pagati ai collaboratori: non chiamarli «netti» */
  paidToCollaborators: number
  employeeWithheld: number
  employerCharges: number
  tfrAccrued: number
  /** ancora da pagare a fine mese */
  owedToPeople: number
  owedToCollaborators: number
  /** quante persone hanno oneri datoriali stimati invece che letti */
  estimatedCount: number
  internalCost: number
  externalCost: number
}

/**
 * Il mese intero, con i due piani mai mescolati.
 *
 * `economic` è quello che va nel conto economico; `cash` è quello che è uscito
 * dalla banca. La differenza è il TFR maturato più ciò che è ancora da pagare:
 * è un numero che si deve poter spiegare, e infatti lo si espone.
 */
export function monthLedger(
  slips: { slip: Payslip; kind: ContractKind }[],
  invoices: CollabInvoice[],
  prm: PayrollParams,
): MonthLedger {
  const sum = (ns: number[]) => r2(ns.reduce((a, b) => a + b, 0))
  const views = slips.map(x => ({ ...x, v: payslipViews(x.slip, x.kind, prm) }))
  const inv = invoices.map(i => ({ i, v: invoiceViews(i) }))

  const internalCost = sum(views.map(x => x.v.economic))
  const externalCost = sum(inv.map(x => x.v.economic))

  return {
    economic: r2(internalCost + externalCost),
    cash: r2(sum(views.map(x => x.v.cash)) + sum(inv.map(x => x.v.cash))),
    netPayroll: sum(views.map(x => x.slip.netPaid)),
    paidToCollaborators: sum(inv.filter(x => x.i.paidOn).map(x => x.i.amountToPay)),
    employeeWithheld: sum(views.map(x => x.slip.employeeContrib + x.slip.irpef + x.slip.surcharges)),
    employerCharges: sum(views.map(x =>
      x.v.economic - x.slip.totalEarnings - x.slip.rounding - x.slip.tfrAccrued)),
    tfrAccrued: sum(views.map(x => x.slip.tfrAccrued)),
    owedToPeople: sum(views.filter(x => x.slip.paymentStatus !== 'pagato').map(x => x.slip.netPaid)),
    owedToCollaborators: sum(inv.filter(x => !x.i.paidOn).map(x => x.i.amountToPay)),
    estimatedCount: views.filter(x => x.v.estimated).length,
    internalCost,
    externalCost,
  }
}

export type TfrLedger = {
  personId: string
  accruedMonth: number
  accruedYear: number
  accruedTotal: number
  toFund: number
  liquidated: number
  advances: number
  revaluation: number
  /** quello che resta in azienda: è un debito, non liquidità */
  inCompany: number
}

/**
 * Il TFR di una persona, dall'inizio a oggi.
 *
 * Maturato meno quello che se n'è andato: a un fondo, in liquidazione, in
 * anticipo. Quello che resta è un debito verso chi lavora — e un debito che
 * qualcuno usa come cassa è un problema che si scopre il giorno delle
 * dimissioni.
 */
export function tfrLedger(
  personId: string,
  slips: Payslip[],
  movements: TfrMovement[],
  opening: number,
  month: string,
): TfrLedger {
  const own = slips.filter(s => s.personId === personId)
  const year = month.slice(0, 4)
  const mv = movements.filter(m => m.personId === personId)
  const of = (k: TfrMovement['kind']) => r2(mv.filter(m => m.kind === k).reduce((t, m) => t + m.amount, 0))

  const accruedTotal = r2(opening + own.reduce((t, s) => t + s.tfrAccrued, 0))
  const toFund = of('fondo')
  const liquidated = of('liquidazione')
  const advances = of('anticipo')
  const revaluation = of('rivalutazione')

  return {
    personId,
    accruedMonth: r2(own.filter(s => s.month === month).reduce((t, s) => t + s.tfrAccrued, 0)),
    accruedYear: r2(own.filter(s => s.month.startsWith(year)).reduce((t, s) => t + s.tfrAccrued, 0)),
    accruedTotal,
    toFund, liquidated, advances, revaluation,
    inCompany: r2(accruedTotal + revaluation - toFund - liquidated - advances),
  }
}

export type F24Check = {
  /** IRPEF trattenuta nei cedolini del mese */
  withheldIrpef: number
  /** contributi trattenuti alle persone */
  withheldContrib: number
  /** quanto dell'INPS dell'F24 resta a carico azienda, in aggregato */
  employerResidual: number
  /** l'IRPEF dei cedolini combacia con l'erario lordo dell'F24? */
  irpefMatches: boolean
  irpefDelta: number
  /** true finché manca il prospetto individuale: il per-persona resta stima */
  aggregateOnly: boolean
}

/**
 * L'F24 contro i cedolini.
 *
 * Due cose si possono dire con certezza: se l'IRPEF trattenuta alle persone
 * combacia con l'erario lordo del modello, e quanto dell'INPS resta a carico
 * dell'azienda una volta tolte le trattenute. La terza — **quanto** di quel
 * residuo tocca a ciascuno — non si può dire senza il prospetto individuale,
 * e infatti non la si dice.
 */
export function checkF24(f24: F24, slips: Payslip[]): F24Check {
  const sum = (f: (s: Payslip) => number) => r2(slips.reduce((t, s) => t + f(s), 0))
  const withheldIrpef = sum(s => s.irpef + s.surcharges)
  const withheldContrib = sum(s => s.employeeContrib)
  const delta = r2(f24.erarioGross - withheldIrpef)

  return {
    withheldIrpef,
    withheldContrib,
    employerResidual: r2(f24.inps - withheldContrib),
    irpefMatches: Math.abs(delta) < 0.02,
    irpefDelta: delta,
    aggregateOnly: !f24.individualDetail,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Controlli sui documenti (§182)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Cosa non torna fra cedolini, fatture, F24 e quello che era stato concordato.
 *
 * Non sono suggerimenti: sono errori. Un netto che non quadra col cedolino, un
 * TFR calcolato a una P.IVA, un costo senza contributi datore — ognuno di questi
 * produce un conto economico sbagliato, e sbagliato in silenzio.
 */
export function ledgerAlerts(
  rows: { person: { id: string; name: string; kind: ContractKind; agreedNet: number | null }
          slip?: Payslip; invoice?: CollabInvoice }[],
  f24: F24 | null,
  prm: PayrollParams,
  revenue = 0,
): Hint[] {
  const out: Hint[] = []
  const eur = (n: number) => `€${n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const near = (a: number, b: number, tol = 0.01) => Math.abs(a - b) <= tol

  for (const { person, slip, invoice } of rows) {
    const spec = contractSpec(person.kind)

    if (slip) {
      /* Il netto deve essere esattamente competenze meno trattenute, più
         l'arrotondamento dichiarato. Se non torna, o manca una voce o
         l'arrotondamento sta coprendo un errore. */
      const expected = slip.totalEarnings - slip.employeeContrib - slip.irpef
        - slip.surcharges - slip.otherDeductions + slip.rounding
      if (!near(expected, slip.netPaid)) {
        out.push({
          id: `net-${person.id}`, severity: 'attenzione',
          title: `${person.name}: il netto non torna col cedolino`,
          detail: `Competenze meno trattenute danno ${eur(expected)}, il cedolino dice ${eur(slip.netPaid)}. Differenza ${eur(slip.netPaid - expected)}.`,
          action: 'Manca una voce di trattenuta o di competenza: confrontare col cedolino originale.',
        })
      }

      // il totale del cedolino contro la somma delle sue voci
      const parts = slip.basePay + slip.holidaysTaken + slip.leavePaid + slip.publicHolidays
        + slip.thirteenth + slip.fourteenth + slip.overtime + slip.bonus
        + slip.allowances + slip.reimbursements + slip.travel
      if (parts > 0 && !near(parts, slip.totalEarnings, 0.02)) {
        out.push({
          id: `earnings-${person.id}`, severity: 'nota',
          title: `${person.name}: le voci non sommano al totale competenze`,
          detail: `Le singole voci fanno ${eur(parts)}, il totale dichiarato è ${eur(slip.totalEarnings)}.`,
          action: 'Una voce del cedolino non è stata trascritta.',
        })
      }

      if (spec.tfr && slip.tfrAccrued <= 0) {
        out.push({
          id: `tfr-missing-${person.id}`, severity: 'attenzione',
          title: `${person.name}: manca il TFR del mese`,
          detail: `Un contratto ${spec.label.toLowerCase()} matura TFR ogni mese. Senza, il costo di competenza è sottostimato.`,
          action: 'Prendere la quota dal cedolino e inserirla.',
        })
      }
      if (!spec.tfr && slip.tfrAccrued > 0) {
        out.push({
          id: `tfr-wrong-${person.id}`, severity: 'attenzione',
          title: `${person.name}: TFR su un contratto che non lo matura`,
          detail: `${spec.label} non matura TFR: ${eur(slip.tfrAccrued)} vanno tolti.`,
          action: 'Il costo di competenza è gonfiato di quella cifra.',
        })
      }

      if (slip.employerContrib == null && spec.employment === 'subordinato') {
        out.push({
          id: `employer-${person.id}`, severity: 'nota',
          title: `${person.name}: contributi datore stimati`,
          detail: 'Il prospetto individuale del consulente non è ancora stato inserito: il costo aziendale usa l\'aliquota di configurazione.',
          action: 'Chiedere il prospetto costo aziendale per dipendente, o il dettaglio UniEmens.',
        })
      }

      if (person.agreedNet && person.agreedNet > 0 && !near(person.agreedNet, slip.netPaid, 1)) {
        const d = slip.netPaid - person.agreedNet
        out.push({
          id: `agreed-${person.id}`, severity: 'attenzione',
          title: `${person.name}: scostamento dal netto concordato`,
          detail: `Concordato ${eur(person.agreedNet)}, pagato ${eur(slip.netPaid)}: ${d > 0 ? '+' : ''}${eur(d)}.`,
          action: 'Chiarire col consulente prima che diventi una consuetudine.',
        })
      }

      if (slip.travel > 0) {
        out.push({
          id: `travel-${person.id}`, severity: 'nota',
          title: `${person.name}: ${eur(slip.travel)} di trasferte in busta`,
          detail: 'Le trasferte in cedolino devono avere un giustificativo: senza, in verifica diventano retribuzione imponibile.',
          action: 'Allegare le note spesa del mese.',
        })
      }

      if (slip.paymentStatus !== 'pagato' && slip.netPaid > 0) {
        out.push({
          id: `unpaid-${person.id}`, severity: 'attenzione',
          title: `${person.name}: netto non ancora pagato`,
          detail: `${eur(slip.netPaid)} risultano ancora da corrispondere.`,
        })
      }
    }

    if (invoice) {
      if (spec.employment !== 'autonomo' && spec.employment !== 'parasubordinato') {
        out.push({
          id: `inv-kind-${person.id}`, severity: 'attenzione',
          title: `${person.name}: fattura su un contratto subordinato`,
          detail: 'Un dipendente non fattura: o la tipologia è sbagliata, o il documento non è quello giusto.',
        })
      }
      // l'IVA detraibile non è un costo: contarla gonfia il conto economico
      if (invoice.vat > 0 && !invoice.vatDeductible) {
        out.push({
          id: `vat-${person.id}`, severity: 'nota',
          title: `${person.name}: IVA indetraibile a costo`,
          detail: `${eur(invoice.vat)} di IVA entrano nel costo perché segnati come indetraibili. Se invece si detrae, il costo è più basso di altrettanto.`,
          action: 'Verificare la detraibilità prima di chiudere il mese.',
        })
      }
      if (!invoice.hasDocument) {
        out.push({
          id: `doc-${person.id}`, severity: 'attenzione',
          title: `${person.name}: pagamento senza documento`,
          detail: 'Non risulta caricata la fattura: senza documento il costo non è deducibile.',
        })
      }
      const expected = invoice.taxable + invoice.pensionFund + invoice.vat - invoice.withholding
      if (invoice.totalInvoice > 0 && !near(expected, invoice.amountToPay, 0.02)) {
        out.push({
          id: `inv-sum-${person.id}`, severity: 'nota',
          title: `${person.name}: l'importo da pagare non torna`,
          detail: `Imponibile più cassa e IVA, meno ritenuta, danno ${eur(expected)}; risulta ${eur(invoice.amountToPay)}.`,
        })
      }
    }
  }

  // ── F24 contro cedolini ────────────────────────────────────────────────────
  if (f24) {
    const slips = rows.map(r => r.slip).filter((s): s is Payslip => !!s)
    const chk = checkF24(f24, slips)
    if (!chk.irpefMatches && slips.length > 0) {
      out.push({
        id: 'f24-irpef', severity: 'attenzione',
        title: 'L\'IRPEF dei cedolini non combacia con l\'F24',
        detail: `I cedolini trattengono ${eur(chk.withheldIrpef)}, l'erario lordo del modello è ${eur(f24.erarioGross)}: differenza ${eur(chk.irpefDelta)}.`,
        action: 'O manca un cedolino, o l\'F24 comprende ritenute che non vengono dalle paghe.',
      })
    }
    if (chk.aggregateOnly && slips.length > 0) {
      out.push({
        id: 'f24-aggregate', severity: 'nota',
        title: 'Dato aziendale aggregato — ripartizione individuale non verificata',
        detail: `Tolte le trattenute alle persone, restano ${eur(chk.employerResidual)} di INPS a carico azienda. Quanto ne tocchi a ciascuno non è deducibile dall'F24.`,
        action: 'Serve il prospetto costo aziendale per dipendente, il riepilogo contributivo individuale o il dettaglio UniEmens.',
      })
    }
    if (!f24.paidOn) {
      out.push({
        id: 'f24-unpaid', severity: 'attenzione',
        title: `F24 da versare: ${eur(f24.total)}`,
        detail: 'Il modello del mese non risulta pagato.',
      })
    }
  }

  // ── incidenza sul fatturato ────────────────────────────────────────────────
  if (revenue > 0) {
    const cost = rows.reduce((t, r) => {
      if (r.slip) return t + payslipViews(r.slip, r.person.kind, prm).economic
      if (r.invoice) return t + invoiceViews(r.invoice).economic
      return t
    }, 0)
    if (cost / revenue > 0.5) {
      out.push({
        id: 'incidenza-mese', severity: 'attenzione',
        title: `Il personale vale il ${Math.round((cost / revenue) * 100)}% del fatturato del mese`,
        detail: `${eur(cost)} di costo su ${eur(revenue)} fatturati.`,
        action: 'Sopra la metà resta poco per struttura, imposte e margine.',
      })
    }
  }

  return out
}

// ═══════════════════════════════════════════════════════════════════════════
// Dal netto al lordo: si ragiona per mese, non per RAL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Nessuno pensa in RAL. Si pensa «a Michele do 1.500 al mese»: la RAL è un
 * numero che esce dal conto, non che ci entra. Qui si fa il percorso inverso.
 *
 * Il netto non si inverte con una formula: gli scaglioni IRPEF e la detrazione
 * che si consuma rendono la funzione lorda→netta continua ma a tratti. Si usa
 * una bisezione — trenta passi bastano per arrivare al centesimo, e costano
 * niente. Il fallimento è impossibile per costruzione: la funzione è monotona
 * crescente, quindi l'intervallo si dimezza sempre nella direzione giusta.
 */
export function grossFromMonthlyNet(
  monthlyNet: number,
  months: number,
  kind: ContractKind,
  prm: PayrollParams,
  fte = 1,
  /**
   * Il resto della persona, quando incide sul netto: il regime impatriati
   * cambia la RAL che serve per lo stesso netto di quasi un terzo, e invertire
   * senza saperlo produce un lordo sbagliato in modo silenzioso.
   */
  like: Partial<PersonInput> = {},
): number {
  if (monthlyNet <= 0) return 0
  const spec = contractSpec(kind)
  // per chi fattura non c'è nessuna busta da invertire: il mese è il mese
  if (spec.employment === 'autonomo') return r2(monthlyNet * 12)

  const target = monthlyNet * Math.max(1, months)
  const netOf = (gross: number) =>
    personNet(emptyPerson({ ...like, kind, gross, months, fte }), prm).net ?? 0

  let lo = 0
  let hi = Math.max(1000, target * 3)
  // il netto è sempre minore del lordo: se il tetto non basta si allarga
  while (netOf(hi) < target && hi < 10_000_000) hi *= 2

  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (netOf(mid) < target) lo = mid
    else hi = mid
  }
  return r2((lo + hi) / 2)
}

/** Il netto mensile che corrisponde a una RAL: il verso opposto, per rileggerlo. */
export function monthlyNetFromGross(
  gross: number,
  months: number,
  kind: ContractKind,
  prm: PayrollParams,
  fte = 1,
  like: Partial<PersonInput> = {},
): number | null {
  const n = personNet(emptyPerson({ ...like, kind, gross, months, fte }), prm)
  return n.perMonth
}

/**
 * Quanto si inserisce per una persona, e come si chiama.
 *
 * Un dipendente si concorda al **netto mensile**; un collaboratore al
 * **compenso mensile**. Chiamarli entrambi «RAL» costringe chi inserisce a
 * fare un conto a mente, ed è così che 1.300 al mese diventano 108.
 */
export function monthlyInputSpec(kind: ContractKind): {
  label: string
  hint: string
  /** true = il valore inserito è un netto e va invertito */
  isNet: boolean
} {
  const spec = contractSpec(kind)
  if (spec.employment === 'autonomo') {
    return { label: 'compenso/mese', hint: 'quanto fattura ogni mese, imponibile', isNet: false }
  }
  if (kind === 'tirocinio') {
    return { label: 'indennità/mese', hint: 'l\'indennità di partecipazione lorda', isNet: false }
  }
  return { label: 'netto/mese', hint: 'quanto gli arriva in busta: il lordo lo calcola il tool', isNet: true }
}

// ═══════════════════════════════════════════════════════════════════════════
// Età e famiglia (§183)
// ═══════════════════════════════════════════════════════════════════════════

/** Anni compiuti a una data. `null` se la data di nascita non c'è. */
export function ageAt(birthDate: string | null, on: string): number | null {
  if (!birthDate) return null
  const [by, bm, bd] = birthDate.split('-').map(Number)
  const [ny, nm, nd] = on.slice(0, 10).split('-').map(Number)
  if (!by || !ny) return null
  let age = ny - by
  if (nm < bm || (nm === bm && nd < bd)) age--
  return age >= 0 && age < 130 ? age : null
}

/** Limite d'età dell'apprendistato professionalizzante: si entra fino ai 29 compiuti. */
export const APPRENTICE_MAX_AGE = 29

export type Eligibility = {
  age: number | null
  /** può essere assunto in apprendistato professionalizzante */
  apprentice: boolean
  /** mesi che restano prima di superare il limite d'età */
  monthsLeft: number | null
}

/**
 * Cosa è ancora possibile, data l'età.
 *
 * Serve a un suggerimento che senza data di nascita resta generico: «questo
 * junior potrebbe stare in apprendistato» è utile solo se è vero, e diventa
 * urgente quando mancano pochi mesi al limite.
 */
export function eligibility(p: PersonInput, on: string): Eligibility {
  const age = ageAt(p.birthDate, on)
  if (age === null) return { age: null, apprentice: false, monthsLeft: null }
  const apprentice = age <= APPRENTICE_MAX_AGE
  // quanti mesi mancano al trentesimo compleanno
  const monthsLeft = apprentice ? Math.max(0, (APPRENTICE_MAX_AGE + 1 - age) * 12) : null
  return { age, apprentice, monthsLeft }
}

/** La soglia di fringe benefit che spetta davvero a questa persona. */
export const fringeCapFor = (p: PersonInput, prm: PayrollParams) =>
  p.hasChildren ? prm.fringeBenefitCapChildren : prm.fringeBenefitCap
