/**
 * Dalle righe del database ai tipi del motore.
 *
 * Sta in un file suo perché lo usano sia la pagina (server component) sia le
 * server action, e perché `lib/payroll.ts` deve restare puro: nessun tipo di
 * Supabase, nessun `unknown` da sbrogliare. I calcoli si verificano solo se non
 * sanno da dove arrivano i dati.
 */
import {
  DEFAULT_PAYROLL_PARAMS, emptyPerson,
  type PayrollParams, type PersonInput, type ContractKind, type IrpefBracket,
} from '@/lib/payroll'
import { mergeIncentives, type HiringIncentive } from '@/lib/incentives'

const num = (v: unknown, fallback = 0) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}
const str = (v: unknown) => (v == null ? null : String(v))

const KINDS: ContractKind[] = [
  'indeterminato', 'determinato', 'apprendistato', 'tirocinio', 'cococo',
  'piva_ordinario', 'piva_forfettario', 'occasionale',
  'socio_compenso', 'socio_fattura', 'fornitore',
]

export type PersonRow = PersonInput & {
  id: string; role: string | null; tfrOpening: number; active: boolean
  agreedNet: number | null; status: 'attiva' | 'sospesa' | 'cessata'
}

/** Le colonne §184 possono non esserci ancora: `has` distingue «no» da «non c'è». */
const flag = (v: unknown) => v === true

export function rowToPerson(r: Record<string, unknown>): PersonRow {
  const kind = KINDS.includes(r.contract_kind as ContractKind)
    ? (r.contract_kind as ContractKind)
    : 'indeterminato'

  return {
    ...emptyPerson(),
    name: String(r.full_name ?? ''),
    kind,
    gross: num(r.gross_year),
    months: num(r.months, 14),
    fte: num(r.fte, 1),
    benefits: num(r.benefits_year),
    mealDays: num(r.meal_days),
    mealValue: num(r.meal_value),
    birthDate: r.birth_date ? String(r.birth_date).slice(0, 10) : null,
    hasChildren: !!r.has_children,
    childrenCount: num(r.children_count),
    dependentSpouse: !!r.dependent_spouse,
    withRivalsa: !!r.with_rivalsa,
    startupRate: !!r.startup_rate,
    fromMonth: num(r.from_month, 1),
    toMonth: num(r.to_month, 12),
    // §184 — agevolazioni. `hired_on` cade indietro su `start_date`: chi c'era
    // prima della 184 ha già la data d'inizio rapporto, e serve la stessa cosa.
    hiredOn: r.hired_on ? String(r.hired_on).slice(0, 10)
      : r.start_date ? String(r.start_date).slice(0, 10) : null,
    neverStable: flag(r.never_stable),
    incentiveCode: str(r.incentive_code),
    apprenticeYear: num(r.apprentice_year, 1),
    impatriateFrom: r.impatriate_from ? String(r.impatriate_from).slice(0, 10) : null,
    impatriateChildren: flag(r.impatriate_children),
    protectedCategory: flag(r.protected_category),
    id: String(r.id),
    role: str(r.role_label),
    tfrOpening: num(r.tfr_opening),
    active: r.is_active !== false && r.status !== 'cessata',
    agreedNet: r.agreed_net == null ? null : Number(r.agreed_net),
    status: (r.status as 'attiva' | 'sospesa' | 'cessata') ?? 'attiva',
  }
}

/**
 * Le aliquote del database, con i default del motore a fare da rete: se una
 * colonna manca perché la migration è più vecchia del codice, il calcolo non
 * diventa zero — diventa il valore noto.
 */
