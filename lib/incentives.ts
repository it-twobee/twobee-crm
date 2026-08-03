/**
 * Agevolazioni: chi ne ha diritto, quanto valgono, e cosa succede quando finiscono.
 *
 * Il costo del lavoro in Italia non è una moltiplicazione: è una moltiplicazione
 * **meno** quello che lo Stato non ti chiede. Un under 30 mai assunto a tempo
 * indeterminato costa la metà di contributi per tre anni; una persona rientrata
 * dall'estero paga IRPEF su metà del reddito per cinque; un nuovo assunto porta
 * una deduzione IRES del 120% del suo costo. Non saperlo non è un dettaglio
 * contabile: è la differenza fra assumere e non assumere.
 *
 * Tre principi, gli stessi di `lib/payroll.ts` e per la stessa ragione:
 *
 * 1. **Nessun numero di legge sta nel codice come verità.** Le percentuali, i
 *    tetti e le finestre stanno in `hr_incentives` e `tax_config`; quelli qui
 *    sotto sono i valori di partenza, con `verifiedAt` a NULL e il riferimento
 *    normativo accanto. Una norma sul lavoro cambia due volte l'anno: l'unica
 *    difesa è che il numero abbia un padre e una data.
 *
 * 2. **Le condizioni che il tool non può verificare, il tool non le dichiara
 *    vere.** L'età la sa; «disoccupato da ventiquattro mesi», «incremento
 *    occupazionale netto», «decreto attuativo pubblicato» no. Quelle restano
 *    condizioni scritte, da portare al consulente. Un'agevolazione presa senza
 *    requisiti si restituisce con sanzioni: vale meno di quella non presa.
 *
 * 3. **Un'agevolazione che scade è un aumento di costo con una data.** Ogni
 *    calcolo qui dentro sa quando finisce, perché il mese dopo il costo sale e
 *    quel salto va visto prima, non a consuntivo.
 *
 * Non è consulenza del lavoro né fiscale. È il conto che nessuno fa.
 */

import type { ContractKind } from '@/lib/payroll'

const r2 = (n: number) => Math.round(n * 100) / 100
const nonNeg = (n: number) => (n > 0 ? n : 0)

/** Indice assoluto del mese: serve a contare sovrapposizioni senza usare Date. */
const absMonth = (iso: string) => {
  const y = Number(iso.slice(0, 4))
  const m = Number(iso.slice(5, 7))
  return y > 0 && m >= 1 && m <= 12 ? y * 12 + m : null
}

// ═══════════════════════════════════════════════════════════════════════════
// Esoneri contributivi
// ═══════════════════════════════════════════════════════════════════════════

export type HiringIncentive = {
  code: string
  label: string
  /** una riga che dice cos'è, per chi non fa contratti di mestiere */
  what: string
  /** quota dei contributi **datore** che non si versa. 0,5 = metà */
  exemptPct: number
  /** tetto del beneficio: mensile, annuo, o nessuno dei due */
  monthlyCap: number | null
  yearlyCap: number | null
  durationMonths: number
  /** finestra delle assunzioni ammesse. null = misura strutturale */
  windowFrom: string | null
  windowTo: string | null
  /** età massima al momento dell'assunzione (29 = fino a 29 anni e 364 giorni) */
  maxAge: number | null
  /** richiede di non essere mai stato assunto a tempo indeterminato */
  requiresNeverStable: boolean
  /** richiede l'incremento occupazionale netto: non lo può sapere il tool */
  requiresNetIncrease: boolean
  /** solo per unità produttive nella ZES unica Mezzogiorno */
  zesOnly: boolean
  /** maggiorazione dei tetti nella ZES, quando la misura la prevede */
  zesMonthlyCap: number | null
  /** tipologie contrattuali su cui si applica */
  kinds: ContractKind[]
  /** condizioni che restano da verificare a mano, una per riga */
  conditions: string[]
  /** true = si propone solo a mano (requisiti che non teniamo in anagrafica) */
  manualOnly: boolean
  /** true = la misura non è più attivabile: resta per non riproporla */
  closed: boolean
  legalRef: string
  /** i numeri sono confermati? null = valori di partenza, da far verificare */
  verifiedAt: string | null
  note: string | null
}

const inc = (o: Partial<HiringIncentive> & Pick<HiringIncentive, 'code' | 'label' | 'what' | 'legalRef'>): HiringIncentive => ({
  exemptPct: 1, monthlyCap: null, yearlyCap: null, durationMonths: 24,
  windowFrom: null, windowTo: null, maxAge: null,
  requiresNeverStable: false, requiresNetIncrease: false,
  zesOnly: false, zesMonthlyCap: null,
  kinds: ['indeterminato'], conditions: [], manualOnly: false, closed: false,
  verifiedAt: null, note: null, ...o,
})

/**
 * Il catalogo degli esoneri, al 2026.
 *
 * **Da far confermare al consulente del lavoro prima di farci un piano.** Le
 * misure sul lavoro giovanile hanno cambiato pelle tre volte fra il 2024 e il
 * 2026: il decreto Coesione ha aperto una finestra, la legge di bilancio 2026
 * l'ha chiusa e ne ha aperta un'altra rinviando importi e requisiti a un decreto
 * attuativo. Dove il numero non è ancora legge, qui è scritto che non lo è.
 */
