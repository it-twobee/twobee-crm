/**
 * Analitica delle fatture — calcoli puri, nessun I/O.
 *
 * Tre sezioni parlano già di soldi: il **conto economico** dice di chi sono e
 * quando sono maturati, la **banca** dice quando si sono mossi, il **piano dei
 * costi** dice cosa si era previsto. Mancava il documento: la fattura è il fatto
 * fiscale, l'unico che l'erario riconosce, e finché non era nel tool ogni
 * incrocio era una somiglianza — stesso importo, stesso mese, probabilmente la
 * stessa cosa.
 *
 * Qui la fattura diventa il **perno**: ogni riga di ricavo, ogni costo e ogni
 * movimento possono puntarla, e quello che non punta niente si vede. Il valore
 * di questa sezione non sono i totali — quelli li dà anche un foglio — ma le
 * **tre liste di ciò che non combacia**: fatturato senza riga, riga senza
 * fattura, fattura senza incasso.
 *
 * Convenzione unica: una nota di credito è **negativa**. `signed()` è l'unico
 * posto dove si applica il segno, così nessun totale se ne dimentica.
 */

import { eur } from '@/lib/money'

const r2 = (n: number) => Math.round(n * 100) / 100
const sum = (ns: number[]) => r2(ns.reduce((a, b) => a + b, 0))

export type InvoiceDirection = 'emessa' | 'ricevuta'

/** La fattura come la vede l'analitica: quello che serve, non tutto il documento. */
export type Invoice = {
  id: string
  direction: InvoiceDirection
  docType: string
  number: string
  issuedOn: string
  counterpartyName: string
  counterpartyVat: string | null
  clientId: string | null
  taxable: number
  vatAmount: number
  total: number
  sign: 1 | -1
  dueDate: string | null
  paidOn: string | null
  warnings?: string[]
  /** §250 — il documento allegato: PDF o immagine, su storage privato */
  pdfPath?: string | null
  /**
   * §281 — perché questa fattura è **fuori dai conti**: duplicata, stornata,
   * giro fra società collegate. Se c'è, non è un credito da incassare — nessuno
   * telefonerà mai per averla — e non deve stare né fra gli scaduti né fra gli
   * attesi. Non si cancella: esiste, è passata dallo SDI, e il perché sta
   * scritto accanto invece che nella memoria di chi l'ha decisa.
   */
  excludedReason?: string | null
}

/** §281 — dentro i conti: quelle senza una ragione di esclusione. */
export const managed = (i: Pick<Invoice, 'excludedReason'>) => !i.excludedReason

/** L'importo col segno del documento: una nota di credito toglie. */
export const signed = (i: Pick<Invoice, 'sign' | 'taxable'>) => r2(i.sign * i.taxable)
export const signedTotal = (i: Pick<Invoice, 'sign' | 'total'>) => r2(i.sign * i.total)
export const signedVat = (i: Pick<Invoice, 'sign' | 'vatAmount'>) => r2(i.sign * i.vatAmount)

export const monthOf = (iso: string) => `${iso.slice(0, 7)}-01`

// ═══════════════════════════════════════════════════════════════════════════
// I totali
// ═══════════════════════════════════════════════════════════════════════════

export type Totals = {
  count: number
  /** quante sono note di credito: un conteggio che nasconde 4 storni mente */
  credits: number
  taxable: number
  vat: number
  total: number
  collected: number
  outstanding: number
  overdue: number
}

/**
 * I totali di un verso. `collected` guarda `paid_on`, non la data del documento:
 * una fattura emessa a luglio e incassata a settembre è fatturato di luglio e
 * cassa di settembre, ed è la distinzione che rende diverso questo pannello dal
 * conto corrente.
 */
export function totals(invoices: Invoice[], today: string): Totals {
  /* §281 — quelle fuori dai conti non sono crediti: tenerle fra gli scoperti
     gonfiava lo scaduto di 42.456 € e mandava a inseguire soldi che nessuno
     deve. Restano nel conteggio dei documenti, che è un'altra domanda. */
  const paid = invoices.filter(i => i.paidOn && managed(i))
  const open = invoices.filter(i => !i.paidOn && managed(i))
  return {
    count: invoices.length,
    credits: invoices.filter(i => i.sign === -1).length,
    taxable: sum(invoices.map(signed)),
    vat: sum(invoices.map(signedVat)),
    total: sum(invoices.map(signedTotal)),
    collected: sum(paid.map(signedTotal)),
    outstanding: sum(open.map(signedTotal)),
    overdue: sum(open.filter(i => i.dueDate && i.dueDate < today).map(signedTotal)),
  }
}

export type MonthRow = {
  month: string
  issued: number
  received: number
  /** emesso meno ricevuto: non è il margine del conto economico, è il saldo dei documenti */
  net: number
  issuedCount: number
  receivedCount: number
  vatDebit: number
  vatCredit: number
}

/**
 * Mese per mese, i due versi affiancati. Si parte dal primo mese con un
 * documento e non si saltano i vuoti: un mese senza fatture emesse è
 * un'informazione, e in un grafico con i buchi non si vede.
 */