export function rowToParams(
  r: Record<string, unknown>,
  /** §184: il catalogo degli esoneri viaggia coi parametri, come le aliquote */
  incentives?: HiringIncentive[],
): PayrollParams {
  const d = DEFAULT_PAYROLL_PARAMS
  const brackets = Array.isArray(r.irpef_brackets)
    ? (r.irpef_brackets as IrpefBracket[]).filter(b => typeof b?.rate === 'number')
    : d.irpef

  return {
    year: num(r.year, d.year),
    inpsEmployerPct: num(r.inps_employer_pct, d.inpsEmployerPct),
    inpsApprenticePct: num(r.inps_apprentice_pct, d.inpsApprenticePct),
    inpsApprenticeY1Pct: num(r.inps_apprentice_y1_pct, d.inpsApprenticeY1Pct),
    inpsApprenticeY2Pct: num(r.inps_apprentice_y2_pct, d.inpsApprenticeY2Pct),
    inpsApprenticeY3Pct: num(r.inps_apprentice_y3_pct, d.inpsApprenticeY3Pct),
    inpsEmployeePct: num(r.inps_employee_pct, d.inpsEmployeePct),
    inpsApprenticeEmployeePct: num(r.inps_apprentice_employee_pct, d.inpsApprenticeEmployeePct),
    // due fatti dell'azienda, non due aliquote: da chi dipende quale sconto spetta
    smallCompany: r.small_company == null ? d.smallCompany : r.small_company === true,
    zes: r.zes === true,
    impatriatePct: num(r.impatriate_pct, d.impatriatePct),
    impatriateChildrenPct: num(r.impatriate_children_pct, d.impatriateChildrenPct),
    impatriateCap: num(r.impatriate_cap, d.impatriateCap),
    impatriateYears: num(r.impatriate_years, d.impatriateYears),
    inailPct: num(r.inail_pct, d.inailPct),
    fixedTermExtraPct: num(r.fixed_term_extra_pct, d.fixedTermExtraPct),
    gestioneSeparataPct: num(r.gestione_separata_pct, d.gestioneSeparataPct),
    gestioneSeparataEmployerShare: d.gestioneSeparataEmployerShare,
    gestioneSeparataCap: num(r.gestione_separata_cap, d.gestioneSeparataCap),
    tfrDivisor: num(r.tfr_divisor, d.tfrDivisor) || d.tfrDivisor,
    tfrFundPct: num(r.tfr_fund_pct, d.tfrFundPct),
    tfrRevalFixedPct: num(r.tfr_reval_fixed_pct, d.tfrRevalFixedPct),
    tfrRevalInflationShare: num(r.tfr_reval_inflation_share, d.tfrRevalInflationShare),
    irpef: brackets.length ? brackets : d.irpef,
    regionalSurchargePct: num(r.regional_surcharge_pct, d.regionalSurchargePct),
    municipalSurchargePct: num(r.municipal_surcharge_pct, d.municipalSurchargePct),
    employeeDeduction: num(r.employee_deduction, d.employeeDeduction),
    employeeDeductionCap: num(r.employee_deduction_cap, d.employeeDeductionCap),
    flatTaxPct: num(r.flat_tax_pct, d.flatTaxPct),
    flatTaxStartupPct: num(r.flat_tax_startup_pct, d.flatTaxStartupPct),
    flatTaxProfitability: num(r.flat_tax_profitability, d.flatTaxProfitability),
    flatTaxCeiling: num(r.flat_tax_ceiling, d.flatTaxCeiling),
    withholdingPct: num(r.withholding_pct, d.withholdingPct),
    vatPct: num(r.vat_pct, d.vatPct),
    fringeBenefitCap: num(r.fringe_benefit_cap, d.fringeBenefitCap),
    fringeBenefitCapChildren: num(r.fringe_benefit_cap_children, d.fringeBenefitCapChildren),
    mealVoucherExempt: num(r.meal_voucher_exempt, d.mealVoucherExempt),
    productivityBonusPct: num(r.productivity_bonus_pct, d.productivityBonusPct),
    productivityBonusCap: num(r.productivity_bonus_cap, d.productivityBonusCap),
    incentives: incentives ?? d.incentives,
    source: str(r.source),
    verifiedAt: str(r.verified_at),
  }
}

