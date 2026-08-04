/**
 * Il conto corrente — calcoli puri, nessun I/O.
 *
 * Il conto economico dice quanto hai **fatturato** e quanto risulta **incassato**
 * secondo le spunte. Nessuno dei due è il saldo. Il saldo lo dice la banca, e la
 * differenza fra i tre numeri è dove un'azienda in utile resta senza soldi.
 *
 * Tre principi, che spiegano ogni scelta qui sotto.
 *
 * 1. **Un bonifico esiste una volta sola.** I movimenti hanno tre sorgenti — la
 *    banca, una spunta «incassato», una scrittura a mano — e il saldo reale conta
 *    solo la prima. Il saldo *dichiarato* conta anche le altre, ed è un numero
 *    diverso che risponde a una domanda diversa: «quanto avrò quando la banca
 *    registrerà quello che ho già preso». Sommarli darebbe il doppio.
 *
 * 2. **Sul conto passa il lordo.** Il conto economico ragiona per imponibile,
 *    la banca no: una fattura da 1.000 + IVA muove 1.220 €. L'IVA transita, ma
 *    transita *dal conto*, e quei 220 € non sono tuoi nemmeno per un giorno.
 *
 * 3. **La previsione non si scrive, si calcola.** Rate e costi a piano dicono già
 *    cosa entrerà e cosa uscirà: salvarne una copia significa avere due verità sul
 *    futuro, e quando le rate cambiano nessuno riscrive la copia.
 */

const r2 = (n: number) => Math.round(n * 100) / 100
const sum = (ns: number[]) => r2(ns.reduce((a, b) => a + b, 0))

// ═══════════════════════════════════════════════════════════════════════════
// I dati
// ═══════════════════════════════════════════════════════════════════════════

export type TxSource = 'banca' | 'derivato' | 'manuale'

export type TxKind =
  | 'incasso' | 'pagamento' | 'stipendio' | 'imposta'
  | 'commissione' | 'giroconto' | 'finanziamento' | 'altro'

export type BankAccount = {
  id: string
  label: string
  bank_name: string | null
  currency: string
  opening_balance: number
  opening_date: string
  is_primary: boolean
}

export type BankTx = {
  id: string
  account_id: string
  booked_on: string
  value_on: string | null
  /** positivo entra, negativo esce */
  amount: number
  description: string
  counterparty: string | null
  kind: TxKind
  doc_ref: string | null
  source: TxSource
  causal_code?: string | null
  revenue_line_id: string | null
  cost_line_id: string | null
  payslip_id?: string | null
  hr_invoice_id?: string | null
  matched_at: string | null
  no_match_needed: boolean
  note?: string | null
}

/** Una riga del conto economico, per la riconciliazione e la previsione. */
export type PlLineRef = {
  id: string
  month: string
  label: string
  clientName?: string | null
  /** imponibile; il conto muove il lordo */
  net: number
  vatRate: number
  paid: boolean
  invoiced?: boolean
  direction: 'in' | 'out'
}

export const grossOf = (l: Pick<PlLineRef, 'net' | 'vatRate'>) => r2(l.net * (1 + l.vatRate))

// ═══════════════════════════════════════════════════════════════════════════
// Normalizzazione: da «bon.da icuraimpresa s r l saldo fattura nr. f pr 28/26»
// a qualcosa di leggibile e cercabile
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Cosa è questo movimento, e con chi.
 *
 * Gli estratti conto italiani sono scritti per il bollo, non per essere letti:
 * causale numerica, beneficiario in minuscolo dentro un campo libero, riferimenti
 * fattura in cinque formati diversi. Senza questa normalizzazione la lista è
 * illeggibile e la ricerca non trova niente.
 */