export function byMonth(invoices: Invoice[]): MonthRow[] {
  if (!invoices.length) return []
  const months = invoices.map(i => monthOf(i.issuedOn)).sort()
  const out: MonthRow[] = []
  const cur = new Date(`${months[0]}T00:00:00`)
  const end = new Date(`${months[months.length - 1]}T00:00:00`)

  while (cur <= end) {
    const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-01`
    const own = invoices.filter(i => monthOf(i.issuedOn) === key)
    const em = own.filter(i => i.direction === 'emessa')
    const ri = own.filter(i => i.direction === 'ricevuta')
    out.push({
      month: key,
      issued: sum(em.map(signed)), received: sum(ri.map(signed)),
      net: r2(sum(em.map(signed)) - sum(ri.map(signed))),
      issuedCount: em.length, receivedCount: ri.length,
      vatDebit: sum(em.map(signedVat)), vatCredit: sum(ri.map(signedVat)),
    })
    cur.setMonth(cur.getMonth() + 1)
  }
  return out
}

/**
 * §278 — La serie del fatturato: emesso, incassato, in attesa, previsto.
 *
 * `byMonth` mette a confronto i **due versi** — emesse contro ricevute — che è
 * la domanda dell'archivio. Questa è l'altra: di quello che abbiamo emesso,
 * quanto è **rientrato**, quanto è ancora **credito**, e quanto ne emetteremo
 * da qui a fine anno. Sono le tre cose che si guardano prima di decidere se un
 * mese regge, ed erano leggibili solo sommando a mano tre riquadri diversi.
 *
 * Due regole:
 *
 * **Emesso = incassato + in attesa + stornato, sempre.** La barra si legge come
 * una quantità sola divisa in parti, non come tre da sommare a mente: pieno =
 * rientrato, smorzato = credito ancora aperto, grigio = annullato.
 *
 * **§281 — e nemmeno una fattura fuori dai conti.** Una ISF duplicata o una
 * Tailors emessa due volte non è un credito: nessuno telefonerà mai per averla.
 * Esce dal netto e dall'atteso come una nota di credito, e per la stessa
 * ragione — con la differenza che il perché lo scrive una persona.
 *
 * **§279 — una nota di credito non è credito in attesa.** Ha segno negativo e
 * scalava l'emesso, il che è giusto in dichiarazione ma qui produceva un
 * «fatturato in attesa» negativo: una fattura stornata non è un incasso che
 * deve ancora arrivare, è un incasso che **non arriverà mai** — e le due cose
 * chiedono due azioni diverse, telefonare al cliente o non fare niente.
 * Adesso lo storno ha una parte sua: `credited`, che si vede e non si insegue.
 *
 * **Il previsionale non si mescola col fatto.** Un mese futuro non ha documenti:
 * ha rate firmate, e il grafico le disegna in un'altra forma. Un previsionale
 * pieno accanto a uno storico pieno si legge come storia — è il modo più facile
 * di prendere una previsione per un incasso.
 */
export type BillingPoint = {
  month: string
  /** emesso **netto**: le fatture meno le note di credito, come in dichiarazione */
  issued: number
  /** §279 — quello che è stato emesso prima degli storni: è l'altezza della barra */
  gross: number
  /** §279 — annullato da una nota di credito: non è credito, non si insegue */
  credited: number
  /** §281 — fuori dai conti per scelta: duplicate, giri fra società collegate */
  unmanaged: number
  /** quelle con una data di pagamento: sono rientrate */
  collected: number
  /** emesso lordo meno incassato e meno stornato: credito ancora aperto */
  pending: number
  /** quante fatture ci sono dietro */
  count: number
  /** §176 — quello che i contratti dicono di emettere in un mese futuro */
  forecast: number
  /** true = mese non ancora arrivato: qui vale `forecast`, non `issued` */
  future: boolean
}

export function billingSeries(
  invoices: Invoice[],
  today: string,
  /** dai contratti firmati: quanto si emetterà, mese per mese */
  forecast: { month: string; amount: number }[] = [],
  /** da quando: default il primo mese con un documento */
  from?: string,
): BillingPoint[] {
  const emesse = invoices.filter(i => i.direction === 'emessa')
  const mesiDoc = emesse.map(i => monthOf(i.issuedOn))
  const mesiFc = forecast.map(f => monthOf(f.month))
  if (!mesiDoc.length && !mesiFc.length) return []

  const start = from ?? [...mesiDoc, ...mesiFc].sort()[0]
  /* Fino a **fine anno** del mese più avanti che si conosce: è la domanda
     («quanto fattureremo entro dicembre»), e fermarsi all'ultimo contratto
     nasconderebbe i mesi vuoti, che sono l'informazione. */
  const ultimo = [...mesiDoc, ...mesiFc, monthOf(today)].sort().at(-1)!
  const end = `${ultimo.slice(0, 4)}-12-01`
  const now = monthOf(today)
  const fcOf = new Map<string, number>()
  for (const f of forecast) fcOf.set(monthOf(f.month), r2((fcOf.get(monthOf(f.month)) ?? 0) + f.amount))

  const out: BillingPoint[] = []
  const cur = new Date(`${start}T00:00:00`)
  const stop = new Date(`${end}T00:00:00`)
  while (cur <= stop) {
    const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-01`
    const own = emesse.filter(i => monthOf(i.issuedOn) === key)
    const gross = sum(own.filter(i => i.sign > 0).map(i => i.taxable))
    const credited = sum(own.filter(i => i.sign < 0).map(i => i.taxable))
    /* §281 — fuori dai conti: non sono fatturato e non sono credito. Escono dal
       netto come le note di credito, e per la stessa ragione. */
    const unmanaged = sum(own.filter(i => i.sign > 0 && !managed(i)).map(i => i.taxable))
    const collected = sum(own.filter(i => i.sign > 0 && managed(i) && !!i.paidOn).map(i => i.taxable))
    /* Il resto è quello che si può ancora incassare. Se lo storno supera lo
       scoperto la differenza non è un credito negativo: è una nota che annulla
       una fattura già incassata, e la parte in attesa è semplicemente zero. */
    const pending = r2(Math.max(0, gross - credited - unmanaged - collected))
    out.push({
      month: key, issued: r2(gross - credited - unmanaged), gross, credited, unmanaged,
      collected, pending, count: own.length,
      forecast: fcOf.get(key) ?? 0,
      /* Il mese in corso non è futuro: ha già dei documenti, e quello che manca
         è credito da incassare, non previsione. */
      future: key > now,
    })
    cur.setMonth(cur.getMonth() + 1)
  }
  return out
}