/**
 * Il catalogo degli esoneri dal database.
 *
 * Le righe correggono i valori di partenza campo per campo (`mergeIncentives`):
 * un tetto che cambia a metà anno si sistema in una riga di SQL, non in un
 * deploy. Se la tabella non c'è ancora vale il catalogo del codice — e il tool
 * continua a funzionare, come per le altre migration.
 */
export function rowsToIncentives(rows: Record<string, unknown>[] | null | undefined): HiringIncentive[] {
  if (!rows?.length) return DEFAULT_PAYROLL_PARAMS.incentives
  const list = rows.filter(r => r.active !== false).map(r => ({
    code: String(r.code),
    label: r.label == null ? undefined : String(r.label),
    what: r.what == null ? undefined : String(r.what),
    exemptPct: r.exempt_pct == null ? undefined : Number(r.exempt_pct),
    monthlyCap: r.monthly_cap == null ? undefined : Number(r.monthly_cap),
    yearlyCap: r.yearly_cap == null ? undefined : Number(r.yearly_cap),
    zesMonthlyCap: r.zes_monthly_cap == null ? undefined : Number(r.zes_monthly_cap),
    durationMonths: r.duration_months == null ? undefined : Number(r.duration_months),
    windowFrom: r.window_from == null ? undefined : String(r.window_from).slice(0, 10),
    windowTo: r.window_to == null ? undefined : String(r.window_to).slice(0, 10),
    maxAge: r.max_age == null ? undefined : Number(r.max_age),
    requiresNeverStable: r.requires_never_stable == null ? undefined : r.requires_never_stable === true,
    requiresNetIncrease: r.requires_net_increase == null ? undefined : r.requires_net_increase === true,
    zesOnly: r.zes_only == null ? undefined : r.zes_only === true,
    manualOnly: r.manual_only == null ? undefined : r.manual_only === true,
    closed: r.closed == null ? undefined : r.closed === true,
    kinds: Array.isArray(r.kinds) ? (r.kinds as ContractKind[]) : undefined,
    conditions: Array.isArray(r.conditions) ? (r.conditions as string[]) : undefined,
    legalRef: r.legal_ref == null ? undefined : String(r.legal_ref),
    verifiedAt: r.verified_at == null ? null : String(r.verified_at).slice(0, 10),
    note: r.note == null ? null : String(r.note),
  }))
  return mergeIncentives(list)
}

