/**
 * IVA: quanto ne stai accumulando e quando va versata — calcoli puri.
 *
 * Il conto economico dice quanto hai fatturato. L'IVA su quel fatturato non è
 * tua: la incassi dal cliente e la giri allo Stato tre mesi dopo. Chi la legge
 * come cassa disponibile si trova a corto il giorno della liquidazione, ed è il
 * modo più comune in cui un'azienda in utile resta senza soldi.
 *
 * Regime **trimestrale** (quello di TwoBee): la liquidazione si versa entro il
 * 16 del secondo mese successivo al trimestre, con l'eccezione del secondo
 * trimestre che slitta al 20 agosto. Sul dovuto dei primi tre trimestri si paga
 * l'1% di interessi — è il prezzo dell'opzione trimestrale. Il quarto trimestre
 * si chiude con la dichiarazione annuale (16 marzo) e non sconta l'1%.
 *
 * Sono le scadenze ordinarie: proroghe e casi particolari restano da
 * verificare col commercialista, e l'interfaccia lo dice invece di far finta.
 */

export type MonthVat = {
  month: string
  /** IVA sulle vendite: incassata dal cliente, dovuta allo Stato */
  debit: number
  /** IVA sugli acquisti: pagata ai fornitori, si scomputa */
  credit: number
}

export type Quarter = { year: number; q: 1 | 2 | 3 | 4 }

export const quarterOf = (month: string): Quarter => {
  const [y, m] = month.slice(0, 7).split('-').map(Number)
  return { year: y, q: (Math.floor((m - 1) / 3) + 1) as 1 | 2 | 3 | 4 }
}

export const quarterMonths = ({ year, q }: Quarter): string[] =>
  [0, 1, 2].map(i => `${year}-${String((q - 1) * 3 + 1 + i).padStart(2, '0')}-01`)

export const quarterLabel = ({ year, q }: Quarter) => `${q}º trimestre ${year}`

/**
 * Scadenza ordinaria del versamento. Il secondo trimestre slitta al 20 agosto
 * per la proroga estiva; il quarto si liquida con la dichiarazione annuale.
 */
export function deadlineFor({ year, q }: Quarter): { date: string; annual: boolean } {
  if (q === 1) return { date: `${year}-05-16`, annual: false }
  if (q === 2) return { date: `${year}-08-20`, annual: false }
  if (q === 3) return { date: `${year}-11-16`, annual: false }
  return { date: `${year + 1}-03-16`, annual: true }
}

/** L'1% è il costo dell'opzione trimestrale. Sul quarto non si applica. */
const INTEREST = 0.01

/**
 * Sotto i 25,82 € il versamento non si fa: l'importo confluisce nel periodo
 * successivo. Senza questa regola un trimestre da 22 centesimi comparirebbe
 * come una scadenza da rispettare, e la scadenza vera resterebbe nascosta
 * dietro di essa.
 */
const MIN_PAYMENT = 25.82

export type QuarterVat = {
  quarter: Quarter
  label: string
  months: string[]
  debit: number
  credit: number
  /** debito meno credito, prima degli interessi. Negativo = credito a nuovo */
  balance: number
  /**
   * Quello che arriva dal trimestre prima: positivo = credito da scomputare,
   * negativo = debito rinviato perché sotto il minimo di versamento.
   */
  carried: number
  /** debito reale ma sotto i 25,82 €: non si versa, va al trimestre dopo */
  deferred: boolean
  interest: number
  /** quanto esce davvero: zero se il saldo è a credito */
  toPay: number
  deadline: string
  annual: boolean
  /** giorni alla scadenza: negativo = già passata */
  daysLeft: number
  closed: boolean
}

const days = (from: string, to: string) =>
  Math.round((new Date(to + 'T00:00:00').getTime() - new Date(from + 'T00:00:00').getTime()) / 86400000)

const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * Tutti i trimestri toccati dai mesi registrati, in ordine, col credito che si
 * riporta da uno all'altro. Il riporto è la parte che nessun foglio Excel fa e
 * che cambia il numero da versare.
 */
export function vatByQuarter(months: MonthVat[], today: string): QuarterVat[] {
  const byQuarter = new Map<string, MonthVat[]>()
  for (const m of months) {
    const q = quarterOf(m.month)
    const key = `${q.year}-${q.q}`
    byQuarter.set(key, [...(byQuarter.get(key) ?? []), m])
  }

  const keys = Array.from(byQuarter.keys()).sort((a, b) => {
    const [ya, qa] = a.split('-').map(Number)
    const [yb, qb] = b.split('-').map(Number)
    return ya - yb || qa - qb
  })

  let carried = 0
  return keys.map(key => {
    const [year, q] = key.split('-').map(Number)
    const quarter: Quarter = { year, q: q as 1 | 2 | 3 | 4 }
    const rows = byQuarter.get(key)!
    const incoming = carried
    const debit = r2(rows.reduce((s, m) => s + m.debit, 0))
    const credit = r2(rows.reduce((s, m) => s + m.credit, 0))
    const balance = r2(debit - credit - incoming)
    const { date, annual } = deadlineFor(quarter)

    // sotto il minimo il debito non si versa: si porta avanti come debito,
    // non come credito — per questo `carried` ha un segno
    const deferred = balance > 0 && balance < MIN_PAYMENT
    const interest = balance > 0 && !annual && !deferred ? r2(balance * INTEREST) : 0
    const toPay = deferred || balance <= 0 ? 0 : r2(balance + interest)
    carried = balance < 0 ? -balance : deferred ? -balance : 0

    return {
      quarter, label: quarterLabel(quarter), months: quarterMonths(quarter),
      debit, credit, balance, carried: incoming, deferred, interest, toPay,
      deadline: date, annual, daysLeft: days(today, date),
      closed: days(today, date) < 0,
    }
  })
}

/** Il trimestre in cui cade oggi, con quello che c'è da versare. */
export function currentQuarterVat(months: MonthVat[], today: string): QuarterVat | null {
  const q = quarterOf(today)
  return vatByQuarter(months, today).find(x => x.quarter.year === q.year && x.quarter.q === q.q) ?? null
}

/** La prossima scadenza che non è ancora passata, con quanto si porta dietro. */
export function nextDue(months: MonthVat[], today: string): QuarterVat | null {
  const all = vatByQuarter(months, today)
  return all.find(x => !x.closed && x.toPay > 0) ?? all.find(x => !x.closed) ?? null
}

/** L'IVA di un mese: quanto quel mese ha aggiunto al debito verso lo Stato. */
export const monthBalance = (m: MonthVat) => r2(m.debit - m.credit)