export const HIRING_INCENTIVES: HiringIncentive[] = [
  inc({
    code: 'under30_strutturale',
    label: 'Esonero strutturale under 30',
    what: 'Metà dei contributi a carico azienda per tre anni, su chi non ha ancora trent\'anni e non è mai stato assunto a tempo indeterminato.',
    exemptPct: 0.5, yearlyCap: 3000, monthlyCap: 250, durationMonths: 36,
    maxAge: 29, requiresNeverStable: true,
    kinds: ['indeterminato', 'apprendistato'],
    legalRef: 'L. 205/2017, art. 1 co. 100-108',
    conditions: [
      'Mai assunto a tempo indeterminato da nessuno: apprendistato, intermittente e lavoro domestico non contano.',
      'Non si applica ai profili dirigenziali.',
      'Sull\'apprendista vale nei dodici mesi successivi alla conferma in indeterminato.',
    ],
    note: 'È l\'unica misura sui giovani davvero strutturale: non ha una finestra da rispettare.',
  }),
  inc({
    code: 'esonero_2026',
    label: 'Nuovo esonero occupazione stabile 2026',
    what: 'Esonero dei contributi datore sulle assunzioni a tempo indeterminato del 2026: giovani, donne svantaggiate e ZES Mezzogiorno.',
    exemptPct: 1, monthlyCap: 650, yearlyCap: 8000, zesMonthlyCap: 800,
    durationMonths: 24,
    windowFrom: '2026-01-01', windowTo: '2026-12-31',
    requiresNetIncrease: true,
    kinds: ['indeterminato'],
    legalRef: 'L. 199/2025 (bilancio 2026), art. 1 co. 153-155',
    conditions: [
      'Importi e requisiti li fissa un decreto del Ministero del Lavoro: fino a quel decreto le cifre qui sono anticipazioni di stampa, non norma.',
      'Vale per assunzioni a tempo indeterminato e trasformazioni fatte fra il 1º gennaio e il 31 dicembre 2026.',
      'Esclusi i premi INAIL e i profili dirigenziali.',
      'Risorse stanziate a tetto di spesa: l\'ordine di arrivo conta.',
    ],
    note: 'Le tre platee (giovani, donne svantaggiate, ZES) e i tetti differenziati vanno riletti quando esce il decreto attuativo.',
  }),
  inc({
    code: 'under35_coesione',
    label: 'Bonus giovani under 35 (decreto Coesione)',
    what: 'Azzeramento dei contributi datore per due anni sugli under 35 mai occupati stabilmente. Finestra chiusa: resta per le posizioni già in corso.',
    exemptPct: 1, monthlyCap: 500, zesMonthlyCap: 650, durationMonths: 24,
    windowFrom: '2024-09-01', windowTo: '2025-12-31',
    maxAge: 34, requiresNeverStable: true, requiresNetIncrease: true,
    kinds: ['indeterminato'],
    closed: true,
    legalRef: 'D.L. 60/2024 (Coesione), art. 22',
    conditions: [
      'La finestra delle nuove assunzioni è chiusa: la legge di bilancio 2026 non l\'ha prorogata e l\'ha sostituita col nuovo esonero.',
      'Chi l\'ha già attivata la porta a termine per i 24 mesi: va tenuta in conto nel costo, non riproposta.',
      'Sulle code di stabilizzazione dei primi mesi 2026 le fonti divergono: verificare con il consulente prima di contarci.',
    ],
  }),
  inc({
    code: 'donne_svantaggiate',
    label: 'Bonus assunzione donne svantaggiate',
    what: 'Esonero sui contributi datore per l\'assunzione di donne senza impiego regolarmente retribuito da almeno ventiquattro mesi.',
    exemptPct: 1, monthlyCap: 650, zesMonthlyCap: 800, durationMonths: 24,
    requiresNetIncrease: true, manualOnly: true,
    kinds: ['indeterminato', 'determinato'],
    legalRef: 'D.L. 60/2024, art. 23 · L. 92/2012, art. 4 co. 8-11',
    conditions: [
      'Serve la condizione di svantaggio documentata: 24 mesi senza impiego regolarmente retribuito, 6 nelle aree svantaggiate.',
      'Richiede incremento occupazionale netto.',
      'Non è in anagrafica il dato che serve a proporlo da sé: si valuta caso per caso.',
    ],
  }),
  inc({
    code: 'over50',
    label: 'Bonus over 50 disoccupati',
    what: 'Metà dei contributi datore per l\'assunzione di chi ha più di cinquant\'anni ed è disoccupato da oltre dodici mesi.',
    exemptPct: 0.5, durationMonths: 18, manualOnly: true,
    kinds: ['indeterminato', 'determinato'],
    legalRef: 'L. 92/2012, art. 4 co. 8-11',
    conditions: [
      'Disoccupazione da oltre dodici mesi da dimostrare.',
      'Diciotto mesi sull\'indeterminato, dodici sul determinato.',
    ],
  }),
  inc({
    code: 'decontribuzione_sud',
    label: 'Decontribuzione Sud PMI',
    what: 'Sconto sui contributi datore per le imprese con unità produttive nel Mezzogiorno, in riduzione anno per anno.',
    exemptPct: 0.2, monthlyCap: 125, durationMonths: 12,
    zesOnly: true, manualOnly: true,
    kinds: ['indeterminato'],
    legalRef: 'L. 207/2024 (bilancio 2025), art. 1 co. 406-412',
    conditions: [
      'Solo unità produttive nelle regioni del Mezzogiorno.',
      'La percentuale scende ogni anno fino al 2029: quella del 2026 va verificata prima di usarla.',
      'Autorizzazione europea e regime de minimis: lo verifica il consulente, non il tool.',
    ],
  }),
]

export const incentiveByCode = (
  code: string | null | undefined, list: HiringIncentive[] = HIRING_INCENTIVES,
): HiringIncentive | null => (code ? list.find(i => i.code === code) ?? null : null)