/** I campi modificabili delle aliquote, con etichetta e formato. Guida la UI. */
export const PARAM_FIELDS: {
  key: string
  label: string
  hint: string
  format: 'pct' | 'eur' | 'num' | 'bool'
  group: 'contributi' | 'tfr' | 'irpef' | 'autonomi' | 'welfare' | 'agevolazioni'
}[] = [
  { key: 'inps_employer_pct', label: 'INPS a carico azienda', format: 'pct', group: 'contributi',
    hint: 'Dipende dal CCNL e dalla dimensione: 29-32% nel terziario. È la voce che pesa di più.' },
  { key: 'inps_apprentice_pct', label: 'INPS apprendistato oltre 9 dipendenti', format: 'pct', group: 'contributi',
    hint: 'Aliquota unica per tutta la durata: 11,61% comprensivo di NASpI e fondi.' },
  { key: 'inps_apprentice_y1_pct', label: 'Apprendistato 1º anno (fino a 9)', format: 'pct', group: 'contributi',
    hint: '1,5% più 1,61% di NASpI e fondi: è lo sconto più grosso che esiste sul lavoro subordinato.' },
  { key: 'inps_apprentice_y2_pct', label: 'Apprendistato 2º anno (fino a 9)', format: 'pct', group: 'contributi',
    hint: 'Sale al 3% più 1,61%.' },
  { key: 'inps_apprentice_y3_pct', label: 'Apprendistato 3º anno (fino a 9)', format: 'pct', group: 'contributi',
    hint: 'Dal terzo anno si allinea al 10% più 1,61%.' },
  { key: 'inps_employee_pct', label: 'INPS a carico dipendente', format: 'pct', group: 'contributi',
    hint: 'Trattenuta in busta: non è un costo azienda, ma serve a calcolare il netto.' },
  { key: 'inps_apprentice_employee_pct', label: 'INPS a carico apprendista', format: 'pct', group: 'contributi',
    hint: '5,84% invece del 9,19%: a parità di lordo un apprendista porta a casa di più.' },
  { key: 'inail_pct', label: 'INAIL', format: 'pct', group: 'contributi',
    hint: 'Dipende dalla lavorazione assicurata: per il lavoro d\'ufficio è basso.' },
  { key: 'fixed_term_extra_pct', label: 'Addizionale NASpI (determinato)', format: 'pct', group: 'contributi',
    hint: 'Si paga solo sui contratti a termine e aumenta a ogni rinnovo.' },
  { key: 'gestione_separata_pct', label: 'Gestione Separata', format: 'pct', group: 'contributi',
    hint: 'Co.co.co. e professionisti senza cassa. Sui co.co.co. due terzi sono a carico azienda.' },

  { key: 'tfr_divisor', label: 'Divisore TFR', format: 'num', group: 'tfr',
    hint: 'Art. 2120 c.c.: la retribuzione annua si divide per 13,5.' },
  { key: 'tfr_fund_pct', label: 'Contributo Fondo di garanzia', format: 'pct', group: 'tfr',
    hint: 'Si sottrae dalla quota TFR accantonata.' },
  { key: 'tfr_reval_fixed_pct', label: 'Rivalutazione TFR: quota fissa', format: 'pct', group: 'tfr',
    hint: 'Il TFR lasciato in azienda si rivaluta di 1,5% più una quota d\'inflazione.' },

  { key: 'regional_surcharge_pct', label: 'Addizionale regionale', format: 'pct', group: 'irpef',
    hint: 'Cambia per regione: incide sul netto, non sul costo azienda.' },
  { key: 'municipal_surcharge_pct', label: 'Addizionale comunale', format: 'pct', group: 'irpef',
    hint: 'Cambia per comune, fino allo 0,9%.' },
  { key: 'employee_deduction', label: 'Detrazione lavoro dipendente', format: 'eur', group: 'irpef',
    hint: 'Riduce l\'IRPEF dovuta; si consuma al crescere del reddito.' },

  { key: 'flat_tax_pct', label: 'Imposta sostitutiva forfettario', format: 'pct', group: 'autonomi',
    hint: 'Regime ordinario del forfettario.' },
  { key: 'flat_tax_startup_pct', label: 'Forfettario primi 5 anni', format: 'pct', group: 'autonomi',
    hint: 'Aliquota ridotta per le nuove attività.' },
  { key: 'flat_tax_profitability', label: 'Coefficiente di redditività', format: 'pct', group: 'autonomi',
    hint: 'Quota del fatturato che fa reddito: 78% per le attività professionali.' },
  { key: 'flat_tax_ceiling', label: 'Soglia ricavi forfettario', format: 'eur', group: 'autonomi',
    hint: 'Superata, si esce dal regime.' },
  { key: 'withholding_pct', label: 'Ritenuta d\'acconto', format: 'pct', group: 'autonomi',
    hint: 'Non è un costo: è imposta del professionista, che tu versi per lui.' },

  { key: 'fringe_benefit_cap', label: 'Fringe benefit esenti', format: 'eur', group: 'welfare',
    hint: 'Sotto questa soglia beni e servizi non fanno reddito: né IRPEF né contributi.' },
  { key: 'fringe_benefit_cap_children', label: 'Fringe benefit con figli', format: 'eur', group: 'welfare',
    hint: 'Soglia più alta per chi ha figli a carico.' },
  { key: 'meal_voucher_exempt', label: 'Buono pasto esente (elettronico)', format: 'eur', group: 'welfare',
    hint: 'Al giorno. Il formato cartaceo ha una soglia più bassa.' },
  { key: 'productivity_bonus_pct', label: 'Imposta premi di risultato', format: 'pct', group: 'welfare',
    hint: 'Al posto dell\'IRPEF ordinaria, con accordo aziendale depositato.' },
  { key: 'productivity_bonus_cap', label: 'Tetto premio di risultato', format: 'eur', group: 'welfare',
    hint: 'Oltre questa cifra il premio torna a tassazione ordinaria.' },

  /* §184 — due fatti dell'azienda e le regole del rientro dei cervelli. Non
     sono aliquote da contrattare: sono le condizioni da cui dipende quale
     agevolazione spetta, e sbagliarle sposta il costo del lavoro di parecchio. */
  { key: 'small_company', label: 'Fino a 9 dipendenti', format: 'bool', group: 'agevolazioni',
    hint: 'Decide l\'aliquota dell\'apprendistato: sotto i dieci dipendenti il primo anno costa 3,11% invece di 11,61%.' },
  { key: 'zes', label: 'Unità produttiva nella ZES Mezzogiorno', format: 'bool', group: 'agevolazioni',
    hint: 'Alza i tetti mensili degli esoneri e apre la decontribuzione Sud.' },
  { key: 'impatriate_pct', label: 'Impatriati: quota esente', format: 'pct', group: 'agevolazioni',
    hint: 'Quota di reddito che non entra nella base IRPEF. Il costo aziendale non cambia: cambia il netto.' },
  { key: 'impatriate_children_pct', label: 'Impatriati con figlio minore', format: 'pct', group: 'agevolazioni',
    hint: 'Quota più alta con almeno un figlio minorenne, o se nasce durante il periodo agevolato.' },
  { key: 'impatriate_cap', label: 'Impatriati: reddito agevolabile', format: 'eur', group: 'agevolazioni',
    hint: 'Oltre questo reddito annuo si applicano le aliquote ordinarie.' },
  { key: 'impatriate_years', label: 'Impatriati: anni agevolati', format: 'num', group: 'agevolazioni',
    hint: 'Cinque periodi d\'imposta dal trasferimento della residenza.' },
]

