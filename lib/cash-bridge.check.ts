/* Verifica del ponte cassa. Esegui: npx tsx lib/cash-bridge.check.ts */
import { cashBridge, type BridgeMonth, type BridgeTx } from '@/lib/cash-bridge'

let fail = 0
const eq = (label: string, got: number, want: number, tol = 0.01) => {
  const ok = Math.abs(got - want) <= tol
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(54)} ${got.toFixed(2).padStart(12)}${ok ? '' : `  atteso ${want.toFixed(2)}`}`)
}
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(54)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

const m = (o: Partial<BridgeMonth>): BridgeMonth => ({
  month: '2026-07-01', accrued: 10000, collected: 10000, vat: 2200,
  costs: 6000, costsPaid: 6000, costsVatPaid: 1320, distributed: 3000, companyPlan: 1000, ...o,
})
const tx = (o: Partial<BridgeTx>): BridgeTx => ({
  booked_on: '2026-07-10', amount: 0, kind: 'pagamento', source: 'banca', ...o,
})

console.log('\n— Il cumulato: mese per mese, e quanto ne resta —')
{
  const b = cashBridge(
    [m({ month: '2026-06-01', companyPlan: 500 }), m({ month: '2026-07-01', companyPlan: 1000 })],
    [tx({ booked_on: '2026-06-15', amount: 12200, kind: 'incasso' }),
     tx({ booked_on: '2026-06-20', amount: -7320 }),
     tx({ booked_on: '2026-07-15', amount: 12200, kind: 'incasso' }),
     tx({ booked_on: '2026-07-20', amount: -7320 })],
    0)
  is('due mesi in ordine', b.rows.map(r => r.month), ['2026-06-01', '2026-07-01'])
  eq('cassa vera di giugno', b.rows[0].cashNet, 4880)
  eq('cumulato del piano a giugno', b.rows[0].cumPlan, 500)
  eq('cumulato del piano a luglio', b.rows[1].cumPlan, 1500)
  eq('cumulato di cassa a luglio', b.rows[1].cumCash, 9760)
  eq('saldo in banca', b.balance, 9760)
}
{
  // i mesi arrivano in ordine sparso: il cumulato non può dipendere da chi chiama
  const b = cashBridge(
    [m({ month: '2026-07-01', companyPlan: 1000 }), m({ month: '2026-06-01', companyPlan: 500 })],
    [], 0)
  is('riordinati', b.rows.map(r => r.month), ['2026-06-01', '2026-07-01'])
  eq('e il cumulato segue il calendario', b.rows[1].cumPlan, 1500)
}

console.log('\n— I movimenti dichiarati non fanno cassa —')
{
  /* Un movimento «derivato» nasce da una spunta «incassato» e non è passato da
     nessun conto: contarlo qui farebbe tornare il ponte proprio grazie a quello
     che il ponte dovrebbe verificare. */
  const b = cashBridge([m({})], [
    tx({ amount: 12200, kind: 'incasso', source: 'banca' }),
    tx({ amount: 5000, kind: 'incasso', source: 'derivato' }),
    tx({ amount: 999, kind: 'giroconto', source: 'banca' }),
  ], 0)
  eq('solo il movimento vero', b.rows[0].cashIn, 12200)
  eq('e il saldo pure', b.balance, 12200)
}

console.log('\n— Il ponte chiude: ogni differenza ha un nome —')
{
  /* Un mese semplice: 10.000 fatturati e incassati (12.200 lordi), 6.000 di costi
     pagati (7.320 lordi), il piano lascia 1.000 in cassa. In banca sono entrati
     12.200 e usciti 7.320: saldo 4.880. La differenza col piano è l'IVA. */
  const b = cashBridge([m({})], [
    tx({ amount: 12200, kind: 'incasso' }),
    tx({ amount: -7320 }),
  ], 0)
  eq('saldo vero', b.balance, 4880)
  eq('cassa del piano', b.planCum, 1000)
  const iva = b.items.find(i => i.label === 'IVA incassata')!
  eq('l\'IVA incassata è una posta del ponte', iva.amount, 2200)
  /* L'identità è esatta: il piano più le poste fa il saldo, al centesimo. Un
     residuo diverso da zero vorrebbe dire che un movimento non ha una riga che
     lo giustifica — ed è per trovarli che questa vista esiste. */
  eq('il ponte chiude a zero', b.residual, 0)
}

console.log('\n— §286 · il debito e la finestra: due tempi, non due numeri —')
{
  /* La regola che questo blocco protegge: **la posta del ponte è il maturato**,
     e non è una preferenza. `companyPlan` vale `maturato − distribuito − costi`,
     quindi rimettere qualcosa di diverso da `distribuito − uscito` sposta il
     residuo di quella differenza e gli toglie ogni significato. Quello che si
     può erogare adesso è un'altra domanda, e si legge accanto. */
  const b = cashBridge([m({ distributed: 3000 })], [
    tx({ amount: 12200, kind: 'incasso' }),
    tx({ amount: -7320 }),
  ], 0, { payableNow: 1200 })
  eq('il ponte chiude a zero anche con la finestra dichiarata', b.residual, 0)
  const posta = b.items.find(i => i.label === 'Compensi maturati e non pagati')!
  eq('la posta resta il maturato: è quello che l\'identità richiede', posta.amount, 3000)
  eq('il debito totale', b.payouts.owed, 3000)
  eq('di cui erogabile adesso, dalla finestra', b.payouts.payableNow, 1200)
  eq('e il resto quando i clienti pagano', b.payouts.later, 1800)

  /* Un bonifico ai soci riduce il debito. Quanto resti erogabile lo dice il
     registro dei compensi, non il ponte: qui si mostra e basta. */
  const c = cashBridge([m({ distributed: 3000 })], [
    tx({ amount: 12200, kind: 'incasso' }),
    tx({ amount: -7320 }),
    tx({ amount: -1000, kind: 'finanziamento' }),
  ], 0, { payableNow: 200 })
  eq('il bonifico abbassa il debito', c.payouts.owed, 2000)
  eq('e la parte erogabile', c.payouts.payableNow, 200)
  eq('il resto non si muove', c.payouts.later, 1800)
  eq('e il ponte chiude lo stesso', c.residual, 0)

  /* Erogato più di quanto fosse erogabile: la parte «adesso» non va sotto zero
     — un anticipo non è un debito negativo, è debito che resta e basta. */
  const d = cashBridge([m({ distributed: 3000 })], [
    tx({ amount: 12200, kind: 'incasso' }),
    tx({ amount: -7320 }),
    tx({ amount: -2000, kind: 'finanziamento' }),
  ], 0, { payableNow: 2500 })
  /* L'erogabile non supera mai il dovuto: se il registro dicesse di più, è il
     dovuto a decidere — non si può erogare quello che non si deve. */
  eq('l\'erogabile non supera il dovuto', d.payouts.payableNow, 1000)
  eq('ma il debito resta', d.payouts.owed, 1000)

  /* Senza `payable` la ripartizione non si inventa: la lettura resta quella di
     prima, e il ponte non cambia di un centesimo. */
  const e = cashBridge([m({ distributed: 3000 })], [
    tx({ amount: 12200, kind: 'incasso' }),
    tx({ amount: -7320 }),
  ], 0)
  eq('senza il registro non si inventa niente', e.payouts.payableNow, 0)
  eq('e il ponte è identico', e.residual, 0)
}

console.log('\n— Le poste: soci, imposte, oneri —')
{
  const b = cashBridge([m({ collected: 10000, costsPaid: 6000, companyPlan: 1000 })], [
    tx({ amount: 12200, kind: 'incasso' }),
    tx({ amount: -7320 }),
    tx({ amount: 2500, kind: 'finanziamento' }),
    tx({ amount: -3000, kind: 'finanziamento' }),
    tx({ amount: -941.42, kind: 'imposta' }),
    tx({ amount: -41.08, kind: 'commissione' }),
  ], 1000)
  const get = (l: string) => b.items.find(i => i.label === l)?.amount ?? 0
  eq('conferimenti dei soci', get('Conferimenti dei soci'), 2500)
  /* Il piano destinava 3.000 di compensi e in banca ne sono usciti 3.000: la posta
     è zero, ed è giusto che non compaia. Quando non torna, la differenza è quello
     che i soci devono ancora ricevere. */
  eq('compensi maturati e pagati: nessuna posta', get('Compensi maturati e non pagati'), 0)
  eq('imposte', get('Imposte e F24'), -941.42)
  eq('oneri bancari', get('Oneri bancari'), -41.08)
  eq('saldo di apertura', get('Saldo di apertura'), 1000)
  eq('il saldo comprende tutto', b.balance, 1000 + 12200 - 7320 + 2500 - 3000 - 941.42 - 41.08)
  eq('e il ponte chiude anche con soci, imposte e oneri', b.residual, 0)
}
{
  /* Crediti e debiti: competenza sì, cassa non ancora. I movimenti in banca sono
     coerenti con l'incassato e il pagato — 4.880 lordi dentro, 1.220 fuori — e
     nessun compenso è ancora uscito. */
  const b = cashBridge(
    [m({ accrued: 10000, collected: 4000, costs: 6000, costsPaid: 1000, costsVatPaid: 220 })],
    [tx({ amount: 4880, kind: 'incasso' }), tx({ amount: -1220 })], 0)
  const get = (l: string) => b.items.find(i => i.label === l)?.amount ?? 0
  eq('crediti non incassati: abbassano la cassa', get('Crediti non incassati'), -6000)
  eq('debiti non pagati: la alzano', get('Debiti non pagati'), 5000)
  eq('IVA solo sulla parte incassata', get('IVA incassata'), 2200 * 0.4)
  eq('e il ponte chiude comunque', b.residual, 0)
}
{
  // un mese senza ricavi non divide per zero
  const b = cashBridge([m({ accrued: 0, collected: 0, vat: 0 })], [], 0)
  eq('nessun ricavo, nessuna IVA', b.items.find(i => i.label === 'IVA incassata')?.amount ?? 0, 0)
}

console.log('\n— Senza mesi e senza movimenti non si inventa niente —')
{
  const b = cashBridge([], [], 0)
  is('nessuna riga', b.rows.length, 0)
  eq('saldo zero', b.balance, 0)
  eq('residuo zero', b.residual, 0)
}

console.log('\n— Un movimento che nessuna riga giustifica non passa inosservato —')
{
  /* È il caso per cui la vista esiste: un pagamento in banca senza una riga di
     costo pagata che lo spieghi. Il residuo lo dice, invece di sparire. */
  const b = cashBridge([m({})], [
    tx({ amount: 12200, kind: 'incasso' }),
    tx({ amount: -7320 }),
    tx({ amount: -500 }),   // ← nessuna riga di costo lo giustifica
  ], 0)
  eq('il residuo è esattamente il movimento non spiegato', b.residual, -500)
}

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)