export type PartyRow = {
  name: string
  vat: string | null
  clientId: string | null
  count: number
  taxable: number
  total: number
  outstanding: number
  /** la fattura più recente: dice se il rapporto è vivo */
  last: string
  share: number
}

/**
 * Chi pesa, e quanto. Si raggruppa per **partita IVA** quando c'è, e per nome
 * solo quando manca: lo stesso fornitore scritto in due modi — «OVH SRL» e
 * «Ovh Srl» — sono due righe che non si sommano, e da lì nasce una classifica
 * che non corrisponde a niente.
 */
export function byParty(invoices: Invoice[]): PartyRow[] {
  const map = new Map<string, Invoice[]>()
  for (const i of invoices) {
    const key = i.counterpartyVat?.replace(/\D/g, '') || i.counterpartyName.trim().toUpperCase()
    map.set(key, [...(map.get(key) ?? []), i])
  }
  const grand = sum(invoices.map(signed))
  return Array.from(map.values()).map(rows => {
    const taxable = sum(rows.map(signed))
    return {
      name: rows[0].counterpartyName,
      vat: rows[0].counterpartyVat,
      clientId: rows.find(r => r.clientId)?.clientId ?? null,
      count: rows.length,
      taxable,
      total: sum(rows.map(signedTotal)),
      outstanding: sum(rows.filter(r => !r.paidOn).map(signedTotal)),
      last: rows.map(r => r.issuedOn).sort().at(-1)!,
      share: grand !== 0 ? taxable / grand : 0,
    }
  }).sort((a, b) => b.taxable - a.taxable)
}

export type AgingBucket = {
  key: 'a scadere' | '1-30' | '31-60' | '61-90' | 'oltre 90'
  count: number
  amount: number
}

const BUCKETS: AgingBucket['key'][] = ['a scadere', '1-30', '31-60', '61-90', 'oltre 90']

/**
 * Da quanto aspetta quello che non è stato pagato.
 *
 * Le fasce non sono decorazione: 3.000 € scaduti da dieci giorni sono una
 * telefonata, gli stessi 3.000 scaduti da novanta sono un credito da svalutare,
 * e un totale unico li fa sembrare la stessa cosa. Chi non ha una scadenza
 * finisce in «a scadere» e lo dice il conteggio delle fatture senza data.
 */
export function aging(invoices: Invoice[], today: string): {
  buckets: AgingBucket[]
  total: number
  overdue: number
  noDueDate: number
} {
  const open = invoices.filter(i => !i.paidOn)
  const rows = new Map(BUCKETS.map(k => [k, { key: k, count: 0, amount: 0 }]))
  let noDueDate = 0

  for (const i of open) {
    const amount = signedTotal(i)
    if (!i.dueDate) { noDueDate++; }
    const days = i.dueDate ? daysBetween(i.dueDate, today) : -1
    const key: AgingBucket['key'] =
      days <= 0 ? 'a scadere' : days <= 30 ? '1-30' : days <= 60 ? '31-60' : days <= 90 ? '61-90' : 'oltre 90'
    const b = rows.get(key)!
    b.count++
    b.amount = r2(b.amount + amount)
  }

  const buckets = BUCKETS.map(k => rows.get(k)!)
  return {
    buckets,
    total: sum(open.map(signedTotal)),
    overdue: sum(buckets.filter(b => b.key !== 'a scadere').map(b => b.amount)),
    noDueDate,
  }
}

const DAY = 86400000
export function daysBetween(from: string, to: string): number {
  return Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / DAY)
}

/**
 * Quanto ci mettono a pagarti, davvero.
 *
 * Sulla **mediana** e non sulla media: un cliente che ha saldato dopo otto mesi
 * sposta la media di venti giorni e fa sembrare lento chi paga puntuale. Si
 * contano solo le fatture incassate — quelle aperte non hanno ancora un tempo,
 * e includerle a zero direbbe che tutti pagano subito.
 */