export function classify(description: string, amount: number, causal?: string | null): {
  kind: TxKind
  counterparty: string | null
  docRef: string | null
} {
  const d = description.toLowerCase()

  // ── chi ────────────────────────────────────────────────────────────────────
  let who: string | null = null
  /* I token che chiudono il nome vanno chiusi a loro volta con `\b`: senza,
     «leo fatima» si fermava a «leo» perché «fatima» comincia per «fat». */
  const inbound = d.match(/bon\.?\s*da\s+(.+?)(?:\s+(?:saldo|pagamento|pag|fattura|fatt|fat|vs|rif|quota|conferimento|pp|gg\d)\b|$)/)
  const outbound = d.match(/favore\s+([a-z0-9 .'&àèéìòù-]+?)(?:\s{2,}|\s+-\s|notprovide|$)/)
  const sdd = d.match(/sdd core:\s*\S+\s+(.+?)$/)
  if (inbound) who = inbound[1]
  else if (outbound) who = outbound[1]
  else if (sdd) who = sdd[1]

  if (who) {
    who = who.replace(/\s+/g, ' ').trim()
      /* Le sigle arrivano in tre forme nello stesso estratto: «srl», «s.r.l.» e
         «s r l» spaziata. Senza la terza, «icuraimpresa s r l» resta con la coda. */
      .replace(/\b(s\.?\s?r\.?\s?l\.?\s?s?|s\.?\s?p\.?\s?a|societa'? a responsabilita.*|s\.?\s?a\.?\s?s|s\.?\s?n\.?\s?c)\b\.?/g, '')
      .replace(/\s{2,}/g, ' ').trim()
    // Title Case: i nomi in minuscolo si leggono male in una lista
    who = who.split(' ').filter(Boolean)
      .map(w => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w)).join(' ')
    if (who.length < 2) who = null
  }

  // ── il riferimento del documento ───────────────────────────────────────────
  /* Cinque formati veri, visti nello stesso estratto conto: «fattura 1/26»,
     «fattura n. 36», «fatt nr pfr 6/26», «fattura nr. f pr 28/26», «fat- 3-26».
     Si normalizza al numero, che è l'unica parte che il tool conosce. */
  let docRef: string | null = null
  const m = d.match(/fatt?(?:ura)?\.?\s*(?:n(?:r|um)?\.?|nr\.?)?\s*(?:f\s*pr|fpr|pfr)?\s*[-.]?\s*(\d{1,4})\s*(?:\/\s*(\d{2,4}))?/)
  if (m) docRef = m[2] ? `${m[1]}/${m[2]}` : m[1]

  // ── che movimento è ────────────────────────────────────────────────────────
  let kind: TxKind = amount > 0 ? 'incasso' : 'pagamento'
  if (/comm|spese e comm|imposta di bollo|int\. e comp|emissione\/attivazione|competenze/.test(d)) kind = 'commissione'
  else if (/agenzia entrate|i24|f24|inps|erario/.test(d)) kind = 'imposta'
  else if (/beneficiari vari|stipend|cedolin|salari/.test(d)) kind = 'stipendio'
  else if (/quota (nominale|sociale)|conferimento|capitale sociale|finanziamento soci/.test(d)) kind = 'finanziamento'
  else if (/giroconto|two bee societa/.test(d)) kind = 'giroconto'
  else if (causal === '662' || causal === '16H' || causal === '195' || causal === '16K' || causal === '16X') kind = 'commissione'
  else if (causal === '198') kind = 'imposta'

  return { kind, counterparty: who, docRef }
}

/** Un movimento che non ha niente da riconciliare: non deve fare rumore. */
export const isStructural = (t: Pick<BankTx, 'kind'>) =>
  t.kind === 'commissione' || t.kind === 'giroconto' || t.kind === 'finanziamento' || t.kind === 'imposta'

// ═══════════════════════════════════════════════════════════════════════════
// Saldo
// ═══════════════════════════════════════════════════════════════════════════

export type Balance = {
  /** quello che dice la banca: opening + movimenti 'banca' */
  real: number
  /** contando anche gli incassi e i pagamenti dichiarati ma non ancora sull'estratto */
  declared: number
  /** la differenza fra i due, cioè quanto stai dando per fatto */
  pending: number
  /** entrate e uscite dei soli movimenti reali */
  inflow: number
  outflow: number
  /** ultimo movimento reale registrato: dice quanto è aggiornato il saldo */
  lastBookedOn: string | null
}

export function balance(account: Pick<BankAccount, 'opening_balance'>, txs: BankTx[], upTo?: string): Balance {
  const within = (t: BankTx) => !upTo || t.booked_on <= upTo
  const real = txs.filter(t => t.source === 'banca' && within(t))
  const other = txs.filter(t => t.source !== 'banca' && within(t))
  const realSum = sum(real.map(t => t.amount))
  const otherSum = sum(other.map(t => t.amount))

  return {
    real: r2(account.opening_balance + realSum),
    declared: r2(account.opening_balance + realSum + otherSum),
    pending: otherSum,
    inflow: sum(real.filter(t => t.amount > 0).map(t => t.amount)),
    outflow: sum(real.filter(t => t.amount < 0).map(t => t.amount)),
    lastBookedOn: real.length ? real.map(t => t.booked_on).sort().at(-1)! : null,
  }
}

/** La curva del saldo, un punto per movimento: è il grafico dell'app della banca. */
export function runningBalance(
  account: Pick<BankAccount, 'opening_balance' | 'opening_date'>, txs: BankTx[],
): { date: string; balance: number; delta: number }[] {
  const real = txs.filter(t => t.source === 'banca')
    .sort((a, b) => a.booked_on.localeCompare(b.booked_on))
  let run = account.opening_balance
  const out: { date: string; balance: number; delta: number }[] = []
  for (const t of real) {
    run = r2(run + t.amount)
    const last = out.at(-1)
    if (last && last.date === t.booked_on) { last.balance = run; last.delta = r2(last.delta + t.amount) }
    else out.push({ date: t.booked_on, balance: run, delta: t.amount })
  }
  return out
}

// ═══════════════════════════════════════════════════════════════════════════
// Periodi: giorno, settimana, mese, trimestre, anno
// ═══════════════════════════════════════════════════════════════════════════

export type Granularity = 'day' | 'week' | 'month' | 'quarter' | 'year'

/**
 * ISO di una data locale, senza passare da `toISOString()`.
 *
 * `toISOString` converte in UTC: la mezzanotte del 3 agosto in Italia diventa il
 * 2 agosto alle 22, e ogni settimana finiva un giorno prima. È l'errore che si
 * scopre solo con un test su una data vera.
 */
const isoOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Lunedì della settimana di una data, in ISO. Le settimane italiane iniziano lì. */
export function weekStart(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  const day = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - day)
  return isoOf(d)
}

export function bucketKey(iso: string, g: Granularity): string {
  const [y, m] = iso.split('-')
  switch (g) {
    case 'day': return iso
    case 'week': return weekStart(iso)
    case 'month': return `${y}-${m}`
    case 'quarter': return `${y}-T${Math.floor((Number(m) - 1) / 3) + 1}`
    case 'year': return y
  }
}

export function bucketLabel(key: string, g: Granularity): string {
  const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
    'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']
  if (g === 'day') {
    const [y, m, d] = key.split('-')
    return `${Number(d)} ${MESI[Number(m) - 1].slice(0, 3)} ${y}`
  }
  if (g === 'week') {
    const [y, m, d] = key.split('-')
    return `settimana del ${Number(d)} ${MESI[Number(m) - 1].slice(0, 3)} ${y}`
  }
  if (g === 'month') {
    const [y, m] = key.split('-')
    return `${MESI[Number(m) - 1]} ${y}`
  }
  if (g === 'quarter') return key.replace('-T', ' · trimestre ')
  return key
}

export type Bucket = {
  key: string
  label: string
  from: string
  to: string
  inflow: number
  outflow: number
  net: number
  count: number
  /** saldo alla fine del periodo, se la serie parte dall'inizio */
  closing: number | null
}

/**
 * I movimenti raggruppati per periodo.
 *
 * `closing` c'è solo se i movimenti passati gli sono stati dati tutti: un saldo
 * di chiusura calcolato su una finestra parziale è un numero falso, e mostrarlo
 * è peggio che non mostrarlo.
 */
export function buckets(
  txs: BankTx[], g: Granularity,
  opening?: { balance: number; complete: boolean },
): Bucket[] {
  const real = txs.filter(t => t.source === 'banca')
  const map = new Map<string, BankTx[]>()
  for (const t of real) {
    const k = bucketKey(t.booked_on, g)
    map.set(k, [...(map.get(k) ?? []), t])
  }
  let run = opening?.balance ?? 0
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, list]) => {
      const inflow = sum(list.filter(t => t.amount > 0).map(t => t.amount))
      const outflow = sum(list.filter(t => t.amount < 0).map(t => t.amount))
      const net = r2(inflow + outflow)
      run = r2(run + net)
      const dates = list.map(t => t.booked_on).sort()
      return {
        key, label: bucketLabel(key, g),
        from: dates[0], to: dates.at(-1)!,
        inflow, outflow, net, count: list.length,
        closing: opening?.complete ? run : null,
      }
    })
}