/**
 * Il catalogo del database sopra quello del codice.
 *
 * Le righe di `hr_incentives` vincono sui valori di partenza campo per campo: si
 * corregge un tetto senza toccare la prosa, e una misura nuova si aggiunge senza
 * un deploy. Un codice che il codice non conosce entra comunque, con quello che
 * il database sa dire.
 */
export function mergeIncentives(rows: Partial<HiringIncentive>[]): HiringIncentive[] {
  const out = HIRING_INCENTIVES.map(base => {
    const row = rows.find(r => r.code === base.code)
    return row ? { ...base, ...strip(row) } : base
  })
  for (const row of rows) {
    if (!row.code || out.some(i => i.code === row.code)) continue
    out.push(inc({
      code: row.code, label: row.label ?? row.code,
      what: row.what ?? 'Misura configurata a mano: la descrizione la scrive chi l\'ha aggiunta.',
      legalRef: row.legalRef ?? 'da compilare', ...strip(row),
    }))
  }
  return out
}

/** Le chiavi a `undefined` non devono cancellare quello che il codice sa già. */
const strip = <T extends object>(o: T): Partial<T> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>

// ── Chi ne ha diritto ────────────────────────────────────────────────────────

/** Quello che serve sapere di una persona per dire se un esonero è possibile. */
export type PersonFacts = {
  kind: ContractKind
  birthDate: string | null
  /** data di assunzione: decide la finestra e da quando corrono i mesi */
  hiredOn: string | null
  /** mai assunto a tempo indeterminato da nessuno */
  neverStable: boolean
  /** l'unità produttiva sta nella ZES unica Mezzogiorno */
  zes: boolean
}

export type IncentiveVerdict = {
  incentive: HiringIncentive
  eligible: boolean
  /** cosa lo blocca, in una riga per ostacolo */
  blockers: string[]
  /** età all'assunzione, quando la data di nascita c'è */
  ageAtHire: number | null
  /** mesi di agevolazione già usati e ancora davanti */
  monthsUsed: number | null
  monthsLeft: number | null
  /** il tetto mensile che si applica davvero a questa azienda */
  monthlyCap: number | null
}

/** Anni compiuti a una data: duplicato minimo di `ageAt`, per non creare un ciclo. */
const ageOn = (birthDate: string | null, on: string): number | null => {
  if (!birthDate) return null
  const [by, bm, bd] = birthDate.slice(0, 10).split('-').map(Number)
  const [ny, nm, nd] = on.slice(0, 10).split('-').map(Number)
  if (!by || !ny) return null
  let age = ny - by
  if (nm < bm || (nm === bm && nd < bd)) age--
  return age >= 0 && age < 130 ? age : null
}

/**
 * L'esonero è possibile su questa persona?
 *
 * Risponde solo di ciò che sa: età, contratto, finestra, storia contrattuale
 * dichiarata. Tutto il resto resta scritto in `conditions` — perché un «sì»
 * dato senza requisiti costa più di un «forse».
 */
export function checkIncentive(i: HiringIncentive, f: PersonFacts, on: string): IncentiveVerdict {
  const blockers: string[] = []
  const ageAtHire = ageOn(f.birthDate, f.hiredOn ?? on)

  /* `closed` non è un ostacolo: la finestra chiusa la controlla già la data di
     assunzione, e un rapporto che l'agevolazione l'ha ottenuta prima se la tiene
     per tutti i suoi mesi. Serve a non **proporla** più — è `rankIncentives` a
     escluderla dalle opportunità, non questo controllo. */
  if (!i.kinds.includes(f.kind)) blockers.push(`Non si applica al contratto ${f.kind.replace('_', ' ')}.`)

  if (i.maxAge != null) {
    if (ageAtHire == null) blockers.push('Manca la data di nascita: l\'età all\'assunzione non è verificabile.')
    else if (ageAtHire > i.maxAge) blockers.push(`Aveva ${ageAtHire} anni all'assunzione, il limite è ${i.maxAge}.`)
  }
  if (i.requiresNeverStable && !f.neverStable) {
    blockers.push('Risulta già assunto a tempo indeterminato in passato.')
  }
  if (i.zesOnly && !f.zes) blockers.push('Riservata alle unità produttive del Mezzogiorno.')

  if (i.windowFrom || i.windowTo) {
    if (!f.hiredOn) blockers.push('Manca la data di assunzione: la finestra non è verificabile.')
    else if (i.windowFrom && f.hiredOn < i.windowFrom) blockers.push(`Assunzione precedente al ${i.windowFrom}.`)
    else if (i.windowTo && f.hiredOn > i.windowTo) blockers.push(`La finestra si è chiusa il ${i.windowTo}.`)
  }

  const used = f.hiredOn ? monthsBetween(f.hiredOn, on) : null
  const left = used == null ? null : Math.max(0, i.durationMonths - used)
  if (left === 0) blockers.push(`I ${i.durationMonths} mesi di agevolazione sono finiti.`)

  return {
    incentive: i,
    eligible: blockers.length === 0,
    blockers,
    ageAtHire,
    monthsUsed: used,
    monthsLeft: left,
    monthlyCap: f.zes && i.zesMonthlyCap != null ? i.zesMonthlyCap : i.monthlyCap,
  }
}

/** Mesi interi fra due date, la prima compresa. Negativo se `to` precede `from`. */
export function monthsBetween(from: string, to: string): number {
  const a = absMonth(from)
  const b = absMonth(to)
  if (a == null || b == null) return 0
  return b - a + 1
}

