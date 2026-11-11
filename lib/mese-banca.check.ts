import { lineBank, withBankPaid, monthCash, type MTx, type MAlloc } from './mese-banca'

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

console.log(fail ? `${fail} su ${n} non passano` : `${n} controlli. Tutti i controlli passano.`)
process.exit(fail ? 1 : 0)