// ── §182: dai documenti veri ai tipi del motore ──────────────────────────────
import type { Payslip, CollabInvoice, F24, TfrMovement } from '@/lib/payroll'

const nOrNull = (v: unknown): number | null => (v == null ? null : Number(v))
const day = (v: unknown) => (v == null ? null : String(v).slice(0, 10))

export function rowToPayslip(r: Record<string, unknown>): Payslip {
  return {
    id: String(r.id), personId: String(r.person_id), month: day(r.month) ?? '',
    basePay: num(r.base_pay), holidaysTaken: num(r.holidays_taken), leavePaid: num(r.leave_paid),
    publicHolidays: num(r.public_holidays), thirteenth: num(r.thirteenth), fourteenth: num(r.fourteenth),
    overtime: num(r.overtime), bonus: num(r.bonus), allowances: num(r.allowances),
    reimbursements: num(r.reimbursements), travel: num(r.travel),
    totalEarnings: num(r.total_earnings),
    contributoryBase: num(r.contributory_base), taxableBase: num(r.taxable_base),
    employeeContrib: num(r.employee_contrib), irpef: num(r.irpef), surcharges: num(r.surcharges),
    otherDeductions: num(r.other_deductions), rounding: num(r.rounding), netPaid: num(r.net_paid),
    // null e zero sono cose diverse: uno è «non lo so», l'altro «non si paga»
    employerContrib: nOrNull(r.employer_contrib), inail: nOrNull(r.inail),
    otherEmployer: num(r.other_employer), tfrAccrued: num(r.tfr_accrued),
    netPaidOn: day(r.net_paid_on), f24PaidOn: day(r.f24_paid_on),
    paymentStatus: (r.payment_status as Payslip['paymentStatus']) ?? 'da_pagare',
  }
}

