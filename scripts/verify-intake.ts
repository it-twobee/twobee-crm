/**
 * §303 — I movimenti che un mese non spiega, passati al motore vero.
 *
 *   npx tsx scripts/verify-intake.ts 2026-08-01
 *
 * Sola lettura: dice cosa il dialogo proporrebbe, senza scrivere niente. Serve
 * a guardare la proposta **prima** di premere, che è l'unico modo di accorgersi
 * che una regola sbaglia su venti righe invece che su una.
 */
import { readFileSync } from 'fs'
import { intake, type IntakeTx, type IntakeLine } from '@/lib/month-intake'
import { eur2 } from '@/lib/money'
const env = Object.fromEntries(readFileSync(`${process.cwd()}/.env.local`, 'utf8').split('\n')
  .map(l => l.match(/^([A-Z_0-9]+)=(.*)$/)).filter(Boolean).map(m => [m![1], m![2].trim().replace(/^["']|["']$/g,'')]))
const U = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/,''), K = env.SUPABASE_SERVICE_ROLE_KEY
const get = async <T>(p: string): Promise<T> => {
  const r = await fetch(`${U}/rest/v1/${p}`, { headers: { apikey: K, Authorization: `Bearer ${K}` } })
  if (!r.ok) throw new Error(`${p}: ${await r.text()}`); return r.json() as Promise<T> }
const n = (v: unknown) => v == null ? 0 : Number(v)
async function main() {
const MESE = process.argv[2] ?? '2026-08-01'
const last = new Date(Number(MESE.slice(0,4)), Number(MESE.slice(5,7)), 0)
const to = `${MESE.slice(0,7)}-${String(last.getDate()).padStart(2,'0')}`

const [ms, txs, allocs] = await Promise.all([
  get<{id:string;month:string}[]>('pl_months?select=id,month'),
  get<Record<string,unknown>[]>(`bank_transactions?select=*&source=eq.banca&amount=lt.0&booked_on=gte.${MESE}&booked_on=lte.${to}`),
  get<{tx_id:string;cost_line_id:string|null;amount:number}[]>('payment_allocations?select=tx_id,cost_line_id,amount'),
])
const m = ms.find(x => x.month === MESE)!
const costs = await get<Record<string,unknown>[]>(`pl_cost_lines?select=*&month_id=eq.${m.id}`)
const aT = new Map<string,number>(), aL = new Map<string,number>()
for (const a of allocs) { aT.set(a.tx_id, (aT.get(a.tx_id)??0)+n(a.amount))
  if (a.cost_line_id) aL.set(a.cost_line_id, (aL.get(a.cost_line_id)??0)+n(a.amount)) }

const T: IntakeTx[] = txs.map(t => ({ id:String(t.id), booked_on:String(t.booked_on).slice(0,10),
  amount:n(t.amount), description:String(t.description??''), counterparty:(t.counterparty as string)??null,
  kind:String(t.kind??'altro'), allocated:aT.get(String(t.id))??0, no_match_needed:t.no_match_needed===true }))
const items = await get<{id:string;supplier:string|null}[]>('cost_items?select=id,supplier')
const supplierOf = new Map(items.map(i => [String(i.id), i.supplier ?? '']))
const L: IntakeLine[] = costs.map(c => { const net = n(c.actual)>0?n(c.actual):n(c.budget)
  return { id:String(c.id), label:String(c.label),
    who:[String(c.label), supplierOf.get(String(c.cost_item_id ?? '')) ?? ''].filter(Boolean).join(' '),
    gross: Math.round(net*(c.vat_applied?1+n(c.vat_rate):1)*100)/100, allocated:aL.get(String(c.id))??0 } })

const { rows, summary } = intake(T, L)
console.log(`\n${MESE.slice(0,7)} · ${T.length} uscite di banca · ${L.length} righe di costo\n`)
console.log(`  ${summary.accorpa} da accorpare · ${summary.correggi} da correggere · ${summary.aggiungi} righe nuove · ${summary.ignora} da ignorare`)
console.log(`  ${summary.certi} senza dubbio per ${eur2(summary.certiTotale)} · da spiegare ${eur2(summary.scoperto)}\n`)
for (const r of rows) {
  const dove = r.action === 'accorpa' ? `→ ${r.line!.label.slice(0,34)} ${eur2(r.line!.amount)}`
    : r.action === 'correggi' ? `→ ${r.line!.label.slice(0,26)} sale a ${eur2(r.line!.newGross!)}`
    : r.action === 'aggiungi' ? `→ NUOVA in ${r.draft!.category}` : '→ ignora'
  console.log(`  ${r.sure?'✓':' '} ${r.tx.booked_on.slice(5)} ${eur2(r.free).padStart(11)} ${String(r.tx.counterparty??r.tx.description).slice(0,26).padEnd(27)} ${dove}`)
  if (!r.sure) console.log(`      ${r.why.slice(0,90)}`)
}

}
main().catch(e => { console.error(e.message); process.exit(1) })
