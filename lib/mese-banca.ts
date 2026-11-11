/**
 * Il mese letto dalla banca, non dalle spunte. (Laboratorio)
 *
 * Una riga di conto economico è «incassata» perché qualcuno ha messo una spunta,
 * e la spunta è un'opinione (§226). Qui la domanda è un'altra: **quanto di
 * questa riga è davvero passato dal conto?** La risposta viene dai movimenti
 * veri, riga per riga, e da lì si ricalcola il piano compensi: chi ha lavorato
 * è pagato su ciò che è entrato, non su ciò che è stato spuntato.
 *
 * Puro: nessun I/O. Contano solo i movimenti `banca` e `manuale` — un
 * `derivato` nasce dalla spunta che si sta verificando e non può confermarla —
 * e restano fuori i nascosti (§381) e i giroconti, che non sono né un incasso
 * né una spesa.
 */

const r2 = (n: number) => Math.round(n * 100) / 100
const TOL = 0.01

export type MTx = {
  id: string
  booked_on: string
  /** firmato: negativo se è uscito */
  amount: number
  source: string
  kind: string
  counterparty: string | null
  description: string
  revenue_line_id: string | null
  cost_line_id: string | null
  no_match_needed?: boolean
  hidden_reason?: string | null
  payslip_id?: string | null
  hr_invoice_id?: string | null
  transfer_pair_id?: string | null
}

export type MAlloc = {
  tx_id: string
  revenue_line_id: string | null
  cost_line_id: string | null
  /** lordo, positivo */
  amount: number
}

export type Hit = { txId: string; date: string; amount: number; who: string }

export type LineBank = {
  id: string
  gross: number
  covered: number
  remaining: number
  state: 'scoperta' | 'parziale' | 'coperta' | 'eccedente'
  hits: Hit[]
  /** data dell'ultimo movimento che la copre */
  last: string | null
}

/** Un movimento che dice qualcosa sulla cassa: vero, visibile, non un giro fra conti nostri. */
export const counts = (t: MTx) =>
  (t.source === 'banca' || t.source === 'manuale') && !t.hidden_reason
  && t.kind !== 'giroconto' && !t.transfer_pair_id

const who = (t: MTx) => (t.counterparty ?? t.description ?? '').slice(0, 40)

export function lineBank(
  lines: { id: string; gross: number }[], side: 'entrata' | 'uscita', txs: MTx[], allocs: MAlloc[],
): Map<string, LineBank> {
  const key = side === 'entrata' ? 'revenue_line_id' : 'cost_line_id'
  const txById = new Map(txs.filter(counts).map(t => [t.id, t]))
  const hits = new Map<string, Hit[]>()
  const add = (lineId: string, t: MTx, amount: number) => {
    const cur = hits.get(lineId) ?? []
    if (cur.some(h => h.txId === t.id)) return
    hits.set(lineId, [...cur, { txId: t.id, date: t.booked_on.slice(0, 10), amount: r2(amount), who: who(t) }])
  }
  // Prima le quote (§258): portano l'importo allocato, non quello dell'intero bonifico.
  for (const a of allocs) {
    const lineId = a[key]
    const t = txById.get(a.tx_id)
    if (lineId && t) add(lineId, t, a.amount)
  }
  // Poi il legame per colonna, per i movimenti senza quote.
  for (const t of Array.from(txById.values())) {
    const lineId = t[key]
    if (lineId) add(lineId, t, Math.abs(t.amount))
  }
  const out = new Map<string, LineBank>()
  for (const l of lines) {
    const h = (hits.get(l.id) ?? []).sort((a, b) => a.date.localeCompare(b.date))
    const covered = r2(h.reduce((s, x) => s + x.amount, 0))
    const gross = r2(l.gross)
    out.set(l.id, {
      id: l.id, gross, covered, remaining: r2(Math.max(0, gross - covered)),
      state: covered <= TOL ? 'scoperta' : covered > gross + TOL ? 'eccedente' : covered >= gross - TOL ? 'coperta' : 'parziale',
      hits: h, last: h.length ? h[h.length - 1].date : null,
    })
  }
  return out
}

/**
 * La riga come la vede la banca: pagata se e solo se i movimenti la coprono per
 * intero, con la data dell'ultimo. Una copertura parziale **non** è un incasso:
 * Affinity che paga l'imponibile e non l'IVA lascia la riga aperta, e il
 * compenso aspetta il resto.
 */
export function withBankPaid<T extends { id: string; paid: boolean; paid_on?: string | null }>(
  rows: T[], cov: Map<string, LineBank>,
): T[] {
  return rows.map(r => {
    const c = cov.get(r.id)
    const paid = !!c && (c.state === 'coperta' || c.state === 'eccedente')
    return { ...r, paid, paid_on: paid ? c!.last : null }
  })
}

export type Unexplained = { tx: MTx; free: number }

/**
 * Cosa è passato dal conto nel mese e quanto di questo nessuna riga spiega.
 * `entrato` e `uscito` sono tutto il movimento del mese; `libero*` la parte
 * senza una riga, che è il lavoro di riconciliazione che resta.
 */
export function monthCash(txs: MTx[], allocs: MAlloc[], month: string) {
  const from = month.slice(0, 7)
  const used = new Map<string, number>()
  for (const a of allocs) used.set(a.tx_id, r2((used.get(a.tx_id) ?? 0) + a.amount))
  const inMonth = txs.filter(t => counts(t) && t.booked_on.slice(0, 7) === from)
  const free = (t: MTx): number => {
    if (t.no_match_needed || t.payslip_id || t.hr_invoice_id) return 0
    const linked = used.has(t.id) ? used.get(t.id)! : (t.revenue_line_id || t.cost_line_id) ? Math.abs(t.amount) : 0
    return r2(Math.max(0, Math.abs(t.amount) - linked))
  }
  const entrate = inMonth.filter(t => t.amount > 0)
  const uscite = inMonth.filter(t => t.amount < 0)
  const open = (xs: MTx[]): Unexplained[] =>
    xs.map(tx => ({ tx, free: free(tx) })).filter(x => x.free > TOL).sort((a, b) => b.free - a.free)
  const liberiIn = open(entrate)
  const liberiOut = open(uscite)
  return {
    entrato: r2(entrate.reduce((s, t) => s + t.amount, 0)),
    uscito: r2(uscite.reduce((s, t) => s + Math.abs(t.amount), 0)),
    liberiIn, liberiOut,
    liberoIn: r2(liberiIn.reduce((s, x) => s + x.free, 0)),
    liberoOut: r2(liberiOut.reduce((s, x) => s + x.free, 0)),
    movimenti: inMonth.length,
  }
}