/**
 * Gli esoneri possibili, dal più conveniente.
 *
 * Il valore si stima sui contributi datore dell'anno: senza quel numero l'ordine
 * sarebbe alfabetico, e un elenco alfabetico di agevolazioni non aiuta nessuno.
 */
export function rankIncentives(
  f: PersonFacts, on: string, employerContribYear: number,
  list: HiringIncentive[] = HIRING_INCENTIVES,
): (IncentiveVerdict & { value: number })[] {
  return list
    .map(i => {
      const v = checkIncentive(i, f, on)
      /* Una misura a finestra chiusa non si propone: chi ce l'ha la tiene, ma
         suggerirla su una nuova assunzione manderebbe qualcuno a chiedere
         all'INPS un'agevolazione che non esiste più. */
      const value = v.eligible && !i.closed
        ? contribRelief(i, {
            employerContribYear, monthsPresent: 12,
            monthsCovered: Math.min(12, v.monthsLeft ?? 12), zes: f.zes,
          })
        : 0
      return { ...v, value }
    })
    .sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.value - a.value)
}

// ── Quanto vale ──────────────────────────────────────────────────────────────

export type ReliefInput = {
  /** contributi datore dell'anno **prima** dell'esonero */
  employerContribYear: number
  /** mesi dell'anno in cui la persona è in organico */
  monthsPresent: number
  /** mesi dell'anno coperti dall'agevolazione */
  monthsCovered: number
  zes?: boolean
}

/**
 * L'esonero in euro, con i tetti applicati mese per mese.
 *
 * I tetti non si applicano al totale annuo ma a ogni mensilità: chi guadagna
 * molto non porta a casa un esonero proporzionale, lo porta fino al tetto. È la
 * ragione per cui un esonero «al 100%» su uno stipendio alto vale in pratica
 * meno della metà dei contributi.
 */
export function contribRelief(i: HiringIncentive, a: ReliefInput): number {
  const present = Math.min(12, Math.max(0, a.monthsPresent))
  const months = Math.min(Math.max(0, a.monthsCovered), present)
  if (months <= 0 || a.employerContribYear <= 0) return 0

  const perMonth = a.employerContribYear / present
  const cap = a.zes && i.zesMonthlyCap != null ? i.zesMonthlyCap : i.monthlyCap
  const monthly = Math.min(perMonth * i.exemptPct, cap ?? Infinity)
  const raw = monthly * months
  // il tetto annuo si consuma in dodicesimi: un anno parziale non lo usa tutto
  const yearly = i.yearlyCap == null ? Infinity : i.yearlyCap * (months / 12)
  return r2(nonNeg(Math.min(raw, yearly)))
}

/**
 * Quanti mesi dell'anno sono coperti dall'agevolazione.
 *
 * Serve perché un esonero partito a settembre 2025 e lungo ventiquattro mesi
 * copre tutto il 2026 e i primi otto mesi del 2027: il costo del 2027 sale a
 * settembre, e nel piano si deve vedere lì.
 */
export function coveredMonthsInYear(
  i: HiringIncentive, start: string | null, year: number, fromMonth = 1, toMonth = 12,
): number {
  const s = start ? absMonth(start) : null
  if (s == null) return 0
  const end = s + i.durationMonths - 1
  const a = year * 12 + Math.min(Math.max(1, fromMonth), 12)
  const b = year * 12 + Math.min(Math.max(fromMonth, toMonth), 12)
  return Math.max(0, Math.min(end, b) - Math.max(s, a) + 1)
}

/** Il mese in cui l'agevolazione finisce, per sapere quando il costo risale. */
export function incentiveEnds(i: HiringIncentive, start: string | null): string | null {
  const s = start ? absMonth(start) : null
  if (s == null) return null
  const end = s + i.durationMonths - 1
  const y = Math.floor((end - 1) / 12)
  const m = end - y * 12
  return `${y}-${String(m).padStart(2, '0')}-01`
}

// ═══════════════════════════════════════════════════════════════════════════
// Rientro dei cervelli (regime impatriati)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Non è un esonero contributivo: i contributi si pagano tutti. È **IRPEF** che
 * non si paga, e su una parte enorme del reddito. Per l'azienda il costo non
 * cambia di un euro; per la persona il netto sale di migliaia — che è
 * esattamente la leva da usare quando si assume qualcuno che sta all'estero e la
 * cifra lorda che gli si può offrire non basta.
 */
export type ImpatriateRule = {
  /** quota di reddito che non concorre alla base IRPEF */
  exemptPct: number
  /** con almeno un figlio minore, o se nasce durante il periodo agevolato */
  exemptPctWithChildren: number
  /** limite di reddito agevolabile: sopra, aliquote ordinarie */
  incomeCap: number
  /** periodi d'imposta agevolati */
  years: number
  /** periodi di residenza estera richiesti: caso ordinario */
  foreignYears: number
  /** se si lavora per lo stesso datore o gruppo e non si è mai lavorato in Italia */
  foreignYearsSameEmployer: number
  /** se si lavora per lo stesso datore o gruppo e in Italia si era già lavorato */
  foreignYearsSameEmployerWorkedInItaly: number
  /** anni di residenza italiana obbligatoria: uscire prima fa decadere tutto */
  stayYears: number
  legalRef: string
  verifiedAt: string | null
}

export const IMPATRIATE_RULE: ImpatriateRule = {
  exemptPct: 0.5,
  exemptPctWithChildren: 0.6,
  incomeCap: 600000,
  years: 5,
  foreignYears: 3,
  foreignYearsSameEmployer: 6,
  foreignYearsSameEmployerWorkedInItaly: 7,
  stayYears: 4,
  legalRef: 'D.Lgs. 209/2023, art. 5',
  verifiedAt: null,
}