export function rowToInvoice(r: Record<string, unknown>): CollabInvoice {
  return {
    id: String(r.id), personId: String(r.person_id), month: day(r.month) ?? '',
    number: str(r.invoice_number),
    taxable: num(r.taxable), pensionFund: num(r.pension_fund), vat: num(r.vat),
    vatDeductible: r.vat_deductible !== false, withholding: num(r.withholding),
    totalInvoice: num(r.total_invoice), amountToPay: num(r.amount_to_pay),
    paidOn: day(r.paid_on),
    paymentStatus: (r.payment_status as CollabInvoice['paymentStatus']) ?? 'da_pagare',
    hasDocument: !!r.has_document,
  }
}

export function rowToF24(r: Record<string, unknown>): F24 {
  return {
    month: day(r.month) ?? '',
    erarioGross: num(r.erario_gross), creditOffset: num(r.credit_offset),
    erarioBalance: num(r.erario_balance), inps: num(r.inps), inail: num(r.inail),
    other: num(r.other), total: num(r.total),
    paidOn: day(r.paid_on), individualDetail: !!r.individual_detail,
  }
}

export const rowToTfrMovement = (r: Record<string, unknown>): TfrMovement => ({
  personId: String(r.person_id), month: day(r.month) ?? '',
  kind: r.kind as TfrMovement['kind'], amount: num(r.amount),
})

/** I campi del cedolino, raggruppati come su un cedolino vero. Guida la UI. */
export const PAYSLIP_FIELDS: {
  key: string; label: string; group: 'competenze' | 'imponibili' | 'trattenute' | 'datore'
  hint?: string
}[] = [
  { key: 'base_pay', label: 'Retribuzione ordinaria', group: 'competenze' },
  { key: 'holidays_taken', label: 'Ferie godute', group: 'competenze' },
  { key: 'leave_paid', label: 'Permessi', group: 'competenze' },
  { key: 'public_holidays', label: 'Festività', group: 'competenze' },
  { key: 'thirteenth', label: 'Tredicesima', group: 'competenze' },
  { key: 'fourteenth', label: 'Quattordicesima', group: 'competenze' },
  { key: 'overtime', label: 'Straordinari', group: 'competenze' },
  { key: 'bonus', label: 'Bonus', group: 'competenze' },
  { key: 'allowances', label: 'Indennità', group: 'competenze' },
  { key: 'reimbursements', label: 'Rimborsi', group: 'competenze' },
  { key: 'travel', label: 'Trasferte', group: 'competenze', hint: 'servono i giustificativi' },
  { key: 'total_earnings', label: 'Totale competenze', group: 'competenze', hint: 'si trascrive dal cedolino, non si ricalcola' },

  { key: 'contributory_base', label: 'Imponibile contributivo', group: 'imponibili' },
  { key: 'taxable_base', label: 'Imponibile fiscale', group: 'imponibili', hint: 'diverso dal contributivo' },

  { key: 'employee_contrib', label: 'Contributi a suo carico', group: 'trattenute' },
  { key: 'irpef', label: 'IRPEF', group: 'trattenute' },
  { key: 'surcharges', label: 'Addizionali', group: 'trattenute' },
  { key: 'other_deductions', label: 'Altre trattenute', group: 'trattenute' },
  { key: 'rounding', label: 'Arrotondamento', group: 'trattenute' },
  { key: 'net_paid', label: 'Netto pagato', group: 'trattenute' },

  { key: 'employer_contrib', label: 'Contributi a carico azienda', group: 'datore', hint: 'vuoto = stimato dall\'aliquota' },
  { key: 'inail', label: 'INAIL', group: 'datore', hint: 'vuoto = stimato' },
  { key: 'other_employer', label: 'Altri oneri aziendali', group: 'datore' },
  { key: 'tfr_accrued', label: 'TFR maturato nel mese', group: 'datore', hint: 'costo ora, cassa alla fine del rapporto' },
]
