import { lineBank, withBankPaid, monthCash, vatOf, vatTotals, vatLever, mergeVoci, type MTx, type MAlloc, type VatSources } from './mese-banca'

let fail = 0, n = 0
const ok = (c: boolean, m: string) => { n++; if (!c) { fail++; console.error('✗', m) } }

const tx = (o: Partial<MTx> & { id: string; amount: number }): MTx => ({
  booked_on: '2026-10-12', source: 'banca', kind: 'incasso', counterparty: 'X', description: '',
  revenue_line_id: null, cost_line_id: null, ...o,
})

// riga da 1.000 + 22% = 1.220 lordi
const lines = [{ id: 'A', gross: 1220 }, { id: 'B', gross: 2562 }, { id: 'C', gross: 500 }]
const txs: MTx[] = [
  tx({ id: 't1', amount: 1220, revenue_line_id: 'A' }),
  tx({ id: 't2', amount: 2100, booked_on: '2026-10-23' }),
  tx({ id: 't3', amount: 3000, booked_on: '2026-10-20', source: 'derivato', revenue_line_id: 'C' }),
]
const allocs: MAlloc[] = [{ tx_id: 't2', revenue_line_id: 'B', cost_line_id: null, amount: 2100 }]
const cov = lineBank(lines, 'entrata', txs, allocs)

ok(cov.get('A')!.state === 'coperta', 'A: legame per colonna, importo esatto → coperta')
ok(cov.get('B')!.state === 'parziale' && cov.get('B')!.remaining === 462, 'B: paga 2100 su 2562 → parziale, mancano 462')
ok(cov.get('C')!.state === 'scoperta', 'C: un derivato non certifica → scoperta')

const rows = [
  { id: 'A', paid: false, paid_on: null }, { id: 'B', paid: true, paid_on: '2026-10-15' },
  { id: 'C', paid: true, paid_on: '2026-10-05' },
]
const bank = withBankPaid(rows, cov)
ok(bank[0].paid && bank[0].paid_on === '2026-10-12', 'A: la banca vince sulla spunta mancante, con la sua data')
ok(!bank[1].paid && bank[1].paid_on === null, 'B: spuntata ma parziale → non pagata per i compensi')
ok(!bank[2].paid, 'C: spuntata senza movimento vero → non pagata')

// una quota non va oltre il movimento: due righe dividono un bonifico
const two = lineBank([{ id: 'P', gross: 1000 }, { id: 'Q', gross: 500 }], 'entrata',
  [tx({ id: 'big', amount: 1500 })],
  [{ tx_id: 'big', revenue_line_id: 'P', cost_line_id: null, amount: 1000 }, { tx_id: 'big', revenue_line_id: 'Q', cost_line_id: null, amount: 500 }])
ok(two.get('P')!.state === 'coperta' && two.get('Q')!.state === 'coperta', 'un bonifico, due righe: ognuna coperta per la sua quota')

// il mese: giroconti, nascosti e derivati fuori; il libero è ciò che nessuno spiega
const m = monthCash([
  ...txs,
  tx({ id: 't4', amount: -400, kind: 'pagamento', booked_on: '2026-10-03' }),
  tx({ id: 't5', amount: 5000, kind: 'giroconto' }),
  tx({ id: 't6', amount: -20.99, hidden_reason: 'addebito per errore' }),
  tx({ id: 't7', amount: -100, no_match_needed: true }),
  tx({ id: 't8', amount: 700, booked_on: '2026-09-30' }),
], allocs, '2026-10-01')
ok(m.entrato === 3320, `entrato: ${m.entrato} (1220 + 2100; derivato, giroconto e settembre fuori)`)
ok(m.uscito === 500, `uscito: ${m.uscito} (400 + 100; il nascosto fuori)`)
ok(m.liberoIn === 0, `libero in: ${m.liberoIn} (t1 legato per colonna, t2 per quota)`)
ok(m.liberoOut === 400, `libero out: ${m.liberoOut} (t7 non ha bisogno di riga)`)