/** I requisiti di qualificazione: uno dei tre basta, ma uno serve. */
export const IMPATRIATE_QUALIFICATION = [
  'Laurea (titolo di istruzione superiore almeno triennale).',
  'Abilitazione all\'esercizio di una professione regolamentata.',
  'Almeno cinque anni di esperienza documentata nel settore.',
]

export const IMPATRIATE_CONDITIONS = [
  'Il lavoro va prestato prevalentemente in Italia: le trasferte brevi non rompono il requisito, lo stabile all\'estero sì.',
  'Impegno a mantenere la residenza fiscale italiana per quattro anni: uscire prima fa recuperare le imposte non versate, con interessi.',
  'Vale su lavoro dipendente, redditi assimilati e lavoro autonomo — quindi anche su un compenso da amministratore.',
  'Chi rientra per lo stesso datore o gruppo ha requisiti di residenza estera più lunghi: sei anni, sette se in Italia aveva già lavorato per loro.',
]

export type ImpatriateView = {
  /** quota di reddito che non si tassa */
  exemptPct: number
  /** reddito agevolabile: oltre il tetto, aliquote piene */
  eligibleIncome: number
  /** euro di reddito che non entrano nella base IRPEF */
  exemptAmount: number
  /** anni agevolati residui, compreso quello in corso */
  yearsLeft: number | null
  active: boolean
  /** ultimo anno agevolato */
  lastYear: number | null
}

/**
 * La quota esente, dato il reddito e l'anno.
 *
 * Il tetto di 600.000 € è sul reddito agevolabile, non sull'esenzione: su un
 * reddito più alto la parte oltre il tetto si tassa per intero.
 */