export function paymentDays(invoices: Invoice[]): {
  median: number | null
  onTime: number
  late: number
  sample: number
} {
  const paid = invoices.filter(i => i.paidOn && i.dueDate)
  if (!paid.length) return { median: null, onTime: 0, late: 0, sample: 0 }
  const days = paid.map(i => daysBetween(i.issuedOn, i.paidOn!)).sort((a, b) => a - b)
  const mid = Math.floor(days.length / 2)
  return {
    median: days.length % 2 ? days[mid] : Math.round((days[mid - 1] + days[mid]) / 2),
    onTime: paid.filter(i => i.paidOn! <= i.dueDate!).length,
    late: paid.filter(i => i.paidOn! > i.dueDate!).length,
    sample: paid.length,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// L'incrocio con le altre sezioni
// ═══════════════════════════════════════════════════════════════════════════

/** Una riga di conto economico o una voce di costo, ridotta a ciò che serve. */
export type LineRef = {
  id: string
  kind: 'ricavo' | 'costo'
  month: string
  label: string
  clientId: string | null
  /** imponibile della riga */
  net: number
  vatRate: number
  invoiceId: string | null
}

/** Un movimento di banca, ridotto a ciò che serve. */
export type TxRef = {
  id: string
  bookedOn: string
  /** firmato: negativo se è uscito */
  amount: number
  description: string
  counterparty: string | null
  invoiceId: string | null
}

export type Candidate<T> = { item: T; score: number; why: string[] }

const near = (a: number, b: number, tol = 0.02) => Math.abs(a - b) <= tol

/** Le parole che contano di un nome: «S.R.L.» non distingue nessuno. */
const words = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9à-ù ]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !['srl', 'spa', 'sas', 'snc', 'societa', 'di', 'the', 'srls'].includes(w))

/**
 * Quanto del **nome cercato** compare nel testo, da 0 a 1.
 *
 * Il denominatore sono le parole del nome, non del testo: una causale bancaria
 * è lunga — «bonif. vs. favore - bon.da tailors style srl pag fatt luglio» —
 * e dividere per la sua lunghezza dava 0,17 a un nome presente per intero.
 * Con quella misura nessun bonifico veniva riconosciuto, che è esattamente il
 * caso per cui la funzione esiste.
 *
 * Il confronto è per contenimento perché le banche troncano: «favore gabr» è
 * Gabriele, e pretendere la parola intera scarterebbe metà dell'estratto conto.
 */
function nameScore(name: string, text: string): number {
  const wa = words(name), wb = words(text)
  if (!wa.length || !wb.length) return 0
  const hit = wa.filter(w => wb.some(x => x.includes(w) || w.includes(x))).length
  return hit / wa.length
}

/**
 * Quali righe di conto economico potrebbero essere questa fattura.
 *
 * Il punteggio somma indizi indipendenti e **non decide**: l'aggancio lo conferma
 * una persona, come per la banca (§189). Un abbinamento sbagliato qui è peggio
 * che altrove — dichiara fatturata una riga che non lo è, e poi nessuno lo cerca
 * più perché il conto torna.
 */
export function lineCandidates(inv: Invoice, lines: LineRef[]): Candidate<LineRef>[] {
  const wanted = inv.direction === 'emessa' ? 'ricavo' : 'costo'
  const net = signed(inv)
  const month = monthOf(inv.issuedOn)

  return lines
    .filter(l => l.kind === wanted && !l.invoiceId)
    .map(l => {
      const why: string[] = []
      let score = 0
      if (near(l.net, net)) { score += 50; why.push('imponibile esatto') }
      else if (near(l.net, Math.abs(net), 1)) { score += 30; why.push('imponibile a meno di un euro') }
      if (l.month === month) { score += 25; why.push('stesso mese') }
      else if (Math.abs(monthsApart(l.month, month)) === 1) { score += 10; why.push('mese adiacente') }
      if (inv.clientId && l.clientId === inv.clientId) { score += 25; why.push('stesso cliente') }
      const nm = nameScore(inv.counterpartyName, l.label)
      if (nm >= 0.5) { score += 15; why.push('il nome compare nella riga') }
      return { item: l, score, why }
    })
    .filter(c => c.score >= 50)
    .sort((a, b) => b.score - a.score)
}

/**
 * Quali movimenti bancari potrebbero saldare questa fattura.
 *
 * Sul **lordo**: in banca si muove il totale con l'IVA, e cercare l'imponibile
 * non trova mai niente. Il verso dell'importo deve corrispondere — una fattura
 * emessa si incassa, una ricevuta si paga — perché senza questo controllo un
 * bonifico in uscita dello stesso importo di una fattura attiva risulta il
 * candidato migliore.
 */
export function txCandidates(inv: Invoice, txs: TxRef[]): Candidate<TxRef>[] {
  const gross = signedTotal(inv)
  const wantPositive = inv.direction === 'emessa' ? gross > 0 : gross < 0
  /* Il numero come si legge — «1/26», «FPR 51/26» — e in subordine il solo
     progressivo. Togliere le barre e concatenare le cifre («126») non trova
     niente: nelle causali il numero è scritto come sul documento. Il
     progressivo da solo vale se ha almeno due cifre, altrimenti «1» comparirebbe
     in ogni descrizione che contiene una data. */
  const literal = inv.number.trim().toLowerCase()
  const progressive = inv.number.match(/\d+/)?.[0] ?? ''

  return txs
    .filter(t => !t.invoiceId && (t.amount > 0) === wantPositive)
    .map(t => {
      const why: string[] = []
      let score = 0
      if (near(Math.abs(t.amount), Math.abs(gross))) { score += 55; why.push('importo lordo esatto') }
      else if (near(Math.abs(t.amount), Math.abs(gross), 1)) { score += 35; why.push('importo a meno di un euro') }

      const d = daysBetween(inv.issuedOn, t.bookedOn)
      if (d >= 0 && d <= 120) { score += d <= 45 ? 15 : 5; why.push(`${d} giorni dopo l'emissione`) }
      else if (d < 0) { score -= 20; why.push('movimento precedente alla fattura') }

      const hay = `${t.description} ${t.counterparty ?? ''}`.toLowerCase()
      if (nameScore(inv.counterpartyName, hay) >= 0.5) { score += 20; why.push('la controparte combacia') }
      const found = (literal.length >= 3 && hay.includes(literal))
        || (progressive.length >= 2 && new RegExp(`\\b${progressive}\\b`).test(hay))
      if (found) { score += 20; why.push(`il numero ${inv.number} compare nella causale`) }
      return { item: t, score, why }
    })
    .filter(c => c.score >= 55)
    .sort((a, b) => b.score - a.score)
}