// ── IVA ─────────────────────────────────────────────────────────────────────
const src: VatSources = {
  invoices: new Map([['inv1', { vat: 220, total: 1220 }]]),
  revenue: new Map([['A', { rate: 0.22, applied: true, deductible: 1, gross: 1220 }]]),
  cost: new Map([
    ['K', { rate: 0.22, applied: true, deductible: 0.4, gross: 122 }],
    ['N', { rate: 0.22, applied: false, deductible: 1, gross: 100 }],
  ]),
}
type T = MTx & { invoice_id?: string | null }
const v1 = vatOf({ ...tx({ id: 'v1', amount: 1220 }), invoice_id: 'inv1' } as T, [], src)
ok(v1.vat === 220 && v1.via === 'fattura', 'fattura agganciata: IVA scritta sul documento')
const v2 = vatOf({ ...tx({ id: 'v2', amount: 610 }), invoice_id: 'inv1' } as T, [], src)
ok(v2.vat === 110, 'pagamento a metà: metà dell\'IVA')
const v3 = vatOf(tx({ id: 'v3', amount: 1220, revenue_line_id: 'A' }) as T, [], src)
ok(v3.vat === 220 && v3.via === 'riga', 'riga di ricavo: lordo × aliquota/(1+aliquota)')
const v4 = vatOf(tx({ id: 'v4', amount: -122, kind: 'pagamento', cost_line_id: 'K' }) as T, [], src)
ok(v4.vat === 8.8, `costo con detraibilità 40%: ${v4.vat}`)
const v5 = vatOf(tx({ id: 'v5', amount: -100, kind: 'pagamento', cost_line_id: 'N' }) as T, [], src)
ok(v5.vat === 0 && v5.basis === 100, 'costo senza IVA: zero, e lo si sa')
const v6 = vatOf(tx({ id: 'v6', amount: -4077, kind: 'stipendio' }) as T, [], src)
ok(v6.vat === 0 && v6.via === 'natura' && v6.basis === 4077, 'uno stipendio non ha IVA, ed è una certezza')
const v7 = vatOf(tx({ id: 'v7', amount: -300, kind: 'pagamento' }) as T, [], src)
ok(v7.basis === 0 && v7.via === null, 'movimento senza riga né fattura: IVA sconosciuta, non zero')
const vt = vatTotals([tx({ id: 'a', amount: 1220, revenue_line_id: 'A' }), tx({ id: 'b', amount: -300, kind: 'pagamento' }),
  tx({ id: 'c', amount: -122, kind: 'pagamento', cost_line_id: 'K' })] as T[], [], src)
ok(vt.inVat === 220 && vt.outVat === 8.8 && vt.outUnknown === 300 && vt.inUnknown === 0, 'totali: la parte ignota resta dichiarata')
const lv = vatLever([tx({ id: 'a', amount: 1220, revenue_line_id: 'A', booked_on: '2026-10-05' }),
  tx({ id: 'old', amount: 1220, revenue_line_id: 'A', booked_on: '2026-06-05' })] as T[], [], src, '2026-10-01', '2026-11-10')
ok(lv.held === 220, 'leva: conta dal primo trimestre non versato, non da prima')


// ── voci di compenso ────────────────────────────────────────────────────────
const V = (o: Partial<{ lineId: string; reason: string; month: string | null; amount: number; pct: number; base: number }> = {}) =>
  ({ lineId: 'L1', reason: 'erogato', month: '2026-10-01', amount: 100, pct: 0.1, base: 1000, ...o })
ok(mergeVoci([V(), V()]).length === 1 && mergeVoci([V(), V()])[0].amount === 100, 'due voci identiche: un doppione, se ne tiene una')
const sommate = mergeVoci([V({ amount: 60, pct: 0.06 }), V({ amount: 40, pct: 0.04 })])
ok(sommate.length === 1 && sommate[0].amount === 100 && Math.abs(sommate[0].pct - 0.1) < 1e-9, 'stesso fatto, pezzi diversi: si sommano')
ok(mergeVoci([V(), V({ reason: 'provvigione' }), V({ month: '2026-09-01' }), V({ lineId: 'L2' })]).length === 4, 'motivo, mese e riga diversi restano voci distinte')

console.log(fail ? `${fail} su ${n} non passano` : `${n} controlli. Tutti i controlli passano.`)
process.exit(fail ? 1 : 0)