/** Due periodi a confronto: la variazione, e quanto vale in percentuale. */
export function compare(now: number, before: number): { delta: number; pct: number | null } {
  const delta = r2(now - before)
  return { delta, pct: before !== 0 ? r2(delta / Math.abs(before)) : null }
}

// ═══════════════════════════════════════════════════════════════════════════
// Riconciliazione
// ═══════════════════════════════════════════════════════════════════════════

export type MatchCandidate = {
  line: PlLineRef
  /** 0..1 — quanto è probabile che sia questa */
  score: number
  /** perché, in una riga: serve a decidere, non a fidarsi */
  why: string[]
}

/**
 * Le righe che potrebbero giustificare un movimento, dalla più probabile.
 *
 * Tre indizi, in ordine di forza: il **numero di fattura** nella descrizione (se
 * c'è, decide quasi da solo), l'**importo lordo** che coincide al centesimo, il
 * **nome del cliente** dentro la causale. La data conta poco: un bonifico di
 * luglio può saldare una fattura di maggio, ed è esattamente il caso che va
 * scoperto.
 *
 * Nessun aggancio automatico sopra una soglia: la riconciliazione la conferma una
 * persona. Un abbinamento sbagliato marca incassata una fattura che nessuno ha
 * pagato, ed è l'errore che questo modulo esiste per evitare.
 */
