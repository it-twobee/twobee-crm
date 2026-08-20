/**
 * Il registro delle allocazioni, letto dal database. (§297)
 *
 *   npx tsx scripts/verify-allocations.ts
 *
 * Sola lettura. Tre domande, in ordine:
 *   1. quanto di ogni movimento è spiegato, e quanto resta
 *   2. quali righe sono coperte a metà — la forma che un campo solo non vedeva
 *   3. cosa il registro dice di sé stesso (sovra-allocazioni, orfane)
 */
import { readFileSync } from 'fs'
import { eur } from '@/lib/money'
import {
  txCoverage, targetCoverage, findings,
  type Allocation, type AllocTx, type AllocTarget,
} from '@/lib/allocations'

const env = Object.fromEntries(
  readFileSync(`${process.cwd()}/.env.local`, 'utf8').split('\n')
    .map(l => l.match(/^([A-Z_0-9]+)=(.*)$/)).filter(Boolean)
    .map(m => [m![1], m![2].trim().replace(/^["']|["']$/g, '')]))
const URL = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, ''), KEY = env.SUPABASE_SERVICE_ROLE_KEY

async function get<T>(p: string): Promise<T> {
  const r = await fetch(`${URL}/rest/v1/${p}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } })
  if (!r.ok) throw new Error(`${p}: ${r.status} ${await r.text()}`)
  return r.json() as Promise<T>
}
const num = (v: unknown) => (v == null ? 0 : Number(v))
const line = (c = '─') => console.log(c.repeat(78))

async function main() {
  let rows: Record<string, unknown>[]
  try {
    rows = await get<Record<string, unknown>[]>(
      'payment_allocations?select=id,tx_id,amount,evidence,revenue_line_id,cost_line_id,payout_id')
  } catch {
    console.log('\nLa 214 non è ancora eseguita: il registro non esiste.')
    console.log('Finché non c\'è, il legame resta quello diretto — un movimento, una riga.\n')
    return
  }

  const [txs, rev, cost, payouts] = await Promise.all([
    get<Record<string, unknown>[]>('bank_transactions?select=id,booked_on,amount,source,description,counterparty&order=booked_on'),
    get<Record<string, unknown>[]>('pl_revenue_lines?select=id,label,amount_net,vat_rate'),
    get<Record<string, unknown>[]>('pl_cost_lines?select=id,label,actual,budget,vat_applied,vat_rate'),
    get<Record<string, unknown>[]>('pl_payouts?select=id,person_label,kind,amount'),
  ])

  const allocs: Allocation[] = rows.map(r => ({
    id: String(r.id), txId: String(r.tx_id),
    target: r.revenue_line_id ? 'ricavo' : r.cost_line_id ? 'costo' : 'compenso',
    targetId: String(r.revenue_line_id ?? r.cost_line_id ?? r.payout_id),
    amount: num(r.amount),
    evidence: r.evidence === 'dichiarata' ? 'dichiarata' : 'certificata',
  }))

  const grossRev = new Map(rev.map(r => [String(r.id),
    Math.round(num(r.amount_net) * (1 + num(r.vat_rate)) * 100) / 100]))
  const grossCost = new Map(cost.map(c => [String(c.id),
    Math.round((num(c.actual) > 0 ? num(c.actual) : num(c.budget))
      * (c.vat_applied ? 1 + num(c.vat_rate) : 1) * 100) / 100]))
  const grossPay = new Map(payouts.map(p => [String(p.id), num(p.amount)]))
  const nameOf = new Map<string, string>([
    ...rev.map(r => [String(r.id), String(r.label)] as [string, string]),
    ...cost.map(c => [String(c.id), String(c.label)] as [string, string]),
    ...payouts.map(p => [String(p.id), `${p.person_label} — ${p.kind}`] as [string, string]),
  ])
  const grossOf = (t: AllocTarget, id: string) =>
    (t === 'ricavo' ? grossRev : t === 'costo' ? grossCost : grossPay).get(id) ?? null

  // ── 1 · i movimenti ───────────────────────────────────────────────────────
  line('═')
  console.log('1 · QUANTO DI OGNI MOVIMENTO È SPIEGATO')
  line()
  const veri = txs.filter(t => String(t.source) === 'banca')
    .map(t => ({ id: String(t.id), amount: num(t.amount), source: String(t.source), row: t }))
  let spiegato = 0, daSpiegare = 0
  const parziali: typeof veri = []
  for (const t of veri) {
    const c = txCoverage(t as AllocTx, allocs)
    spiegato += c.allocated
    if (c.state === 'parziale') parziali.push(t)
    if (c.state !== 'coperto') daSpiegare += c.remaining
  }
  console.log(`  ${veri.length} movimenti di banca · allocati ${eur(spiegato)} · da spiegare ${eur(daSpiegare)}`)
  console.log(`  ${allocs.length} allocazioni · ${allocs.filter(a => a.evidence === 'certificata').length} certificate`)
  if (parziali.length) {
    console.log(`\n  Movimenti spiegati solo in parte: ${parziali.length}`)
    for (const t of parziali.slice(0, 12)) {
      const c = txCoverage(t as AllocTx, allocs)
      console.log(`   ${String(t.row.booked_on).slice(0, 10)} ${eur(Math.abs(t.amount)).padStart(11)}`
        + ` · allocati ${eur(c.allocated)} · restano ${eur(c.remaining)}`
        + `  ${String(t.row.counterparty ?? t.row.description).slice(0, 34)}`)
    }
  }

  // ── 2 · le righe coperte a metà ───────────────────────────────────────────
  line('═')
  console.log('2 · RIGHE COPERTE SOLO IN PARTE')
  line()
  const perTarget = new Map<string, Allocation[]>()
  for (const a of allocs) {
    const k = `${a.target}|${a.targetId}`
    perTarget.set(k, [...(perTarget.get(k) ?? []), a])
  }
  let mezze = 0
  for (const [k, list] of Array.from(perTarget.entries())) {
    const [target, id] = k.split('|') as [AllocTarget, string]
    const g = grossOf(target, id)
    if (g == null) continue
    const c = targetCoverage(g, target, id, list)
    if (c.state !== 'parziale') continue
    mezze++
    console.log(`   ${eur(c.allocated).padStart(11)} su ${eur(c.gross).padStart(11)}`
      + ` · mancano ${eur(c.remaining).padStart(10)}  ${(nameOf.get(id) ?? id).slice(0, 40)}`)
  }
  if (!mezze) console.log('   nessuna: ogni riga toccata è coperta per intero')

  // ── 3 · cosa non torna ────────────────────────────────────────────────────
  line('═')
  console.log('3 · COSA NON TORNA NEL REGISTRO')
  line()
  const f = findings(veri as AllocTx[], allocs, grossOf)
  if (!f.length) console.log('   niente: il registro è coerente')
  for (const x of f) console.log(`   ${x.severity === 'critico' ? '✗' : '⚠'} ${x.title}\n     ${x.detail}`)
  line('═')
  console.log()
}

main().catch(e => { console.error(e.message); process.exit(1) })