export function impatriateView(
  taxableIncome: number, from: string | null, year: number,
  withMinorChildren: boolean, rule: ImpatriateRule = IMPATRIATE_RULE,
): ImpatriateView {
  const startYear = from ? Number(from.slice(0, 4)) : null
  const lastYear = startYear ? startYear + rule.years - 1 : null
  const active = startYear != null && year >= startYear && lastYear != null && year <= lastYear
  const pct = withMinorChildren ? rule.exemptPctWithChildren : rule.exemptPct
  const eligible = Math.min(nonNeg(taxableIncome), rule.incomeCap)

  return {
    exemptPct: pct,
    eligibleIncome: r2(eligible),
    exemptAmount: active ? r2(eligible * pct) : 0,
    yearsLeft: lastYear == null ? null : Math.max(0, lastYear - year + 1),
    active,
    lastYear,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Agevolazioni fiscali della società
// ═══════════════════════════════════════════════════════════════════════════

/**
 * La maxi-deduzione sulle nuove assunzioni.
 *
 * È l'agevolazione che nessuno usa perché nessuno sa di averla: assumere a tempo
 * indeterminato dà una deduzione IRES **maggiorata** del 20% (30% per le
 * categorie meritevoli di maggior tutela) sul costo incrementale. Non tocca il
 * conto economico — è extracontabile, si applica in dichiarazione — e non vale
 * ai fini IRAP.
 *
 * La base non è il costo dei nuovi assunti: è il **minore** fra quel costo e
 * l'incremento del costo del personale complessivo. Assumere due persone e
 * lasciarne andare tre non dà nessuna deduzione, ed è giusto così.
 */
export type MaxiDeduction = {
  /** base agevolabile: il minore fra costo dei nuovi e incremento complessivo */
  base: number
  /** quota della base che spetta alle categorie protette */
  protectedBase: number
  /** deduzione in più rispetto al costo già dedotto */
  extraDeduction: number
  /** imposta risparmiata: la deduzione per l'aliquota IRES */
  iresSaving: number
  applies: boolean
  /** perché si applica o perché no, in una riga */
  why: string
}

export function maxiDeduction(i: {
  /** costo del lavoro dei nuovi assunti a tempo indeterminato dell'anno */
  newHiresCost: number
  /** incremento del costo del personale complessivo rispetto all'anno prima */
  payrollIncrease: number
  /** quota del costo dei nuovi che riguarda categorie protette */
  protectedCost: number
  /** i dipendenti a fine anno sono più della media dell'anno prima? */
  headcountIncrease: boolean
  pct: number
  protectedPct: number
  iresPct: number
}): MaxiDeduction {
  const zero = (why: string): MaxiDeduction => ({
    base: 0, protectedBase: 0, extraDeduction: 0, iresSaving: 0, applies: false, why,
  })

  if (i.newHiresCost <= 0) return zero('Nessuna assunzione a tempo indeterminato nell\'anno.')
  if (!i.headcountIncrease) return zero('Serve un incremento occupazionale: a fine anno i dipendenti devono essere più della media dell\'anno prima.')
  if (i.payrollIncrease <= 0) return zero('Il costo del personale non è cresciuto: senza incremento complessivo la base è zero.')

  const base = Math.min(i.newHiresCost, i.payrollIncrease)
  // le due maggiorazioni si applicano pro-quota, non a scelta
  const protectedShare = i.newHiresCost > 0 ? Math.min(1, nonNeg(i.protectedCost) / i.newHiresCost) : 0
  const protectedBase = r2(base * protectedShare)
  const ordinaryBase = r2(base - protectedBase)
  const extra = r2(ordinaryBase * i.pct + protectedBase * i.protectedPct)

  return {
    base: r2(base), protectedBase,
    extraDeduction: extra,
    iresSaving: r2(extra * i.iresPct),
    applies: extra > 0,
    why: i.newHiresCost <= i.payrollIncrease
      ? 'Base = costo dei nuovi assunti: l\'incremento complessivo del costo del personale è più alto.'
      : 'Base = incremento del costo del personale: è più basso del costo dei nuovi assunti e fa da tetto.',
  }
}

/**
 * Iper-ammortamento: la maggiorazione del costo dei beni strumentali 4.0.
 *
 * Sostituisce i crediti d'imposta Transizione 4.0 e 5.0 per gli investimenti dal
 * 2026. Non è cassa immediata come un credito: è una deduzione più alta
 * distribuita sugli anni di ammortamento, e la differenza conta quando si
 * decide **quando** comprare.
 */
export type AmortBand = { upTo: number | null; extraPct: number }

export const HYPER_AMORT_BANDS: AmortBand[] = [
  { upTo: 2_500_000, extraPct: 1.8 },
  { upTo: 10_000_000, extraPct: 1.0 },
  { upTo: 20_000_000, extraPct: 0.5 },
  { upTo: null, extraPct: 0 },
]

export type HyperAmort = {
  investment: number
  /** costo in più che si può dedurre, oltre al costo vero */
  extraCost: number
  /** imposta risparmiata in totale, spalmata sugli anni di ammortamento */
  iresSaving: number
  /** aliquota media di maggiorazione ottenuta */
  effectivePct: number
}

export function hyperAmortization(
  investment: number, iresPct: number, bands: AmortBand[] = HYPER_AMORT_BANDS,
): HyperAmort {
  const amount = nonNeg(investment)
  let extra = 0
  let floor = 0
  for (const b of bands) {
    const ceiling = b.upTo ?? Infinity
    if (amount <= floor) break
    extra += (Math.min(amount, ceiling) - floor) * b.extraPct
    floor = ceiling
  }
  return {
    investment: r2(amount),
    extraCost: r2(extra),
    iresSaving: r2(extra * iresPct),
    effectivePct: amount > 0 ? r2(extra / amount) : 0,
  }
}

// ── Il catalogo delle misure della società ───────────────────────────────────

export type CompanyMeasure = {
  code: string
  label: string
  what: string
  /** su cosa agisce: dove si vede l'effetto */
  lever: 'ires' | 'irap' | 'contributi' | 'credito' | 'persona' | 'iva'
  from: string | null
  to: string | null
  /** quanto vale, a parole: la formula sta nel motore, non qui */
  howMuch: string
  conditions: string[]
  /** il rischio di prenderla male, quando ce n'è uno */
  risk: string | null
  /** non più in vigore: resta per non riproporla e per non dimenticarla */
  expired: boolean
  legalRef: string
  /** true = i numeri girano nella stampa specializzata ma manca la norma attuativa */
  needsCheck: boolean
}

/**
 * Le agevolazioni che una SRL può usare, al 2026.
 *
 * Non è un elenco di consigli fiscali: è la lista di ciò che esiste, con la sua
 * condizione e il suo rischio, da portare al commercialista con i numeri già
 * fatti. Una misura scaduta resta nell'elenco marcata come scaduta: sapere che
 * l'IRES premiale è finita col 2025 evita di metterla nel budget 2026.
 */
export const COMPANY_MEASURES: CompanyMeasure[] = [
  {
    code: 'maxi_deduzione',
    label: 'Maxi-deduzione nuove assunzioni (120% / 130%)',
    what: 'Il costo di un nuovo assunto a tempo indeterminato si deduce maggiorato del 20%, del 30% per le categorie meritevoli di maggior tutela.',
    lever: 'ires',
    from: '2024-01-01', to: '2027-12-31',
    howMuch: '20% o 30% in più di deduzione sul costo incrementale: circa 5-7 € di IRES risparmiata ogni 100 € di costo del nuovo assunto.',
    conditions: [
      'Incremento occupazionale: i dipendenti a tempo indeterminato a fine periodo devono superare la media dell\'anno precedente, e così il totale dei dipendenti.',
      'La base è il minore fra costo dei nuovi assunti e incremento del costo complessivo del personale.',
      'Categorie al 130%: disabili, under 30 ammessi agli incentivi occupazionali, madri con almeno due figli, donne vittime di violenza, ex percettori di reddito di cittadinanza.',
      'È una deduzione extracontabile: non tocca il conto economico, si applica in dichiarazione.',
      'Non vale ai fini IRAP e non spetta a chi è in liquidazione.',
    ],
    risk: 'Se l\'incremento occupazionale si perde nell\'anno, la deduzione si perde con lui.',
    expired: false,
    legalRef: 'D.Lgs. 216/2023, art. 4 · DM 25/6/2024 · prorogata da L. 207/2024',
    needsCheck: true,
  },
  {
    code: 'iper_ammortamento',
    label: 'Iper-ammortamento beni 4.0 (+180%)',
    what: 'Il costo dei beni strumentali tecnologicamente avanzati si deduce maggiorato: +180% fino a 2,5 milioni, +100% fino a 10, +50% fino a 20.',
    lever: 'ires',
    from: '2026-01-01', to: '2028-09-30',
    howMuch: 'Su 20.000 € di investimento agevolabile la maggiorazione è 36.000 € di costo deducibile in più, cioè circa 8.600 € di IRES in meno lungo l\'ammortamento.',
    conditions: [
      'Beni materiali e immateriali 4.0 destinati a strutture produttive in Italia: macchinari, robotica, software, sistemi di intelligenza artificiale, digital twin.',
      'Prodotti in Stati UE o SEE; ammessi anche gli impianti di autoproduzione da rinnovabili.',
      'Comunicazione tramite la piattaforma GSE.',
      'Non cumulabile col credito d\'imposta 4.0 della legge di bilancio 2025 sugli stessi beni; cumulabile con la Nuova Sabatini.',
      'Regolarità contributiva e sicurezza sul lavoro sono condizione di accesso.',
    ],
    risk: 'Cedere o spostare il bene fuori dall\'Italia fa perdere le quote residue, salvo sostituzione con un bene equivalente.',
    expired: false,
    legalRef: 'L. 199/2025 (bilancio 2026)',
    needsCheck: false,
  },
  {
    code: 'ires_premiale',
    label: 'IRES premiale al 20%',
    what: 'Aliquota IRES ridotta dal 24% al 20% per chi accantonava l\'utile, investiva in beni 4.0/5.0 e aumentava l\'occupazione.',
    lever: 'ires',
    from: '2025-01-01', to: '2025-12-31',
    howMuch: 'Valeva 4 punti di IRES sull\'imponibile del solo 2025.',
    conditions: [
      'Non prorogata dalla legge di bilancio 2026: per il 2026 l\'IRES resta al 24%.',
      'Se il 2025 rispettava i requisiti (utile accantonato, investimenti qualificati, incremento occupazionale, nessuna CIG) va ancora rivendicata nella dichiarazione presentata nel 2026.',
    ],
    risk: null,
    expired: true,
    legalRef: 'L. 207/2024, art. 1 co. 436-444',
    needsCheck: false,
  },
  {
    code: 'impatriati',
    label: 'Regime impatriati (rientro dei cervelli)',
    what: 'Chi trasferisce la residenza fiscale in Italia tassa metà del reddito di lavoro per cinque anni, il 40% con un figlio minore.',
    lever: 'persona',
    from: '2024-01-01', to: null,
    howMuch: 'Su 40.000 € di imponibile l\'esenzione al 50% vale circa 6-7.000 € di IRPEF in meno all\'anno, per cinque anni. Il costo aziendale non cambia: cambia il netto.',
    conditions: [
      'Tre periodi d\'imposta di residenza estera; sei o sette se si rientra per lo stesso datore o gruppo.',
      'Elevata qualificazione: laurea, professione regolamentata o cinque anni di esperienza.',
      'Lavoro prestato prevalentemente in Italia.',
      'Impegno a restare residenti quattro anni: uscire prima fa recuperare le imposte con interessi.',
      'Limite di reddito agevolabile: 600.000 € l\'anno.',
    ],
    risk: 'La decadenza è retroattiva: si restituisce tutto il beneficio degli anni passati.',
    expired: false,
    legalRef: 'D.Lgs. 209/2023, art. 5',
    needsCheck: false,
  },
  {
    code: 'premi_risultato',
    label: 'Premi di risultato all\'1%',
    what: 'Il premio legato a obiettivi misurabili sconta l\'imposta sostitutiva all\'1% invece dell\'IRPEF: dal 5% dell\'anno prima all\'1%, con il tetto alzato a 5.000 €.',
    lever: 'persona',
    from: '2026-01-01', to: '2027-12-31',
    howMuch: 'Su un premio di 3.000 € la persona porta a casa circa 900 € in più rispetto a un aumento di pari importo in busta.',
    conditions: [
      'Serve un contratto aziendale o territoriale depositato, con indicatori verificabili di produttività, redditività, qualità o efficienza.',
      'Il risultato deve essere incrementale e misurato su un periodo congruo: senza misurazione è retribuzione ordinaria.',
      'Reddito di lavoro dipendente dell\'anno precedente entro il limite di legge.',
      'Convertito in welfare l\'importo è esente del tutto, anche oltre l\'1%.',
    ],
    risk: 'Un accordo non depositato o indicatori non misurabili fanno decadere la tassazione agevolata a posteriori.',
    expired: false,
    legalRef: 'L. 199/2025 · L. 208/2015, art. 1 co. 182-189',
    needsCheck: false,
  },
  {
    code: 'welfare_fringe',
    label: 'Welfare e fringe benefit esenti',
    what: 'Beni e servizi entro 1.000 € l\'anno — 2.000 € per chi ha figli a carico — non fanno reddito: niente IRPEF, niente contributi, deducibili per l\'azienda.',
    lever: 'persona',
    from: '2025-01-01', to: '2027-12-31',
    howMuch: '1.000 € di welfare arrivano interi; 1.000 € di aumento in busta ne fanno arrivare poco più di metà e costano all\'azienda un terzo in più.',
    conditions: [
      'Le soglie sono per persona e per anno: superarle fa tassare l\'intero importo, non solo l\'eccedenza.',
      'La soglia doppia richiede figli fiscalmente a carico.',
      'I buoni pasto elettronici sono esenti fino a 10 € al giorno dal 2026, i cartacei molto meno.',
    ],
    risk: 'Erogazioni in denaro non rientrano: solo beni, servizi e rimborsi documentati di utenze, affitto o interessi.',
    expired: false,
    legalRef: 'TUIR art. 51 co. 3 · L. 207/2024, art. 1 co. 390-391 · L. 199/2025',
    needsCheck: false,
  },
  {
    code: 'esoneri_assunzioni',
    label: 'Esoneri contributivi sulle assunzioni',
    what: 'Sconti sui contributi a carico azienda per giovani, donne svantaggiate, over 50 e assunzioni nel Mezzogiorno.',
    lever: 'contributi',
    from: null, to: null,
    howMuch: 'Dal 50% dei contributi con tetto 3.000 € l\'anno (under 30 strutturale) fino all\'azzeramento entro 650-800 € al mese sulle misure del 2026.',
    conditions: [
      'Il dettaglio per persona sta nella sezione Personale: qui c\'è solo l\'effetto sulle imposte e sulla cassa.',
      'Quasi tutte richiedono incremento occupazionale netto e regolarità contributiva.',
      'Gli esoneri riducono i contributi ma non l\'INAIL, e non riducono il costo deducibile ai fini della maxi-deduzione.',
    ],
    risk: 'Un licenziamento nei mesi precedenti l\'assunzione può fare decadere l\'incentivo.',
    expired: false,
    legalRef: 'L. 205/2017 · D.L. 60/2024 · L. 199/2025',
    needsCheck: true,
  },
  {
    code: 'patent_box',
    label: 'Patent box (super deduzione 110%)',
    what: 'Le spese di ricerca e sviluppo su software protetto da copyright, brevetti e disegni si deducono maggiorate del 110%.',
    lever: 'ires',
    from: '2021-01-01', to: null,
    howMuch: 'Su 50.000 € di sviluppo interno agevolabile la maggiorazione vale 55.000 € di costo in più deducibile, circa 13.000 € fra IRES e IRAP.',
    conditions: [
      'Serve un bene immateriale giuridicamente tutelato: per il software, il deposito SIAE del programma.',
      'Documentazione idonea per la penalty protection: senza, il rischio in verifica resta intero.',
      'Il meccanismo premiale copre le spese degli otto anni precedenti alla tutela, se il bene ottiene protezione.',
    ],
    risk: 'Senza tutela giuridica del bene l\'agevolazione non esiste: il codice sorgente in sé non basta.',
    expired: false,
    legalRef: 'D.L. 146/2021, art. 6',
    needsCheck: true,
  },
  {
    code: 'credito_rs',
    label: 'Credito d\'imposta ricerca e sviluppo',
    what: 'Credito utilizzabile in compensazione sulle attività di ricerca, innovazione tecnologica e design.',
    lever: 'credito',
    from: null, to: null,
    howMuch: 'Aliquote e tetti cambiano per tipo di attività e per anno: va verificata la misura in vigore prima di programmare la spesa.',
    conditions: [
      'Serve la certificazione tecnica delle attività e la relazione che le descrive.',
      'Le attività devono superare lo stato dell\'arte del settore, non della singola azienda: qui cade la maggior parte delle contestazioni.',
      'Comunicazione al Ministero delle Imprese e perizia asseverata.',
    ],
    risk: 'Il recupero di un credito ritenuto inesistente è la contestazione più costosa che una piccola azienda può prendere.',
    expired: false,
    legalRef: 'L. 160/2019, art. 1 co. 198-208',
    needsCheck: true,
  },
  {
    code: 'nuova_sabatini',
    label: 'Nuova Sabatini',
    what: 'Contributo in conto interessi sui finanziamenti per beni strumentali, digitali e a basso impatto ambientale.',
    lever: 'credito',
    from: null, to: null,
    howMuch: 'Contributo calcolato su un tasso convenzionale, maggiorato per gli investimenti 4.0 e green. Cumulabile con l\'iper-ammortamento.',
    conditions: [
      'Riservata alle PMI, su finanziamento o leasing di durata minima.',
      'Domanda prima dell\'avvio dell\'investimento, tramite la banca o l\'intermediario.',
      'Risorse a sportello: contano i tempi.',
    ],
    risk: null,
    expired: false,
    legalRef: 'D.L. 69/2013, art. 2',
    needsCheck: true,
  },
]

export const measureByCode = (code: string): CompanyMeasure | null =>
  COMPANY_MEASURES.find(m => m.code === code) ?? null

/**
 * Le misure che ha senso guardare oggi, in ordine di utilità.
 *
 * Filtra le scadute, mette davanti quelle di cui il tool ha già i numeri —
 * assunzioni fatte, welfare a piano, sviluppo interno — e tiene per ultime
 * quelle che valgono in astratto. Una lista di dieci agevolazioni tutte uguali
 * non la legge nessuno.
 */
export function relevantMeasures(f: {
  today: string
  newHires: number
  impatriates: number
  hasWelfare: boolean
  rndSpend: number
  investments: number
  zes: boolean
}, list: CompanyMeasure[] = COMPANY_MEASURES): CompanyMeasure[] {
  const score = (m: CompanyMeasure): number => {
    if (m.expired) return -1
    if (m.to && m.to < f.today) return -1
    switch (m.code) {
      case 'maxi_deduzione': return f.newHires > 0 ? 100 : 40
      case 'esoneri_assunzioni': return f.newHires > 0 ? 95 : 35
      case 'impatriati': return f.impatriates > 0 ? 90 : 25
      case 'iper_ammortamento': return f.investments > 0 ? 85 : 45
      case 'welfare_fringe': return f.hasWelfare ? 50 : 80
      case 'premi_risultato': return 60
      case 'patent_box': return f.rndSpend > 0 ? 75 : 20
      case 'credito_rs': return f.rndSpend > 0 ? 70 : 15
      default: return 30
    }
  }
  return list
    .map(m => ({ m, s: score(m) }))
    .filter(x => x.s >= 0)
    .sort((a, b) => b.s - a.s)
    .map(x => x.m)
}

/** Le misure scadute: si mostrano a parte, per non rimetterle nel budget. */
export const expiredMeasures = (today: string, list: CompanyMeasure[] = COMPANY_MEASURES) =>
  list.filter(m => m.expired || (m.to != null && m.to < today))