export function matchCandidates(tx: BankTx, lines: PlLineRef[], tolerance = 0.01): MatchCandidate[] {
  const dir: 'in' | 'out' = tx.amount > 0 ? 'in' : 'out'
  const abs = Math.abs(tx.amount)
  const desc = tx.description.toLowerCase()

  return lines
    .filter(l => l.direction === dir && !l.paid)
    .map(l => {
      const why: string[] = []
      let score = 0

      const gross = grossOf(l)
      if (Math.abs(gross - abs) <= tolerance) { score += 0.5; why.push(`importo lordo esatto (${gross.toFixed(2)})`) }
      else if (Math.abs(l.net - abs) <= tolerance) { score += 0.35; why.push('importo pari all\'imponibile: manca l\'IVA?') }
      else if (Math.abs(gross - abs) / Math.max(gross, 1) < 0.02) { score += 0.15; why.push('importo vicino al lordo') }

      if (tx.doc_ref) {
        const num = tx.doc_ref.split('/')[0]
        // il numero fattura compare nell'etichetta della riga o nel suo riferimento
        if (new RegExp(`(^|[^0-9])${num}([^0-9]|$)`).test(l.label)) {
          score += 0.4; why.push(`numero fattura ${tx.doc_ref} nella riga`)
        }
      }

      const name = (l.clientName ?? '').toLowerCase()
      if (name.length > 3) {
        const parole = name.split(/[^a-z0-9]+/).filter(w => w.length > 3)
        const hit = parole.filter(w => desc.includes(w))
        if (hit.length) { score += 0.25; why.push(`cliente riconosciuto: ${hit.join(' ')}`) }
      }
      const cp = (tx.counterparty ?? '').toLowerCase()
      if (cp && name && (cp.includes(name.split(' ')[0]) || name.includes(cp.split(' ')[0]))) {
        score += 0.15; why.push('controparte coincide')
      }

      return { line: l, score: Math.min(1, r2(score)), why }
    })
    .filter(c => c.score >= 0.3)
    .sort((a, b) => b.score - a.score)
}