// ═══════════════════════════════════════════════════════════════════════════
// L'aggancio automatico: solo dove non c'è niente da interpretare
// ═══════════════════════════════════════════════════════════════════════════

/**
 * §213 — abbinare **tutte** le fatture ai movimenti, ma solo dove è inequivocabile.
 *
 * `txCandidates` propone e una persona conferma: è la regola giusta per la riga
 * singola, ed è inutilizzabile su settanta documenti e centosettanta movimenti.
 * Qui si fa il contrario — si abbina tutto in un colpo — e il prezzo da pagare è
 * che la soglia diventa **assoluta**, non un punteggio: un abbinamento sbagliato
 * dichiara incassata una fattura che nessuno ha pagato, e da quel momento il
 * conto torna e nessuno lo ricontrolla più.
 *
 * Due livelli, tenuti distinti perché non hanno la stessa forza:
 *
 *  **certo** — importo lordo identico al centesimo, verso corretto, movimento non
 *  precedente alla fattura, e un'identità confermata (il nome della controparte o
 *  il numero del documento nella causale). Deve essere **l'unico** candidato per
 *  quella fattura *e* quella fattura deve essere l'unica per quel movimento: se
 *  due pretendono lo stesso movimento non si sceglie, si lascia lì.
 *
 *  **serie** — N fatture dello stesso soggetto, stesso importo, e N movimenti
 *  altrettanto identici: cinque canoni da 1.300 € allo stesso fornitore. Presi uno
 *  a uno sono ambigui e resterebbero tutti fermi; presi insieme sono lo stesso
 *  fatto ripetuto, e l'unica cosa che l'abbinamento in ordine di data può
 *  sbagliare è **quale** dei cinque è stato pagato quando. Si applica perché il
 *  saldo, l'IVA e lo scaduto tornano comunque, e si dichiara perché quella data
 *  potrebbe essere spostata di un mese.
 *
 * Tutto il resto non si tocca e finisce in `ambigui`, con scritto perché.
 */
export type Pairing = {
  invoiceId: string
  txId: string
  /** la data che la fattura eredita dal movimento */
  paidOn: string
  tier: 'certo' | 'serie'
  why: string[]
}

export type Ambiguous = {
  invoiceId: string
  reason: string
  candidates: number
}

export type MatchRun = {
  pairs: Pairing[]
  ambiguous: Ambiguous[]
  /** fatture per cui nessun movimento ha l'importo giusto */
  unmatched: string[]
}

/** L'importo lordo coincide al centesimo e il verso è quello giusto. */
function hardCandidates(inv: Invoice, txs: TxRef[]): TxRef[] {
  const gross = Math.abs(signedTotal(inv))
  /* Una nota di credito emessa **esce** dal conto, non entra: il segno del
     documento ribalta il verso atteso, ed è il caso in cui un controllo fatto
     solo sulla direzione aggancerebbe un rimborso a un incasso. */
  const wantPositive = (inv.direction === 'emessa') === (signedTotal(inv) > 0)
  return txs.filter(t =>
    !t.invoiceId
    && (t.amount > 0) === wantPositive
    && Math.abs(Math.abs(t.amount) - gross) < 0.005
    && t.bookedOn >= inv.issuedOn)
}

/**
 * Cosa conferma che questo movimento è **questa** fattura, e con quanta forza.
 *
 * Le due prove non pesano uguale. Il **numero del documento nella causale** —
 * «bon.da tailors style srl pag fatt nr pfr 6/26» — lo ha scritto qualcuno
 * guardando quella fattura: è una dichiarazione. Il **nome della controparte** è
 * solo il soggetto giusto, e su un fornitore che fattura ogni mese identifica
 * cinque bonifici su cinque. Tenerle sullo stesso piano faceva perdere un
 * abbinamento certo quando accanto c'erano omonimi dello stesso importo.
 */
const identityOf = (inv: Invoice, t: TxRef): { why: string[]; hasNumber: boolean } => {
  const hay = `${t.description} ${t.counterparty ?? ''}`.toLowerCase()
  const literal = inv.number.trim().toLowerCase()
  const progressive = inv.number.match(/\d+/)?.[0] ?? ''
  const why: string[] = []
  if (nameScore(inv.counterpartyName, hay) >= 0.5) why.push('la controparte combacia')
  const hasNumber = (literal.length >= 3 && hay.includes(literal))
    || (progressive.length >= 2 && new RegExp(`\\b${progressive}\\b`).test(hay))
  if (hasNumber) why.push(`il numero ${inv.number} è nella causale`)
  return { why, hasNumber }
}

