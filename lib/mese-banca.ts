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

// ═══════════════════════════════════════════════════════════════════════════
// L'IVA che è passata dal conto
// ═══════════════════════════════════════════════════════════════════════════

export type VatInvoice = { vat: number; total: number }
export type VatLine = { rate: number; applied: boolean; deductible: number; gross: number }

export type VatSources = {
  /** fattura emessa/ricevuta per id: l'IVA vera, scritta sul documento */
  invoices: Map<string, VatInvoice>
  revenue: Map<string, VatLine>
  cost: Map<string, VatLine>
}

/** Movimenti su cui l'IVA non esiste: stipendi, imposte, rate, commissioni. */
const NO_VAT_KINDS = ['stipendio', 'imposta', 'finanziamento', 'commissione']

export type TxVat = {
  /** IVA contenuta nel movimento, per la parte che si sa */
  vat: number
  /** lordo per cui l'IVA è determinata (documento, riga o natura del movimento) */
  basis: number
  via: 'fattura' | 'riga' | 'natura' | null
}

/**
 * Quanta IVA c'è in un movimento, e per quanto del movimento lo si sa.
 *
 * Prima il documento (la fattura agganciata dice l'IVA al centesimo, in
 * proporzione a quanto il movimento ne paga), poi la riga di conto economico
 * (lordo allocato × aliquota), poi la natura (uno stipendio non ha IVA). Quello
 * che resta **non è zero, è sconosciuto**: `basis` dice quanto del movimento è
 * coperto, e il resto si dichiara invece di sommare uno zero plausibile.
 */
export function vatOf(
  t: MTx & { invoice_id?: string | null }, allocs: MAlloc[], src: VatSources,
): TxVat {
  const abs = Math.abs(t.amount)
  if (t.invoice_id) {
    const inv = src.invoices.get(t.invoice_id)
    if (inv && inv.total > 0) {
      const share = Math.min(1, abs / inv.total)
      return { vat: r2(inv.vat * share), basis: abs, via: 'fattura' }
    }
  }
  const side = t.amount > 0 ? 'revenue_line_id' : 'cost_line_id'
  const lines = t.amount > 0 ? src.revenue : src.cost
  const mine = allocs.filter(a => a.tx_id === t.id && a[side])
  const parts = mine.length ? mine.map(a => ({ id: a[side]!, amount: a.amount }))
    : t[side] ? [{ id: t[side]!, amount: abs }] : []
  if (parts.length) {
    let vat = 0, basis = 0
    for (const p of parts) {
      const l = lines.get(p.id)
      if (!l) continue
      const amount = Math.min(p.amount, l.gross > 0 ? l.gross : p.amount)
      basis += amount
      if (l.applied) vat += (amount * l.rate / (1 + l.rate)) * (t.amount < 0 ? l.deductible : 1)
    }
    if (basis > 0) return { vat: r2(vat), basis: r2(Math.min(basis, abs)), via: 'riga' }
  }
  if (NO_VAT_KINDS.includes(t.kind)) return { vat: 0, basis: abs, via: 'natura' }
  return { vat: 0, basis: 0, via: null }
}

export type VatTotals = {
  /** IVA sulle entrate, per la parte nota */
  inVat: number
  /** IVA detraibile sulle uscite, per la parte nota */
  outVat: number
  /** lordo entrato/uscito per cui l'IVA non si sa: va detto, non azzerato */
  inUnknown: number
  outUnknown: number
}

export function vatTotals(txs: (MTx & { invoice_id?: string | null })[], allocs: MAlloc[], src: VatSources): VatTotals {
  let inVat = 0, outVat = 0, inUnknown = 0, outUnknown = 0
  for (const t of txs.filter(counts)) {
    const v = vatOf(t, allocs, src)
    const unknown = Math.max(0, Math.abs(t.amount) - v.basis)
    if (t.amount > 0) { inVat += v.vat; inUnknown += unknown }
    else { outVat += v.vat; outUnknown += unknown }
  }
  return { inVat: r2(inVat), outVat: r2(outVat), inUnknown: r2(inUnknown), outUnknown: r2(outUnknown) }
}

/**
 * La leva dell'IVA: quella incassata dai clienti e uscita dal conto per nessun
 * fornitore, ancora in conto in attesa del versamento. È cassa, non debito
 * fiscale: l'imposta si deve sulle fatture, questa è l'IVA che **è passata**.
 * Si somma dall'inizio del primo trimestre non versato fino a `upTo`.
 */
export function vatLever(
  txs: (MTx & { invoice_id?: string | null })[], allocs: MAlloc[], src: VatSources,
  from: string, upTo: string,
) {
  const within = txs.filter(t => counts(t) && t.booked_on >= from && t.booked_on <= upTo)
  const t = vatTotals(within, allocs, src)
  return { ...t, held: r2(t.inVat - t.outVat), from, upTo }
}

// ═══════════════════════════════════════════════════════════════════════════
// Le voci di un compenso, senza duplicati
// ═══════════════════════════════════════════════════════════════════════════

export type Voce = {
  lineId: string
  reason: string
  month: string | null
  amount: number
  pct: number
  base: number
}

/**
 * Una voce di compenso è «questa riga, per questo motivo, di questo mese»: due
 * voci con la stessa chiave sono lo stesso fatto.
 *
 * Se dicono **la stessa cosa** (stessa quota, stesso importo) sono un doppione:
 * se ne tiene una. Se dicono **cose diverse** sullo stesso fatto sono due
 * pezzi di una voce sola — una provvigione divisa che arriva da due strade —
 * e si sommano. Sommare i doppioni raddoppierebbe un compenso; tenerli entrambi
 * lo scriverebbe due volte: nessuna delle due è un'unione.
 */
export function mergeVoci<T extends Voce>(voci: T[]): T[] {
  const out = new Map<string, T>()
  for (const v of voci) {
    const key = `${v.lineId}|${v.reason}|${v.month ?? ''}`
    const cur = out.get(key)
    if (!cur) { out.set(key, { ...v }); continue }
    const same = Math.abs(cur.amount - v.amount) < 0.005 && Math.abs(cur.pct - v.pct) < 1e-9
    if (same) continue
    out.set(key, { ...cur, amount: r2(cur.amount + v.amount), pct: cur.pct + v.pct })
  }
  return Array.from(out.values())
}