/** Movimenti che aspettano una risposta: né agganciati né dichiarati inutili. */
export const unreconciled = (txs: BankTx[]) => txs.filter(t =>
  t.source === 'banca' && !t.no_match_needed && !t.revenue_line_id && !t.cost_line_id
  && !t.payslip_id && !t.hr_invoice_id && !isStructural(t))

// ═══════════════════════════════════════════════════════════════════════════
// Previsione di cassa
// ═══════════════════════════════════════════════════════════════════════════

export type Expected = {
  date: string
  label: string
  amount: number
  kind: 'credito' | 'debito'
  /** true = la scadenza è già passata e non è stato incassato/pagato */
  overdue: boolean
  source: 'riga' | 'rata' | 'piano'
}

export type Forecast = {
  from: string
  balanceStart: number
  items: Expected[]
  /** saldo giorno per giorno, dai movimenti attesi */
  curve: { date: string; balance: number }[]
  /** il primo giorno in cui la cassa va sotto zero, se accade */
  breakEven: string | null
  lowest: { date: string; balance: number } | null
  incoming: number
  outgoing: number
}

/**
 * Il saldo che avrai, se quello che è stato promesso accade.
 *
 * Non è una simulazione: sono le rate già firmate e i costi già a piano. Il
 * valore non sta nel numero finale, sta nel **giorno in cui la curva scende
 * sotto zero**: sapere a marzo che il 12 giugno la cassa non basta cambia le
 * decisioni di marzo.
 *
 * Le scadenze già passate e non incassate restano dentro, datate a oggi: un
 * credito scaduto non è un credito perso, ma non è nemmeno una previsione — è un
 * problema, e va visto in cima alla curva.
 */