export function bankMatching(invoices: Invoice[], txs: TxRef[]): MatchRun {
  const open = invoices.filter(i => !txs.some(t => t.invoiceId === i.id))
  const pairs: Pairing[] = []
  const ambiguous: Ambiguous[] = []
  const unmatched: string[] = []
  const taken = new Set<string>()

  /* ── livello «certo», in due passaggi ────────────────────────────────────
     Prima chi è nominato nella causale, poi chi combacia solo di nome. L'ordine
     conta: la fattura 28/26 di iCura è scritta a mano in un bonifico, e in un
     passaggio unico la perdeva perché accanto c'erano altri due incassi dello
     stesso importo dallo stesso cliente. */
  const passes: { onlyNumber: boolean }[] = [{ onlyNumber: true }, { onlyNumber: false }]

  for (const pass of passes) {
    const strong = new Map<string, { tx: TxRef; why: string[] }[]>()
    for (const inv of open) {
      if (pairs.some(p => p.invoiceId === inv.id)) continue
      const hits = hardCandidates(inv, txs)
        .filter(t => !taken.has(t.id))
        .map(t => ({ t, id: identityOf(inv, t) }))
        .filter(h => (pass.onlyNumber ? h.id.hasNumber : h.id.why.length > 0))
        .map(h => ({ tx: h.t, why: [...h.id.why, 'importo lordo identico'] }))
      strong.set(inv.id, hits)
    }
    /* Quante fatture pretendono ciascun movimento: senza questo conteggio due
       fatture gemelle si prenderebbero lo stesso bonifico, e la seconda
       resterebbe scoperta senza che nessuno se ne accorga. */
    const claims = new Map<string, number>()
    for (const hits of Array.from(strong.values())) {
      if (hits.length === 1) claims.set(hits[0].tx.id, (claims.get(hits[0].tx.id) ?? 0) + 1)
    }
    for (const inv of open) {
      const hits = strong.get(inv.id) ?? []
      if (hits.length !== 1) continue
      const only = hits[0]
      if (claims.get(only.tx.id) !== 1 || taken.has(only.tx.id)) continue
      pairs.push({
        invoiceId: inv.id, txId: only.tx.id, paidOn: only.tx.bookedOn,
        tier: 'certo', why: only.why,
      })
      taken.add(only.tx.id)
    }
  }

  // ── livello «serie»: N documenti gemelli, N movimenti gemelli ───────────────
  const done = new Set(pairs.map(p => p.invoiceId))
  const groups = new Map<string, Invoice[]>()
  for (const inv of open) {
    if (done.has(inv.id)) continue
    const party = inv.counterpartyVat?.replace(/\D/g, '') || inv.counterpartyName.trim().toUpperCase()
    const key = `${party}|${Math.abs(signedTotal(inv)).toFixed(2)}|${inv.direction}|${inv.sign}`
    groups.set(key, [...(groups.get(key) ?? []), inv])
  }

  for (const rows of Array.from(groups.values())) {
    const sorted = [...rows].sort((a, b) => a.issuedOn.localeCompare(b.issuedOn))
    const pool = hardCandidates(sorted[0], txs)
      .filter(t => !taken.has(t.id) && identityOf(sorted[0], t).why.length > 0)
      .sort((a, b) => a.bookedOn.localeCompare(b.bookedOn))

    if (sorted.length === 1) {
      // un documento solo: se ha più di un movimento possibile non si sceglie
      const hits = hardCandidates(sorted[0], txs).filter(t => !taken.has(t.id))
      if (!hits.length) unmatched.push(sorted[0].id)
      else ambiguous.push({
        invoiceId: sorted[0].id,
        reason: hits.length > 1
          ? `${hits.length} movimenti con lo stesso importo e nessuno che nomini la fattura`
          : 'importo giusto ma niente conferma il soggetto',
        candidates: hits.length,
      })
      continue
    }

    if (pool.length === sorted.length) {
      /* Tanti quanti, dello stesso soggetto e dello stesso importo: si appaiano
         in ordine di data. Ogni movimento deve comunque essere successivo alla
         sua fattura, altrimenti la coppia non è un pagamento. */
      const ok = sorted.every((inv, k) => pool[k].bookedOn >= inv.issuedOn)
      if (ok) {
        sorted.forEach((inv, k) => {
          pairs.push({
            invoiceId: inv.id, txId: pool[k].id, paidOn: pool[k].bookedOn,
            tier: 'serie',
            why: [`${sorted.length} documenti identici e altrettanti movimenti, appaiati per data`],
          })
          taken.add(pool[k].id)
        })
        continue
      }
    }

    for (const inv of sorted) {
      const hits = hardCandidates(inv, txs).filter(t => !taken.has(t.id))
      if (!hits.length) unmatched.push(inv.id)
      else ambiguous.push({
        invoiceId: inv.id,
        reason: `${rows.length} documenti identici e ${pool.length} movimenti compatibili: i conti non tornano uno a uno`,
        candidates: hits.length,
      })
    }
  }

  return { pairs, ambiguous, unmatched }
}

function monthsApart(a: string, b: string): number {
  const [y1, m1] = a.slice(0, 7).split('-').map(Number)
  const [y2, m2] = b.slice(0, 7).split('-').map(Number)
  return (y2 - y1) * 12 + (m2 - m1)
}

// ═══════════════════════════════════════════════════════════════════════════
// Cosa non torna
// ═══════════════════════════════════════════════════════════════════════════

export type InvoiceFinding = {
  id: string
  severity: 'critico' | 'attenzione' | 'nota'
  title: string
  detail: string
  action?: string
  value?: number
  /** gli id coinvolti, per accendere le righe nell'elenco */
  refs?: string[]
}



/**
 * Le tre domande che il collegamento fra le sezioni deve saper reggere.
 *
 *   1. **Ho fatturato e non l'ho registrato?** Una fattura emessa senza una riga
 *      di conto economico è fatturato che non entra nel piano compensi: nessuno
 *      prende la provvigione e la cassa risulta più povera del vero.
 *   2. **Ho registrato e non ho fatturato?** Una riga di ricavo senza fattura è
 *      un ricavo che l'erario non ha visto. A fine trimestre l'IVA a debito
 *      calcolata dal conto economico non corrisponde a quella dei documenti.
 *   3. **Ho pagato quello che mi hanno fatturato?** Una fattura ricevuta senza
 *      movimento è un debito che il saldo in banca non prevede.
 *
 * Un mese con **zero** fatture emesse non entra nel confronto: quel mese non è
 * stato caricato, e trattarlo come «tutto mancante» produrrebbe una lista di
 * errori inventati che seppellisce quelli veri.
 */
export function reconciliation(i: {
  invoices: Invoice[]
  lines: LineRef[]
  txs: TxRef[]
  today: string
}): InvoiceFinding[] {
  const out: InvoiceFinding[] = []
  const withDocs = new Set(i.invoices.map(x => monthOf(x.issuedOn)))

  // 1 · fatture senza una riga nel conto economico
  const orphanInvoices = i.invoices.filter(x =>
    x.direction === 'emessa' && !i.lines.some(l => l.invoiceId === x.id))
  if (orphanInvoices.length) {
    out.push({
      id: 'fatture-senza-riga', severity: 'critico',
      title: `${orphanInvoices.length} fatture emesse non hanno una riga di conto economico`,
      detail: `${eur(sum(orphanInvoices.map(signed)))} di imponibile fatturato che non entra nel mese, `
        + 'quindi non genera provvigione, quota ai soci né cassa.',
      action: 'Aggancia ciascuna alla sua riga, o porta il mese dai contratti se non è ancora stato preparato.',
      value: sum(orphanInvoices.map(signed)),
      refs: orphanInvoices.map(x => x.id),
    })
  }

  // 2 · righe di ricavo senza fattura, ma solo nei mesi che hanno documenti
  const orphanLines = i.lines.filter(l =>
    l.kind === 'ricavo' && !l.invoiceId && withDocs.has(l.month))
  if (orphanLines.length) {
    out.push({
      id: 'righe-senza-fattura', severity: 'attenzione',
      title: `${orphanLines.length} righe di ricavo non hanno una fattura`,
      detail: `${eur(sum(orphanLines.map(l => l.net)))} registrati come maturato senza un documento che li copra. `
        + 'L\'IVA a debito del trimestre nasce dalle fatture: se il conto economico ne conta di più, la differenza va spiegata.',
      action: 'Carica le fatture mancanti, oppure aggancia le righe a quelle già presenti.',
      value: sum(orphanLines.map(l => l.net)),
      refs: orphanLines.map(l => l.id),
    })
  }

  // 3 · fatture scadute e non saldate
  const overdue = i.invoices.filter(x => !x.paidOn && x.dueDate && x.dueDate < i.today)
  const inOverdue = overdue.filter(x => x.direction === 'emessa')
  const outOverdue = overdue.filter(x => x.direction === 'ricevuta')
  if (inOverdue.length) {
    out.push({
      id: 'crediti-scaduti', severity: 'critico',
      title: `${inOverdue.length} fatture emesse scadute per ${eur(sum(inOverdue.map(signedTotal)))}`,
      detail: `La più vecchia è del ${inOverdue.map(x => x.dueDate!).sort()[0]}. `
        + 'Sono soldi già fatturati, con l\'IVA già dovuta, che non sono in cassa.',
      action: 'Sollecita, e segna la data di incasso quando arriva.',
      value: sum(inOverdue.map(signedTotal)),
      refs: inOverdue.map(x => x.id),
    })
  }
  if (outOverdue.length) {
    out.push({
      id: 'debiti-scaduti', severity: 'attenzione',
      title: `${outOverdue.length} fatture ricevute scadute per ${eur(sum(outOverdue.map(signedTotal)))}`,
      detail: 'Debiti verso fornitori oltre la scadenza: il saldo in banca sembra più alto di quello disponibile.',
      action: 'Paga o rinegozia, e aggancia il movimento quando esce.',
      value: sum(outOverdue.map(signedTotal)),
      refs: outOverdue.map(x => x.id),
    })
  }

  // 4 · fatture saldate secondo la banca ma senza data di pagamento
  const matchedNotPaid = i.invoices.filter(x =>
    !x.paidOn && i.txs.some(t => t.invoiceId === x.id))
  if (matchedNotPaid.length) {
    out.push({
      id: 'movimento-senza-data', severity: 'nota',
      title: `${matchedNotPaid.length} fatture hanno un movimento in banca ma risultano aperte`,
      detail: 'Il bonifico è agganciato e la fattura non ha una data di pagamento: negli scaduti risulta ancora lì.',
      action: 'Conferma la data dal movimento.',
      refs: matchedNotPaid.map(x => x.id),
    })
  }

  // 5 · il documento stesso non torna
  const broken = i.invoices.filter(x => (x.warnings?.length ?? 0) > 0)
  if (broken.length) {
    out.push({
      id: 'documenti-incoerenti', severity: 'nota',
      title: `${broken.length} documenti con qualcosa che non torna al loro interno`,
      detail: 'Somme, aliquote o scadenze che il file dichiara in modo incoerente. Non impedisce niente, ma va visto prima della dichiarazione.',
      refs: broken.map(x => x.id),
    })
  }

  return out
}