export function forecast(
  today: string, balanceStart: number, expected: Expected[], horizonDays = 90,
): Forecast {
  const end = new Date(today + 'T00:00:00')
  end.setDate(end.getDate() + horizonDays)
  const horizon = isoOf(end)

  const items = expected
    .map(e => (e.date < today ? { ...e, date: today, overdue: true } : e))
    .filter(e => e.date <= horizon)
    .sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount)

  let run = balanceStart
  const curve: { date: string; balance: number }[] = [{ date: today, balance: r2(run) }]
  let breakEven: string | null = null
  let lowest: { date: string; balance: number } | null = null

  for (const e of items) {
    run = r2(run + e.amount)
    const last = curve.at(-1)!
    if (last.date === e.date) last.balance = run
    else curve.push({ date: e.date, balance: run })
    if (run < 0 && !breakEven) breakEven = e.date
    if (!lowest || run < lowest.balance) lowest = { date: e.date, balance: run }
  }

  return {
    from: today, balanceStart: r2(balanceStart), items, curve, breakEven, lowest,
    incoming: sum(items.filter(e => e.amount > 0).map(e => e.amount)),
    outgoing: sum(items.filter(e => e.amount < 0).map(e => e.amount)),
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Cosa non torna
// ═══════════════════════════════════════════════════════════════════════════

export type BankFinding = {
  id: string
  severity: 'critico' | 'attenzione' | 'nota'
  title: string
  detail: string
  action?: string
  value?: number
}

export function bankInsights(i: {
  today: string
  bal: Balance
  txs: BankTx[]
  fc: Forecast
  /** crediti scaduti, dal conto economico */
  overdueIn: number
  overdueOut: number
  /** IVA a debito del trimestre in corso, se già calcolata */
  vatDue?: number
}): BankFinding[] {
  const out: BankFinding[] = []
  const eur = (n: number) => `€${Math.round(n).toLocaleString('it-IT')}`

  // ── il saldo è aggiornato? ────────────────────────────────────────────────
  if (i.bal.lastBookedOn) {
    const days = Math.round(
      (new Date(i.today + 'T00:00:00').getTime() - new Date(i.bal.lastBookedOn + 'T00:00:00').getTime()) / 86400000)
    if (days > 7) {
      out.push({
        id: 'stale', severity: days > 20 ? 'attenzione' : 'nota',
        title: `L'ultimo movimento è di ${days} giorni fa`,
        detail: `Il saldo mostrato vale al ${i.bal.lastBookedOn}. Da lì in poi il tool non sa cosa è passato dal conto.`,
        action: 'Carica l\'estratto conto aggiornato: la riconciliazione è utile solo se il conto è recente.',
      })
    }
  }

  // ── quanto stai dando per fatto ───────────────────────────────────────────
  if (Math.abs(i.bal.pending) > 0) {
    out.push({
      id: 'pending', severity: Math.abs(i.bal.pending) > 5000 ? 'attenzione' : 'nota',
      title: `${eur(Math.abs(i.bal.pending))} dichiarati e non ancora sull'estratto conto`,
      detail: i.bal.pending > 0
        ? 'Incassi spuntati nel conto economico che la banca non ha ancora registrato. Se la spunta è ottimista, il saldo dichiarato è più alto del vero.'
        : 'Pagamenti spuntati che dal conto non sono ancora usciti.',
      action: 'Riconcilia i movimenti quando arriva l\'estratto: il derivato si spegne da sé.',
      value: Math.abs(i.bal.pending),
    })
  }

  // ── crediti scaduti ───────────────────────────────────────────────────────
  if (i.overdueIn > 0) {
    out.push({
      id: 'overdue-in', severity: i.overdueIn > i.bal.real ? 'critico' : 'attenzione',
      title: `${eur(i.overdueIn)} di fatture scadute e non incassate`,
      detail: i.overdueIn > i.bal.real
        ? `Sono più del saldo attuale (${eur(i.bal.real)}): l'azienda sta finanziando i propri clienti col proprio conto.`
        : 'Fatture emesse la cui scadenza è passata senza incasso.',
      action: 'Sollecita partendo dalle più vecchie: dopo sessanta giorni la probabilità di incasso crolla.',
      value: i.overdueIn,
    })
  }

  // ── la curva scende sotto zero ────────────────────────────────────────────
  if (i.fc.breakEven) {
    out.push({
      id: 'break-even', severity: 'critico',
      title: `La cassa va sotto zero il ${i.fc.breakEven}`,
      detail: `Partendo da ${eur(i.fc.balanceStart)} e contando le scadenze già firmate, il saldo diventa negativo. Il punto più basso è ${eur(i.fc.lowest?.balance ?? 0)}.`,
      action: 'Anticipa un incasso o sposta un pagamento: da qui si vede quale dei due basta.',
    })
  } else if (i.fc.lowest && i.fc.lowest.balance < i.bal.real * 0.25 && i.fc.lowest.balance > 0) {
    out.push({
      id: 'thin', severity: 'attenzione',
      title: `Il punto più basso della cassa è ${eur(i.fc.lowest.balance)}`,
      detail: `Il ${i.fc.lowest.date} il saldo previsto scende a meno di un quarto di quello attuale. Non è un problema, è poco margine.`,
    })
  }

  // ── l'IVA incassata non è tua ─────────────────────────────────────────────
  if (i.vatDue && i.vatDue > 0 && i.bal.real < i.vatDue) {
    out.push({
      id: 'vat', severity: 'critico',
      title: `${eur(i.vatDue)} di IVA da versare, saldo ${eur(i.bal.real)}`,
      detail: 'L\'IVA che hai incassato è passata dal conto ma non è tua: alla liquidazione esce comunque, e adesso sul conto non c\'è.',
      action: 'Tienila da parte su un conto separato, o smetti di leggerla come liquidità.',
      value: i.vatDue,
    })
  }

  // ── quanto costa la banca ─────────────────────────────────────────────────
  const fees = sum(i.txs.filter(t => t.source === 'banca' && t.kind === 'commissione').map(t => t.amount))
  if (fees < -100) {
    out.push({
      id: 'fees', severity: 'nota',
      title: `${eur(Math.abs(fees))} di commissioni bancarie`,
      detail: `Su ${i.txs.filter(t => t.kind === 'commissione').length} movimenti. Un euro e mezzo per bonifico si nota solo quando si contano insieme.`,
      action: 'Un conto business con i bonifici inclusi si ripaga già a questi volumi.',
      value: Math.abs(fees),
    })
  }

  const order = { critico: 0, attenzione: 1, nota: 2 }
  return out.sort((a, b) => order[a.severity] - order[b.severity] || (b.value ?? 0) - (a.value ?? 0))
}

// ═══════════════════════════════════════════════════════════════════════════
// Analytics
// ═══════════════════════════════════════════════════════════════════════════

export type Counterparty = {
  name: string
  inflow: number
  outflow: number
  net: number
  count: number
  lastOn: string
}

/** Con chi girano i soldi: dieci nomi dicono più di ottanta movimenti. */
export function byCounterparty(txs: BankTx[], direction?: 'in' | 'out'): Counterparty[] {
  const map = new Map<string, Counterparty>()
  for (const t of txs) {
    if (t.source !== 'banca') continue
    if (direction === 'in' && t.amount <= 0) continue
    if (direction === 'out' && t.amount >= 0) continue
    const name = t.counterparty ?? '(non riconosciuto)'
    const cur = map.get(name) ?? { name, inflow: 0, outflow: 0, net: 0, count: 0, lastOn: t.booked_on }
    map.set(name, {
      name,
      inflow: r2(cur.inflow + (t.amount > 0 ? t.amount : 0)),
      outflow: r2(cur.outflow + (t.amount < 0 ? t.amount : 0)),
      net: r2(cur.net + t.amount),
      count: cur.count + 1,
      lastOn: t.booked_on > cur.lastOn ? t.booked_on : cur.lastOn,
    })
  }
  return Array.from(map.values()).sort((a, b) => Math.abs(b.net) - Math.abs(a.net))
}

/** Quanto entra e quanto esce per tipo di movimento. */
export function byKind(txs: BankTx[]): { kind: TxKind; inflow: number; outflow: number; count: number }[] {
  const kinds: TxKind[] = ['incasso', 'pagamento', 'stipendio', 'imposta', 'commissione', 'giroconto', 'finanziamento', 'altro']
  return kinds.map(kind => {
    const list = txs.filter(t => t.source === 'banca' && t.kind === kind)
    return {
      kind,
      inflow: sum(list.filter(t => t.amount > 0).map(t => t.amount)),
      outflow: sum(list.filter(t => t.amount < 0).map(t => t.amount)),
      count: list.length,
    }
  }).filter(k => k.count > 0)
}

/**
 * Giorni medi di incasso: dalla fine del mese di competenza al bonifico.
 *
 * È il numero che dice se il problema è vendere o farsi pagare. Trenta giorni
 * sono un accordo; sessanta sono un prestito che fai tu.
 */
export function daysToCash(pairs: { month: string; bookedOn: string }[]): {
  avg: number | null; worst: number | null; count: number
} {
  const days = pairs.map(p => {
    const due = new Date(p.month + 'T00:00:00')
    due.setMonth(due.getMonth() + 1)   // fine mese di competenza
    return Math.round((new Date(p.bookedOn + 'T00:00:00').getTime() - due.getTime()) / 86400000)
  }).filter(d => d > -90 && d < 400)
  if (!days.length) return { avg: null, worst: null, count: 0 }
  return {
    avg: Math.round(days.reduce((a, b) => a + b, 0) / days.length),
    worst: Math.max(...days),
    count: days.length,
  }
}