/**
 * §214 — la quadratura mese per mese fra le tre sezioni.
 *
 * È la tabella per cui questa sezione esiste. Ogni mese ha **tre numeri che
 * dovrebbero dire la stessa cosa** e quasi mai la dicono:
 *
 *   · i **documenti** — quanto è stato fatturato, secondo lo SdI
 *   · il **conto economico** — quanto è stato registrato come maturato
 *   · la **banca** — quanto si è mosso, e su quali documenti
 *
 * Fra i primi due la differenza è un errore: sono due letture dello stesso
 * fatto, la competenza. Fra questi e il terzo la differenza è **normale** — si
 * fattura a luglio e si incassa a settembre — e diventa un problema solo quando
 * invecchia, che è quello che dice lo scadenzario.
 *
 * Il collegamento conta quanto gli importi: due numeri uguali con zero righe
 * agganciate sono una coincidenza, non una quadratura. Per questo `linked` sta
 * accanto al totale e non in fondo alla pagina.
 */
export type CoverageRow = {
  month: string
  /** imponibile delle fatture emesse del mese */
  docsIssued: number
  /** imponibile delle righe di ricavo del mese */
  plRevenue: number
  revenueGap: number
  docsReceived: number
  plCost: number
  costGap: number
  issuedCount: number
  issuedLinked: number
  receivedCount: number
  receivedLinked: number
  /** incassato dei documenti di questo mese, dai movimenti agganciati */
  collected: number
}

export function coverage(i: {
  invoices: Invoice[]
  lines: LineRef[]
  txs: TxRef[]
}): CoverageRow[] {
  const months = Array.from(new Set([
    ...i.invoices.map(x => monthOf(x.issuedOn)),
    ...i.lines.map(l => monthOf(l.month)),
  ])).sort()

  const paidIds = new Set(i.txs.filter(t => t.invoiceId).map(t => t.invoiceId!))

  return months.map(month => {
    const docs = i.invoices.filter(x => monthOf(x.issuedOn) === month)
    const em = docs.filter(x => x.direction === 'emessa')
    const ri = docs.filter(x => x.direction === 'ricevuta')
    const rev = i.lines.filter(l => l.kind === 'ricavo' && monthOf(l.month) === month)
    const cost = i.lines.filter(l => l.kind === 'costo' && monthOf(l.month) === month)

    const docsIssued = sum(em.map(signed))
    const plRevenue = sum(rev.map(l => l.net))
    const docsReceived = sum(ri.map(signed))
    const plCost = sum(cost.map(l => l.net))

    return {
      month,
      docsIssued, plRevenue, revenueGap: r2(docsIssued - plRevenue),
      docsReceived, plCost, costGap: r2(docsReceived - plCost),
      issuedCount: em.length,
      issuedLinked: em.filter(x => i.lines.some(l => l.invoiceId === x.id)).length,
      receivedCount: ri.length,
      receivedLinked: ri.filter(x => i.lines.some(l => l.invoiceId === x.id)).length,
      collected: sum(em.filter(x => paidIds.has(x.id)).map(signedTotal)),
    }
  })
}

/**
 * IVA per trimestre, dai documenti.
 *
 * È il controllo incrociato di `lib/vat.ts`, che la calcola dal conto economico:
 * due strade allo stesso numero, e se divergono una delle due sezioni ha una
 * riga che l'altra non ha. Il credito non si riporta qui — quello è mestiere
 * della liquidazione — perché questa è la fotografia dei documenti, non il calcolo
 * del versamento.
 */
export function vatByQuarter(invoices: Invoice[]): {
  quarter: string
  debit: number
  credit: number
  balance: number
}[] {
  const map = new Map<string, { debit: number; credit: number }>()
  for (const i of invoices) {
    const y = i.issuedOn.slice(0, 4)
    const q = Math.floor((Number(i.issuedOn.slice(5, 7)) - 1) / 3) + 1
    const key = `${y}-T${q}`
    const cur = map.get(key) ?? { debit: 0, credit: 0 }
    if (i.direction === 'emessa') cur.debit = r2(cur.debit + signedVat(i))
    else cur.credit = r2(cur.credit + signedVat(i))
    map.set(key, cur)
  }
  return Array.from(map, ([quarter, v]) => ({
    quarter, debit: v.debit, credit: v.credit, balance: r2(v.debit - v.credit),
  })).sort((a, b) => a.quarter.localeCompare(b.quarter))
}
